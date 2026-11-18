package io.screentrace.parser.jsp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.core.StableGraphIds;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.StringReader;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

/**
 * Code the application runs without a screen (ADR 0159): {@code @Scheduled} methods, event
 * listeners, and startup runners. Each becomes a HANDLER with a {@code trigger} attribute and a
 * plain-language {@code triggerText}, so the backend call chains (ADR 0156) and the report can show
 * what it does. Nothing is executed; a schedule read from a placeholder is the default the source
 * or the base configuration states, marked INFERRED, because a profile or an environment variable
 * may replace it at run time.
 */
public final class BackgroundJobs {
  public static final String PARSER = "BackgroundJobs";
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([^:}]+)(?::(.*))?}");
  private static final Set<String> STARTUP_EVENTS =
      Set.of("ApplicationReadyEvent", "ApplicationStartedEvent", "ContextRefreshedEvent");
  private static final Set<String> RUNNERS = Set.of("ApplicationRunner", "CommandLineRunner");
  private static final List<String> MARKERS =
      List.of(
          "Scheduled",
          "EventListener",
          "ApplicationRunner",
          "CommandLineRunner",
          "publishEvent",
          "Async",
          "Scheduler",
          "ScheduledExecutorService",
          "quartz",
          "QuartzJobBean",
          "JobExecutionContext");
  private static final Set<String> SCHEDULE_CALLS =
      Set.of("schedule", "scheduleAtFixedRate", "scheduleWithFixedDelay");

  /** A method some other code schedules (XML, a scheduler call, a Quartz trigger), ADR 0171. */
  private record Remote(
      String type,
      String method,
      String trigger,
      Value value,
      String expression,
      SourceLocation source) {}

  public record Setting(String file, int line, String raw) {}

  /** A value read from an annotation: its words, how sure, and what else may change it. */
  private record Value(String text, ResolutionStatus status, List<String> notes, String property) {}

  private record Job(
      String file,
      String qualified,
      String simple,
      MethodDeclaration method,
      String trigger,
      List<String> texts,
      List<String> expressions,
      ResolutionStatus status,
      List<String> notes,
      String property,
      String eventType) {}

  private record Publisher(String eventType, String from, SourceLocation source) {}

  private BackgroundJobs() {}

  public static ApplicationGraph enrich(ApplicationGraph graph, ProjectInventory inventory) {
    Map<String, List<Setting>> settings = settings(inventory);
    List<Job> jobs = new ArrayList<>();
    List<Publisher> publishers = new ArrayList<>();
    List<Remote> remotes = new ArrayList<>();
    Map<String, Path> javaBySimple = new TreeMap<>();
    for (Path file : inventory.javaFiles())
      javaBySimple.putIfAbsent(file.getFileName().toString().replaceAll("\\.java$", ""), file);
    boolean schedulingEnabled = false, asyncEnabled = false;
    for (Path file : inventory.javaFiles()) {
      String code, relative = inventory.root().relativize(file).toString().replace('\\', '/');
      try {
        code =
            SafeProjectFiles.readUtf8Limited(
                inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
      } catch (Exception unreadable) {
        continue; // the other analyzers report files they cannot read
      }
      if (code.contains("EnableScheduling")) schedulingEnabled = true;
      if (code.contains("EnableAsync")) asyncEnabled = true;
      if (MARKERS.stream().noneMatch(code::contains)) continue;
      CompilationUnit unit;
      try {
        unit = JavaSources.parse(code);
      } catch (Exception unparsable) {
        continue;
      }
      read(unit, relative, settings, jobs, publishers);
      remotes.addAll(scheduledElsewhere(unit, relative, settings));
    }
    for (Path file : inventory.files())
      if (file.getFileName().toString().endsWith(".xml")
          && SafeProjectFiles.mayContainAscii(inventory.root(), file, "annotation-driven")
          && SafeProjectFiles.mayContainAscii(inventory.root(), file, "/schema/task"))
        schedulingEnabled = true;
    for (Path file : inventory.files())
      if (file.getFileName().toString().endsWith(".xml")
          && SafeProjectFiles.mayContainAscii(inventory.root(), file, "scheduled-tasks")) {
        remotes.addAll(xmlSchedules(inventory, file, settings));
        schedulingEnabled = true;
      }
    jobs.addAll(resolve(remotes, jobs, javaBySimple, inventory));
    if (jobs.isEmpty()) return graph;

    Map<String, GraphNode> nodes = new TreeMap<>();
    graph.nodes().forEach(n -> nodes.put(n.id(), n));
    for (Job job : jobs) {
      String id =
          StableGraphIds.handler(
              job.file(), job.qualified(), job.method().getSignature().asString());
      int line = job.method().getBegin().map(p -> p.line).orElse(1);
      var source = new SourceLocation(job.file(), line);
      List<String> notes = new ArrayList<>(job.notes());
      ResolutionStatus status = job.status();
      if (job.trigger().equals("ASYNC") && !asyncEnabled) {
        notes.add("專案中找不到 @EnableAsync，可能不會非同步執行");
        if (status == ResolutionStatus.CONFIRMED) status = ResolutionStatus.INFERRED;
      }
      if (job.trigger().equals("SCHEDULE")
          && !schedulingEnabled
          && job.expressions().stream().anyMatch(e -> e.startsWith("@Scheduled"))) {
        notes.add("專案中找不到 @EnableScheduling 或 <task:annotation-driven>，排程可能沒有啟用");
        if (status == ResolutionStatus.CONFIRMED) status = ResolutionStatus.INFERRED;
      }
      Map<String, String> attributes = new TreeMap<>();
      GraphNode existing = nodes.get(id);
      if (existing != null) attributes.putAll(existing.attributes());
      attributes.putIfAbsent("class", job.qualified());
      attributes.putIfAbsent("method", job.method().getNameAsString());
      attributes.put("trigger", job.trigger());
      attributes.put("triggerText", String.join("；", job.texts()));
      attributes.put("triggerExpression", String.join("\n", job.expressions()));
      if (!notes.isEmpty()) attributes.put("triggerNote", String.join("；", notes));
      if (job.property() != null) attributes.put("triggerProperty", job.property());
      if (job.eventType() != null) {
        attributes.put("eventType", job.eventType());
        var from =
            publishers.stream()
                .filter(p -> p.eventType().equals(job.eventType()))
                .sorted(
                    Comparator.comparing(Publisher::from)
                        .thenComparing(p -> p.source().file())
                        .thenComparingInt(p -> p.source().line()))
                .map(
                    p -> {
                      Map<String, Object> row = new LinkedHashMap<>();
                      row.put("from", p.from());
                      row.put(
                          "source", Map.of("file", p.source().file(), "line", p.source().line()));
                      return row;
                    })
                .toList();
        if (!from.isEmpty()) attributes.put("eventPublishers", json(from));
      }
      List<AnalysisEvidence> evidence =
          new ArrayList<>(existing == null ? List.of() : existing.evidence());
      evidence.add(
          new AnalysisEvidence(source, PARSER, status, String.join("\n", job.expressions())));
      Confidence confidence =
          existing != null
              ? existing.confidence()
              : status == ResolutionStatus.CONFIRMED
                  ? Confidence.CONFIRMED
                  : status == ResolutionStatus.UNRESOLVED
                      ? Confidence.UNRESOLVED
                      : Confidence.INFERRED;
      nodes.put(
          id,
          new GraphNode(
              id,
              NodeType.HANDLER,
              existing != null
                  ? existing.name()
                  : job.simple() + "." + job.method().getNameAsString() + "()",
              attributes,
              existing != null ? existing.source() : source,
              confidence,
              evidence.stream().distinct().sorted().toList(),
              existing == null ? null : existing.audience()));
    }
    return new ApplicationGraph(
        graph.application(),
        new ArrayList<>(nodes.values()),
        graph.relationships(),
        graph.diagnostics(),
        graph.apiContracts(),
        graph.schemaVersion(),
        graph.behaviors(),
        graph.validationRules());
  }

  private static void read(
      CompilationUnit unit,
      String file,
      Map<String, List<Setting>> settings,
      List<Job> jobs,
      List<Publisher> publishers) {
    String pkg = unit.getPackageDeclaration().map(p -> p.getNameAsString() + ".").orElse("");
    for (var type : unit.findAll(ClassOrInterfaceDeclaration.class)) {
      if (type.isInterface() || type.isLocalClassDeclaration()) continue;
      String qualified = type.getFullyQualifiedName().orElse(pkg + type.getNameAsString()),
          simple = type.getNameAsString();
      boolean runner =
          type.getImplementedTypes().stream().anyMatch(t -> RUNNERS.contains(t.getNameAsString()));
      for (var method : type.getMethods()) {
        // Methods of nested classes are read with their own class.
        if (method.findAncestor(ClassOrInterfaceDeclaration.class).orElse(null) != type) continue;
        for (var call : method.findAll(MethodCallExpr.class))
          if (call.getNameAsString().equals("publishEvent")
              && call.getArguments().size() == 1
              && call.getArgument(0) instanceof ObjectCreationExpr created)
            publishers.add(
                new Publisher(
                    created.getType().getNameAsString(),
                    simple + "#" + method.getNameAsString(),
                    new SourceLocation(file, call.getBegin().map(p -> p.line).orElse(1))));
        var job = job(file, qualified, simple, method, runner, settings);
        job.ifPresent(jobs::add);
      }
    }
  }

  private static Optional<Job> job(
      String file,
      String qualified,
      String simple,
      MethodDeclaration method,
      boolean runner,
      Map<String, List<Setting>> settings) {
    List<String> texts = new ArrayList<>(),
        expressions = new ArrayList<>(),
        notes = new ArrayList<>();
    ResolutionStatus status = ResolutionStatus.CONFIRMED;
    String property = null, eventType = null, trigger = null;
    for (var annotation : method.getAnnotations()) {
      String name = annotation.getName().getIdentifier();
      List<AnnotationExpr> schedules = new ArrayList<>();
      if (name.equals("Scheduled")) schedules.add(annotation);
      if (name.equals("Schedules"))
        for (var inner : annotation.findAll(AnnotationExpr.class))
          if (inner != annotation && inner.getName().getIdentifier().equals("Scheduled"))
            schedules.add(inner);
      for (var schedule : schedules) {
        trigger = "SCHEDULE";
        expressions.add(schedule.toString());
        Value value = schedule(schedule, settings);
        texts.add(value.text());
        notes.addAll(value.notes());
        status = worst(status, value.status());
        if (value.property() != null) property = value.property();
      }
      if (name.equals("EventListener") || name.equals("TransactionalEventListener")) {
        expressions.add(annotation.toString());
        var events = eventTypes(annotation, method);
        if (events.isEmpty()) {
          texts.add("事件發生時（無法確定是哪一種事件）");
          status = worst(status, ResolutionStatus.UNRESOLVED);
          trigger = trigger == null ? "EVENT" : trigger;
          continue;
        }
        boolean startup = events.stream().allMatch(STARTUP_EVENTS::contains);
        String phase = name.equals("TransactionalEventListener") ? phase(annotation) : "";
        if (startup) {
          trigger = trigger == null ? "STARTUP" : trigger;
          texts.add(events.contains("ApplicationReadyEvent") ? "應用程式啟動完成後執行一次" : "應用程式啟動時執行");
        } else {
          trigger = trigger == null ? "EVENT" : trigger;
          eventType = events.get(0);
          texts.add(phase + "當 " + String.join("、", events) + " 事件發生時");
        }
        attribute(annotation, "condition").ifPresent(c -> notes.add("另有條件 condition = " + c));
      }
    }
    if (trigger == null && method.getAnnotationByName("Async").isPresent()) {
      trigger = "ASYNC";
      texts.add("被呼叫後在背景另外執行，呼叫端不等它完成");
      expressions.add("@Async");
    }
    if (trigger == null
        && runner
        && method.getNameAsString().equals("run")
        && method.getParameters().size() == 1) {
      trigger = "STARTUP";
      texts.add("應用程式啟動完成後執行一次");
      expressions.add(simple + " implements ApplicationRunner／CommandLineRunner");
    }
    if (trigger == null) return Optional.empty();
    return Optional.of(
        new Job(
            file,
            qualified,
            simple,
            method,
            trigger,
            texts,
            expressions,
            status,
            notes,
            property,
            eventType));
  }

  /**
   * Methods scheduled by code instead of an annotation (ADR 0171): {@code scheduler.schedule(task,
   * new CronTrigger("…"))}, {@code scheduleAtFixedRate} / {@code scheduleWithFixedDelay} on a
   * TaskScheduler or ScheduledExecutorService field, and Quartz {@code JobBuilder.newJob(X.class)}
   * with a cron or simple schedule in the same method. The task must be a method reference or a
   * lambda that only calls one method, so the scheduled method is known.
   */
  private static List<Remote> scheduledElsewhere(
      CompilationUnit unit, String file, Map<String, List<Setting>> settings) {
    List<Remote> found = new ArrayList<>();
    for (var type : unit.findAll(ClassOrInterfaceDeclaration.class)) {
      if (type.isInterface()) continue;
      // A Quartz job class runs on its trigger even when the code that schedules it is not found.
      boolean quartz =
          type.getExtendedTypes().stream()
                  .anyMatch(t -> t.getNameAsString().equals("QuartzJobBean"))
              || type.getImplementedTypes().stream()
                      .anyMatch(
                          t ->
                              t.getNameAsString().equals("Job")
                                  || t.asString().equals("org.quartz.Job"))
                  && type.getMethodsByName("execute").stream()
                      .anyMatch(
                          m ->
                              m.getParameters().size() == 1
                                  && m.getParameter(0)
                                      .getTypeAsString()
                                      .endsWith("JobExecutionContext"));
      if (quartz)
        found.add(
            new Remote(
                type.getNameAsString(),
                null,
                "QUARTZ",
                new Value("依 Quartz 觸發設定執行（時間無法確定）", ResolutionStatus.UNRESOLVED, List.of(), null),
                type.getNameAsString() + " 是 Quartz Job",
                new SourceLocation(file, type.getBegin().map(p -> p.line).orElse(1))));
      for (var method : type.getMethods()) {
        if (method.findAncestor(ClassOrInterfaceDeclaration.class).orElse(null) != type) continue;
        for (var call : method.findAll(MethodCallExpr.class)) {
          var source = new SourceLocation(file, call.getBegin().map(p -> p.line).orElse(1));
          if (SCHEDULE_CALLS.contains(call.getNameAsString())
              && call.getArguments().size() >= 2
              && schedulerField(call, type)) {
            String[] target = taskTarget(call.getArgument(0), type);
            if (target == null) continue;
            found.add(
                new Remote(
                    target[0],
                    target[1],
                    "SCHEDULE",
                    programmatic(call, settings),
                    call.toString(),
                    source));
          }
          if (call.getNameAsString().equals("newJob")
              && call.getArguments().size() == 1
              && call.getArgument(0) instanceof ClassExpr job) {
            Value value =
                new Value("依 Quartz 觸發設定執行（時間無法確定）", ResolutionStatus.UNRESOLVED, List.of(), null);
            for (var other : method.findAll(MethodCallExpr.class)) {
              String name = other.getNameAsString();
              if (name.equals("cronSchedule") && other.getArguments().size() == 1) {
                String raw = literal(other.getArgument(0));
                if (raw != null) {
                  var resolved = placeholder(raw, settings);
                  if (resolved.text() != null)
                    value =
                        new Value(
                            ScheduleText.cron(resolved.text())
                                .orElse("依排程規則 " + resolved.text() + " 執行"),
                            resolved.status(),
                            resolved.notes(),
                            resolved.property());
                }
              }
              var unitName =
                  Map.of(
                      "withIntervalInSeconds", "SECONDS",
                      "withIntervalInMinutes", "MINUTES",
                      "withIntervalInHours", "HOURS",
                      "withIntervalInMilliseconds", "MILLISECONDS");
              if (unitName.containsKey(name) && other.getArguments().size() == 1) {
                var n = number(other.getArgument(0));
                var ms = n.flatMap(v -> ScheduleText.millis(v, unitName.get(name)));
                if (ms.isPresent())
                  value =
                      new Value(
                          ScheduleText.every(ms.get(), false),
                          ResolutionStatus.CONFIRMED,
                          List.of(),
                          null);
              }
            }
            String jobType = job.getType().asString();
            found.add(
                new Remote(
                    jobType.substring(jobType.lastIndexOf('.') + 1),
                    null,
                    "QUARTZ",
                    value,
                    "JobBuilder.newJob(" + jobType + ".class)",
                    source));
          }
        }
      }
    }
    return found;
  }

  /** The call's scope is a field whose type is a scheduler. */
  private static boolean schedulerField(MethodCallExpr call, ClassOrInterfaceDeclaration owner) {
    var scope = call.getScope().orElse(null);
    String name =
        scope instanceof NameExpr n
            ? n.getNameAsString()
            : scope instanceof FieldAccessExpr f && f.getScope() instanceof ThisExpr
                ? f.getNameAsString()
                : null;
    if (name == null) return false;
    for (var field : owner.getFields())
      for (var variable : field.getVariables())
        if (variable.getNameAsString().equals(name))
          return variable
              .getTypeAsString()
              .matches(".*(TaskScheduler|ScheduledExecutorService|Scheduler)(<.*>)?$");
    return false;
  }

  /**
   * [type, method] of {@code this::run}, {@code service::run}, {@code () -> run()} or {@code () ->
   * service.run()}.
   */
  private static String[] taskTarget(Expression task, ClassOrInterfaceDeclaration owner) {
    Expression scope;
    String method;
    if (task instanceof MethodReferenceExpr reference) {
      scope = reference.getScope();
      method = reference.getIdentifier();
    } else if (task instanceof LambdaExpr lambda) {
      var body = lambda.getBody();
      Expression only =
          body instanceof com.github.javaparser.ast.stmt.ExpressionStmt e
              ? e.getExpression()
              : body instanceof com.github.javaparser.ast.stmt.BlockStmt b
                      && b.getStatements().size() == 1
                      && b.getStatement(0)
                          instanceof com.github.javaparser.ast.stmt.ExpressionStmt e
                  ? e.getExpression()
                  : null;
      if (!(only instanceof MethodCallExpr call)) return null;
      scope = call.getScope().orElse(new ThisExpr());
      method = call.getNameAsString();
    } else return null;
    if (scope instanceof ThisExpr) return new String[] {owner.getNameAsString(), method};
    // `service::run` parses as a type expression: the name may still be a field.
    String field =
        scope instanceof NameExpr n
            ? n.getNameAsString()
            : scope instanceof TypeExpr t
                ? t.getType().asString()
                : scope instanceof FieldAccessExpr f && f.getScope() instanceof ThisExpr
                    ? f.getNameAsString()
                    : null;
    if (field == null) return null;
    for (var declaration : owner.getFields())
      for (var variable : declaration.getVariables())
        if (variable.getNameAsString().equals(field))
          return new String[] {variable.getType().asString().replaceAll("<.*>", ""), method};
    return null;
  }

  /** The timing of a scheduler call: a CronTrigger, a Duration, or milliseconds / a TimeUnit. */
  private static Value programmatic(MethodCallExpr call, Map<String, List<Setting>> settings) {
    var args = call.getArguments();
    String name = call.getNameAsString();
    var second = args.get(1);
    if (name.equals("schedule")) {
      if (second instanceof ObjectCreationExpr created
          && created.getType().getNameAsString().equals("CronTrigger")
          && !created.getArguments().isEmpty()) {
        String raw = literal(created.getArgument(0));
        if (raw == null)
          return new Value(
              "排程規則無法確定（" + created.getArgument(0) + "）",
              ResolutionStatus.UNRESOLVED,
              List.of(),
              null);
        var resolved = placeholder(raw, settings);
        if (resolved.text() == null)
          return new Value(
              "排程規則無法確定（" + raw + "）",
              ResolutionStatus.UNRESOLVED,
              resolved.notes(),
              resolved.property());
        return new Value(
            ScheduleText.cron(resolved.text()).orElse("依排程規則 " + resolved.text() + " 執行"),
            resolved.status(),
            resolved.notes(),
            resolved.property());
      }
      if (args.size() == 3 && args.get(2) instanceof FieldAccessExpr unit) {
        var ms = number(second).flatMap(v -> ScheduleText.millis(v, unit.getNameAsString()));
        if (ms.isPresent())
          return new Value(
              "啟動後 " + ScheduleText.duration(ms.get()) + "執行一次",
              ResolutionStatus.CONFIRMED,
              List.of(),
              null);
      }
      return new Value("在程式指定的時間執行（時間無法確定）", ResolutionStatus.UNRESOLVED, List.of(), null);
    }
    boolean after = name.equals("scheduleWithFixedDelay");
    Optional<Long> ms = Optional.empty();
    if (args.size() == 4 && args.get(3) instanceof FieldAccessExpr unit)
      ms = number(args.get(2)).flatMap(v -> ScheduleText.millis(v, unit.getNameAsString()));
    else if (args.size() == 2) ms = duration(second).or(() -> number(second));
    else if (args.size() == 3) ms = duration(args.get(2)).or(() -> number(args.get(2)));
    return ms.map(
            v ->
                new Value(
                    ScheduleText.every(v, after),
                    ResolutionStatus.CONFIRMED,
                    List.<String>of(),
                    null))
        .orElse(new Value("排程間隔無法確定（" + call + "）", ResolutionStatus.UNRESOLVED, List.of(), null));
  }

  /** {@code Duration.ofMinutes(5)} and the like, in milliseconds. */
  private static Optional<Long> duration(Expression expression) {
    if (!(expression instanceof MethodCallExpr call)
        || call.getArguments().size() != 1
        || call.getScope().map(s -> !s.toString().endsWith("Duration")).orElse(true))
      return Optional.empty();
    String unit =
        switch (call.getNameAsString()) {
          case "ofMillis" -> "MILLISECONDS";
          case "ofSeconds" -> "SECONDS";
          case "ofMinutes" -> "MINUTES";
          case "ofHours" -> "HOURS";
          case "ofDays" -> "DAYS";
          default -> null;
        };
    return unit == null
        ? Optional.empty()
        : number(call.getArgument(0)).flatMap(v -> ScheduleText.millis(v, unit));
  }

  /**
   * {@code <task:scheduled ref="bean" method="run" cron="…"/>} with its bean's class (ADR 0171).
   */
  private static List<Remote> xmlSchedules(
      ProjectInventory inventory, Path file, Map<String, List<Setting>> settings) {
    List<Remote> found = new ArrayList<>();
    String relative = inventory.root().relativize(file).toString().replace('\\', '/');
    String text;
    org.w3c.dom.Document document;
    try {
      text =
          SafeProjectFiles.readUtf8Limited(
              inventory.root(), file, SafeProjectFiles.MAX_XML_FILE_BYTES);
      document = SafeProjectFiles.parseXml(text, true);
    } catch (Exception unreadable) {
      return found;
    }
    Map<String, String> beans = new TreeMap<>();
    var beanNodes = document.getElementsByTagNameNS("*", "bean");
    for (int i = 0; i < beanNodes.getLength(); i++) {
      var bean = (org.w3c.dom.Element) beanNodes.item(i);
      for (String key : List.of("id", "name"))
        if (!bean.getAttribute(key).isBlank() && !bean.getAttribute("class").isBlank())
          beans.put(bean.getAttribute(key), bean.getAttribute("class"));
    }
    var scheduled = document.getElementsByTagNameNS("*", "scheduled");
    for (int i = 0; i < scheduled.getLength(); i++) {
      var element = (org.w3c.dom.Element) scheduled.item(i);
      String ref = element.getAttribute("ref"), method = element.getAttribute("method");
      if (ref.isBlank() || method.isBlank()) continue;
      String type =
          beans.getOrDefault(ref, Character.toUpperCase(ref.charAt(0)) + ref.substring(1));
      int at = text.indexOf("method=\"" + method + "\"");
      int line =
          at < 0 ? 1 : 1 + (int) text.substring(0, at).chars().filter(c -> c == '\n').count();
      Value value;
      String cron = element.getAttribute("cron"),
          delay = element.getAttribute("fixed-delay"),
          rate = element.getAttribute("fixed-rate");
      if (!cron.isBlank()) {
        var resolved = placeholder(cron, settings);
        value =
            resolved.text() == null
                ? new Value(
                    "排程規則無法確定（" + cron + "）",
                    ResolutionStatus.UNRESOLVED,
                    resolved.notes(),
                    resolved.property())
                : new Value(
                    ScheduleText.cron(resolved.text()).orElse("依排程規則 " + resolved.text() + " 執行"),
                    resolved.status(),
                    resolved.notes(),
                    resolved.property());
      } else {
        String raw = !delay.isBlank() ? delay : rate;
        var resolved = raw.isBlank() ? null : placeholder(raw, settings);
        var ms =
            resolved == null || resolved.text() == null
                ? Optional.<Long>empty()
                : plainMillis(resolved.text());
        value =
            ms.isPresent()
                ? new Value(
                    ScheduleText.every(ms.get(), !delay.isBlank()),
                    resolved.status(),
                    resolved.notes(),
                    resolved.property())
                : new Value(
                    "排程設定無法確定（" + (raw.isBlank() ? "沒有時間設定" : raw) + "）",
                    ResolutionStatus.UNRESOLVED,
                    List.of(),
                    null);
      }
      found.add(
          new Remote(
              type.substring(type.lastIndexOf('.') + 1),
              method,
              "SCHEDULE",
              value,
              "<task:scheduled ref=\"" + ref + "\" method=\"" + method + "\">",
              new SourceLocation(relative, line)));
    }
    return found;
  }

  /** Each remote schedule as a job on the method it runs; Quartz jobs run their execute method. */
  private static List<Job> resolve(
      List<Remote> remotes,
      List<Job> existing,
      Map<String, Path> javaBySimple,
      ProjectInventory inventory) {
    List<Job> out = new ArrayList<>();
    Map<String, CompilationUnit> parsed = new TreeMap<>();
    // One job per scheduled method: a schedule whose timing is known wins over an unknown one.
    Set<String> done = new HashSet<>();
    List<Remote> ordered = new ArrayList<>(remotes);
    ordered.sort(
        Comparator.comparingInt(
                (Remote r) -> r.value().status() == ResolutionStatus.UNRESOLVED ? 1 : 0)
            .thenComparing(r -> r.source().file())
            .thenComparingInt(r -> r.source().line()));
    for (var remote : ordered) {
      if (!done.add(remote.type() + "#" + remote.method())) continue;
      Path file = javaBySimple.get(remote.type());
      if (file == null) continue;
      String relative = inventory.root().relativize(file).toString().replace('\\', '/');
      CompilationUnit unit =
          parsed.computeIfAbsent(
              relative,
              k -> {
                try {
                  return JavaSources.parse(
                      SafeProjectFiles.readUtf8Limited(
                          inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES));
                } catch (Exception unreadable) {
                  return null;
                }
              });
      if (unit == null) continue;
      String pkg = unit.getPackageDeclaration().map(p -> p.getNameAsString() + ".").orElse("");
      for (var type : unit.findAll(ClassOrInterfaceDeclaration.class)) {
        if (!type.getNameAsString().equals(remote.type())) continue;
        List<String> names =
            remote.method() != null
                ? List.of(remote.method())
                : List.of("execute", "executeInternal");
        for (var method : type.getMethods()) {
          if (!names.contains(method.getNameAsString())) continue;
          if (remote.method() == null && method.getParameters().size() != 1) continue;
          String qualified = type.getFullyQualifiedName().orElse(pkg + type.getNameAsString());
          List<String> notes = new ArrayList<>(remote.value().notes());
          notes.add("排程設定在 " + remote.source().file() + ":" + remote.source().line());
          out.add(
              new Job(
                  relative,
                  qualified,
                  type.getNameAsString(),
                  method,
                  "SCHEDULE",
                  List.of(remote.value().text()),
                  List.of(remote.expression()),
                  remote.value().status(),
                  notes,
                  remote.value().property(),
                  null));
          break;
        }
      }
    }
    return out;
  }

  private static Value schedule(AnnotationExpr schedule, Map<String, List<Setting>> settings) {
    List<String> notes = new ArrayList<>();
    String zone = attribute(schedule, "zone").map(BackgroundJobs::literal).orElse(null);
    String suffix = zone == null ? "" : "（時區 " + zone + "）";
    String unit =
        attribute(schedule, "timeUnit")
            .map(e -> e instanceof FieldAccessExpr f ? f.getNameAsString() : e.toString())
            .orElse("MILLISECONDS");
    Optional<Long> initial =
        attribute(schedule, "initialDelay")
            .flatMap(BackgroundJobs::number)
            .flatMap(v -> ScheduleText.millis(v, unit));
    if (initial.isEmpty()) {
      String raw =
          attribute(schedule, "initialDelayString").map(BackgroundJobs::literal).orElse(null);
      if (raw != null && !raw.contains("${"))
        initial =
            raw.trim().matches("\\d{1,15}")
                ? ScheduleText.millis(Long.parseLong(raw.trim()), unit)
                : ScheduleText.isoMillis(raw);
    }
    String start = initial.map(ms -> "；啟動後先等 " + ScheduleText.duration(ms)).orElse("");
    var cron = attribute(schedule, "cron");
    if (cron.isPresent()) {
      String raw = literal(cron.get());
      if (raw == null)
        return new Value("排程規則無法確定（" + cron.get() + "）", ResolutionStatus.UNRESOLVED, notes, null);
      Value resolved = placeholder(raw, settings);
      if (resolved.text() == null)
        return new Value(
            "排程規則無法確定（" + raw + "）",
            ResolutionStatus.UNRESOLVED,
            resolved.notes(),
            resolved.property());
      String words = ScheduleText.cron(resolved.text()).orElse("依排程規則 " + resolved.text() + " 執行");
      return new Value(words + suffix, resolved.status(), resolved.notes(), resolved.property());
    }
    for (String[] kind : new String[][] {{"fixedRate", "false"}, {"fixedDelay", "true"}}) {
      boolean after = Boolean.parseBoolean(kind[1]);
      var number = attribute(schedule, kind[0]).flatMap(BackgroundJobs::number);
      if (number.isPresent()) {
        var ms = ScheduleText.millis(number.get(), unit);
        if (ms.isEmpty())
          return new Value(
              "排程間隔無法確定（timeUnit " + unit + "）", ResolutionStatus.UNRESOLVED, notes, null);
        return new Value(
            ScheduleText.every(ms.get(), after) + start, ResolutionStatus.CONFIRMED, notes, null);
      }
      var text = attribute(schedule, kind[0] + "String");
      if (attribute(schedule, kind[0]).isPresent() && text.isEmpty())
        return new Value(
            "排程間隔無法確定（" + attribute(schedule, kind[0]).get() + "）",
            ResolutionStatus.UNRESOLVED,
            notes,
            null);
      if (text.isPresent()) {
        String raw = literal(text.get());
        Value resolved = raw == null ? null : placeholder(raw, settings);
        Optional<Long> value =
            resolved == null || resolved.text() == null
                ? Optional.empty()
                : plainMillis(resolved.text())
                    .flatMap(
                        v ->
                            resolved.text().trim().matches("\\d+")
                                ? ScheduleText.millis(v, unit)
                                : Optional.of(v));
        if (value.isEmpty())
          return new Value(
              "排程間隔無法確定（" + (raw == null ? text.get() : raw) + "）",
              ResolutionStatus.UNRESOLVED,
              resolved == null ? notes : resolved.notes(),
              resolved == null ? null : resolved.property());
        return new Value(
            ScheduleText.every(value.get(), after) + start,
            resolved.status(),
            resolved.notes(),
            resolved.property());
      }
    }
    return new Value("排程設定無法確定（" + schedule + "）", ResolutionStatus.UNRESOLVED, notes, null);
  }

  /** Digits (milliseconds) or an ISO-8601 duration. */
  private static Optional<Long> plainMillis(String text) {
    if (text == null) return Optional.empty();
    String value = text.trim();
    if (value.matches("\\d{1,15}")) return Optional.of(Long.parseLong(value));
    return ScheduleText.isoMillis(value);
  }

  /**
   * A literal, or {@code ${key:default}}: the base configuration's value for the key, else the
   * default written in the source. Profile files that also set the key are listed as notes.
   */
  private static Value placeholder(String raw, Map<String, List<Setting>> settings) {
    if (!raw.contains("${")) return new Value(raw, ResolutionStatus.CONFIRMED, List.of(), null);
    Matcher match = PLACEHOLDER.matcher(raw.trim());
    if (!match.matches()) return new Value(null, ResolutionStatus.UNRESOLVED, List.of(), null);
    String key = match.group(1).trim(), fallback = match.group(2);
    List<String> notes = new ArrayList<>();
    String chosen = null, origin = null;
    for (Setting setting : settings.getOrDefault(key, List.of())) {
      boolean base = setting.file().matches("(?:.*/)?application\\.(?:properties|ya?ml)");
      String literal = literalOrDefault(setting.raw());
      if (base && chosen == null && literal != null) {
        chosen = literal;
        origin = "取自 " + setting.file() + " 的 " + key;
      } else notes.add(setting.file() + " 將 " + key + " 設為 " + setting.raw());
    }
    if (chosen == null && fallback != null && !fallback.contains("${")) {
      chosen = fallback;
      origin = "取自程式碼中 " + key + " 的預設值";
    }
    if (chosen == null) {
      notes.add(0, "設定 " + key + " 找不到可確定的值");
      return new Value(null, ResolutionStatus.UNRESOLVED, notes, key);
    }
    notes.add(0, origin + "；執行時可能被設定檔或環境變數覆寫");
    return new Value(chosen, ResolutionStatus.INFERRED, notes, key);
  }

  /** A literal value, or the literal default of {@code ${ENV:default}}; null otherwise. */
  public static String literalOrDefault(String raw) {
    if (!raw.contains("${")) return raw;
    Matcher match = PLACEHOLDER.matcher(raw.trim());
    if (match.matches() && match.group(2) != null && !match.group(2).contains("${"))
      return match.group(2);
    return null;
  }

  private static List<String> eventTypes(AnnotationExpr annotation, MethodDeclaration method) {
    List<String> types = new ArrayList<>();
    for (String key : List.of("value", "classes"))
      attribute(annotation, key)
          .ifPresent(
              e -> {
                var list = e instanceof ArrayInitializerExpr a ? a.getValues() : List.of(e);
                for (var item : list)
                  if (item instanceof ClassExpr c) types.add(c.getType().asString());
              });
    if (types.isEmpty() && method.getParameters().size() == 1)
      types.add(method.getParameter(0).getType().asString().replaceAll("<.*>", ""));
    return types.stream().map(t -> t.substring(t.lastIndexOf('.') + 1)).distinct().toList();
  }

  private static String phase(AnnotationExpr annotation) {
    String phase =
        attribute(annotation, "phase")
            .map(e -> e instanceof FieldAccessExpr f ? f.getNameAsString() : e.toString())
            .orElse("AFTER_COMMIT");
    return switch (phase) {
      case "BEFORE_COMMIT" -> "交易提交前，";
      case "AFTER_ROLLBACK" -> "交易回復後，";
      case "AFTER_COMPLETION" -> "交易結束後，";
      default -> "交易提交後，";
    };
  }

  private static Optional<Expression> attribute(AnnotationExpr annotation, String key) {
    if (annotation instanceof SingleMemberAnnotationExpr single)
      return key.equals("value") ? Optional.of(single.getMemberValue()) : Optional.empty();
    if (annotation instanceof NormalAnnotationExpr normal)
      return normal.getPairs().stream()
          .filter(p -> p.getNameAsString().equals(key))
          .map(MemberValuePair::getValue)
          .findFirst();
    return Optional.empty();
  }

  private static String literal(Expression expression) {
    return expression instanceof StringLiteralExpr s ? s.asString() : null;
  }

  /** An integer literal, or a product / sum of them ({@code 5 * 60 * 1000}). */
  private static Optional<Long> number(Expression expression) {
    if (expression instanceof IntegerLiteralExpr i) return Optional.of(i.asNumber().longValue());
    if (expression instanceof LongLiteralExpr l) return Optional.of(l.asNumber().longValue());
    if (expression instanceof EnclosedExpr e) return number(e.getInner());
    if (expression instanceof BinaryExpr b) {
      var left = number(b.getLeft());
      var right = number(b.getRight());
      if (left.isEmpty() || right.isEmpty()) return Optional.empty();
      try {
        return switch (b.getOperator()) {
          case MULTIPLY -> Optional.of(Math.multiplyExact(left.get(), right.get()));
          case PLUS -> Optional.of(Math.addExact(left.get(), right.get()));
          case MINUS -> Optional.of(Math.subtractExact(left.get(), right.get()));
          default -> Optional.empty();
        };
      } catch (ArithmeticException overflow) {
        return Optional.empty();
      }
    }
    return Optional.empty();
  }

  private static ResolutionStatus worst(ResolutionStatus a, ResolutionStatus b) {
    return rank(a) >= rank(b) ? a : b;
  }

  private static int rank(ResolutionStatus status) {
    return switch (status) {
      case CONFIRMED -> 0;
      case INFERRED -> 1;
      case AMBIGUOUS -> 2;
      default -> 3;
    };
  }

  /** Every key set in an {@code application*.properties} or {@code .yml}, flattened with dots. */
  public static Map<String, List<Setting>> settings(ProjectInventory inventory) {
    Map<String, List<Setting>> out = new TreeMap<>();
    List<Path> files =
        inventory.files().stream()
            .filter(
                p ->
                    p.getFileName()
                        .toString()
                        .matches("application(?:-[^.]+)?\\.(?:properties|ya?ml)"))
            .sorted()
            .toList();
    for (Path file : files) {
      String relative = inventory.root().relativize(file).toString().replace('\\', '/');
      try {
        String text =
            SafeProjectFiles.readUtf8Limited(
                inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
        if (relative.endsWith(".properties")) {
          Properties properties = new Properties();
          properties.load(new StringReader(text));
          for (String key : new TreeSet<>(properties.stringPropertyNames()))
            out.computeIfAbsent(key, k -> new ArrayList<>())
                .add(new Setting(relative, line(text, key), properties.getProperty(key)));
        } else {
          LoaderOptions options = new LoaderOptions();
          options.setAllowDuplicateKeys(false);
          options.setMaxAliasesForCollections(20);
          options.setNestingDepthLimit(40);
          options.setCodePointLimit((int) SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
          for (Object document : new Yaml(new SafeConstructor(options)).loadAll(text)) {
            Map<String, String> flat = new TreeMap<>();
            flatten("", document, flat);
            flat.forEach(
                (key, value) ->
                    out.computeIfAbsent(key, k -> new ArrayList<>())
                        .add(
                            new Setting(
                                relative,
                                line(text, key.substring(key.lastIndexOf('.') + 1)),
                                value)));
          }
        }
      } catch (Exception unreadable) {
        // An unreadable configuration proves no value; a placeholder then falls back to the source
        // default and stays INFERRED.
      }
    }
    return out;
  }

  private static void flatten(String prefix, Object value, Map<String, String> out) {
    if (value instanceof Map<?, ?> map) {
      for (var entry : map.entrySet())
        flatten(
            prefix.isEmpty() ? String.valueOf(entry.getKey()) : prefix + "." + entry.getKey(),
            entry.getValue(),
            out);
    } else if (value != null && !(value instanceof List<?>) && !prefix.isEmpty())
      out.put(prefix, String.valueOf(value));
  }

  private static int line(String text, String key) {
    int offset = text.indexOf(key);
    return offset < 0
        ? 1
        : 1 + (int) text.substring(0, offset).chars().filter(c -> c == '\n').count();
  }

  private static String json(Object value) {
    try {
      return JSON.writeValueAsString(value);
    } catch (JsonProcessingException error) {
      throw new IllegalStateException("Cannot serialize background job data", error);
    }
  }
}
