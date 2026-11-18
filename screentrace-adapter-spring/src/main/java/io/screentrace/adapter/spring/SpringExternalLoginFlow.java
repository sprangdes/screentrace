package io.screentrace.adapter.spring;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.ReturnStmt;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.JavaSources;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.nio.file.Path;
import java.util.*;

/**
 * Source-only correlation of full-page API entries, OAuth success-handler wiring and callback
 * redirects.
 */
final class SpringExternalLoginFlow {
  private static final String PARSER = "SpringExternalLoginFlow";

  private record Unit(String file, CompilationUnit ast) {}

  private record Callback(Unit unit, ClassOrInterfaceDeclaration type, SourceLocation wiring) {}

  private record Values(Set<String> paths, boolean unresolved, List<SourceLocation> sources) {}

  /** What the value reader may consult: every parsed unit and the configuration (ADR 0166). */
  private record Context(
      Collection<Unit> units,
      Map<String, List<io.screentrace.parser.jsp.BackgroundJobs.Setting>> settings) {}

  private static final Set<String> URI_FACTORIES =
      Set.of("fromPath", "fromUriString", "fromHttpUrl");
  private static final Set<String> URI_PASS_THROUGH =
      Set.of("build", "toUriString", "toString", "encode", "normalize");

  private SpringExternalLoginFlow() {}

  static ApplicationGraph enrich(ApplicationGraph graph, ProjectInventory inventory) {
    if (!ApplicationGraph.isAudienceSchema(graph.schemaVersion())) return graph;
    var units = new TreeMap<String, Unit>();
    for (Path file : inventory.javaFiles())
      try {
        String name = inventory.root().relativize(file).toString().replace('\\', '/');
        units.put(
            name,
            new Unit(
                name,
                JavaSources.parse(
                    SafeProjectFiles.readUtf8Limited(
                        inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES))));
      } catch (Exception ignored) {
        /* The source parser already reports unreadable Java files. */
      }
    var context =
        new Context(units.values(), io.screentrace.parser.jsp.BackgroundJobs.settings(inventory));
    List<Callback> callbacks = new ArrayList<>();
    boolean oauth = false, customAuthorizationBase = false;
    Set<String> authorizationUris = new TreeSet<>();
    for (Unit unit : units.values())
      for (MethodCallExpr call : unit.ast().findAll(MethodCallExpr.class)) {
        if (call.getNameAsString().equals("oauth2Login")) oauth = true;
        if (call.getNameAsString().equals("baseUri") && insideCall(call, "authorizationEndpoint"))
          customAuthorizationBase = true;
        if (call.getNameAsString().equals("authorizationUri")
            && call.getArguments().size() == 1
            && call.getArgument(0).isStringLiteralExpr()
            && call.getScope().map(scope -> clientRegistrationScope(scope, unit)).orElse(false))
          authorizationUris.add(call.getArgument(0).asStringLiteralExpr().asString());
        if (!call.getNameAsString().equals("successHandler")
            || call.getArguments().size() != 1
            || !insideOAuth(call)) continue;
        String name = callbackType(call, call.getArgument(0));
        if (name == null) continue;
        List<Callback> found = new ArrayList<>();
        for (Unit candidate : units.values())
          for (var type : candidate.ast().findAll(ClassOrInterfaceDeclaration.class))
            if (type.getNameAsString().equals(simple(name))
                && type.getImplementedTypes().stream()
                    .anyMatch(t -> t.getNameAsString().equals("AuthenticationSuccessHandler")))
              found.add(new Callback(candidate, type, source(unit.file(), call)));
        if (found.size() == 1) callbacks.add(found.get(0));
      }
    if (!oauth) return graph;
    final boolean defaultAuthorizationBase = !customAuthorizationBase;
    var nodes = new TreeMap<String, GraphNode>();
    graph.nodes().forEach(n -> nodes.put(n.id(), n));
    var edges = new ArrayList<>(graph.relationships());
    var diagnostics = new ArrayList<>(graph.diagnostics());
    for (Relationship handled : graph.relationships()) {
      if (handled.type() != EdgeType.HANDLED_BY) continue;
      GraphNode endpoint = nodes.get(handled.from()), handler = nodes.get(handled.to());
      if (endpoint == null || handler == null || handler.source() == null) continue;
      boolean fullPage =
          graph.behaviors().stream()
              .filter(b -> b.type() == BehaviorType.CALL_API && endpoint.id().equals(b.targetId()))
              .flatMap(b -> b.evidence().stream())
              .anyMatch(e -> e.detail() != null && e.detail().contains("\"fullPage\":true"));
      if (!fullPage) continue;
      Unit unit = units.get(handler.source().file());
      if (unit == null) continue;
      List<MethodDeclaration> methods =
          unit.ast().findAll(MethodDeclaration.class).stream()
              .filter(
                  m ->
                      m.getNameAsString().equals(handler.attributes().get("method"))
                          && m.findAncestor(ClassOrInterfaceDeclaration.class)
                              .map(
                                  t ->
                                      t.getNameAsString().equals(handler.attributes().get("class")))
                              .orElse(false))
              .toList();
      if (methods.size() != 1) continue;
      var method = methods.get(0);
      var type = method.findAncestor(ClassOrInterfaceDeclaration.class).orElseThrow();
      Set<String> gateways = new TreeSet<>();
      List<SourceLocation> entryProof = new ArrayList<>();
      for (MethodCallExpr call : method.findAll(MethodCallExpr.class))
        if (call.getNameAsString().equals("sendRedirect") && call.getArguments().size() == 1) {
          Values value =
              values(
                  call.getArgument(0), unit, type, method, 0, new HashSet<>(), context, Map.of());
          gateways.addAll(value.paths());
          entryProof.add(source(unit.file(), call));
        }
      for (ReturnStmt ret : method.findAll(ReturnStmt.class))
        if (ret.getExpression().isPresent()) {
          var value =
              values(
                  ret.getExpression().get(),
                  unit,
                  type,
                  method,
                  0,
                  new HashSet<>(),
                  context,
                  Map.of());
          for (String path : value.paths())
            if (path.startsWith("redirect:")) {
              gateways.add(path.substring(9));
              entryProof.add(source(unit.file(), ret));
            }
        }
      gateways.removeIf(
          path ->
              !(authorizationUris.stream()
                      .anyMatch(uri -> path.equals(uri) || path.startsWith(uri + "?"))
                  || (defaultAuthorizationBase && path.startsWith("/oauth2/authorization/"))));
      if (gateways.isEmpty()) continue;
      var attrs = new TreeMap<>(endpoint.attributes());
      attrs.put("externalLogin", "true");
      attrs.put("externalLoginGateway", String.join("\u001f", gateways));
      var proof = new ArrayList<>(endpoint.evidence());
      for (var src : entryProof) proof.add(evidence(src, "整頁導向至登入授權入口"));
      if (callbacks.size() != 1) {
        attrs.put("externalLoginReturnUnresolved", "true");
        diagnostics.add(
            diagnostic(
                endpoint.source(),
                "EXTERNAL_LOGIN_CALLBACK_UNRESOLVED",
                "無法唯一解析 OAuth successHandler 的來源型別"));
      } else {
        Callback callback = callbacks.get(0);
        proof.add(evidence(callback.wiring(), "oauth2Login successHandler 設定"));
        Set<String> returns = new TreeSet<>();
        boolean unresolved = false;
        for (var success : callback.type().getMethodsByName("onAuthenticationSuccess"))
          for (var redirect : success.findAll(MethodCallExpr.class))
            if (redirect.getNameAsString().equals("sendRedirect")
                && redirect.getArguments().size() == 1) {
              Values value =
                  values(
                      redirect.getArgument(0),
                      callback.unit(),
                      callback.type(),
                      success,
                      0,
                      new HashSet<>(),
                      context,
                      Map.of());
              returns.addAll(value.paths());
              unresolved |= value.unresolved();
              proof.add(
                  evidence(
                      source(callback.unit().file(), redirect),
                      "登入完成後導回；表達式=" + redirect.getArgument(0)));
              for (var src : value.sources()) proof.add(evidence(src, "導回路徑回傳來源"));
            }
        if (returns.isEmpty()) unresolved = true;
        if (!returns.isEmpty()) attrs.put("externalLoginReturns", String.join("\u001f", returns));
        if (unresolved) {
          attrs.put("externalLoginReturnUnresolved", "true");
          diagnostics.add(
              diagnostic(
                  callback.wiring(),
                  "EXTERNAL_LOGIN_RETURN_UNRESOLVED",
                  "登入導回路徑來自未解析設定或運算式；不猜測前端路由"));
        }
        for (String target : returns) {
          String route = target.split("[?#]", 2)[0];
          for (GraphNode screen : graph.nodes())
            if (screen.type() == NodeType.SCREEN
                && route.equals(screen.attributes().get("route"))) {
              String id =
                  ApplicationGraph.id(
                      NodeType.ENTRY_POINT, endpoint.id() + ":" + screen.id() + ":" + target);
              edges.add(
                  new Relationship(
                      id,
                      EdgeType.FORWARDS_TO,
                      endpoint.id(),
                      screen.id(),
                      Confidence.INFERRED,
                      callback.wiring(),
                      List.of(evidence(callback.wiring(), "外部登入導回；網址=" + target))));
            }
        }
      }
      nodes.put(
          endpoint.id(),
          new GraphNode(
              endpoint.id(),
              endpoint.type(),
              endpoint.name(),
              attrs,
              endpoint.source(),
              endpoint.confidence(),
              proof.stream().distinct().sorted().toList(),
              endpoint.audience()));
    }
    return new ApplicationGraph(
        graph.application(),
        List.copyOf(nodes.values()),
        edges,
        diagnostics.stream().distinct().toList(),
        graph.apiContracts(),
        graph.schemaVersion(),
        graph.behaviors(),
        graph.validationRules());
  }

  private static boolean insideOAuth(MethodCallExpr call) {
    return insideCall(call, "oauth2Login");
  }

  private static boolean insideCall(MethodCallExpr call, String name) {
    for (var parent = call.getParentNode();
        parent.isPresent();
        parent = parent.get().getParentNode())
      if (parent.get() instanceof MethodCallExpr method && method.getNameAsString().equals(name))
        return true;
    return false;
  }

  private static boolean clientRegistrationScope(Expression scope, Unit unit) {
    if (!scope.isMethodCallExpr()) return false;
    var call = scope.asMethodCallExpr();
    if (call.getNameAsString().equals("withRegistrationId")
        && call.getScope().isPresent()
        && call.getScope().get().isNameExpr()
        && call.getScope().get().asNameExpr().getNameAsString().equals("ClientRegistration"))
      return unit.ast().getImports().stream()
          .anyMatch(
              i ->
                  i.getNameAsString()
                          .equals(
                              "org.springframework.security.oauth2.client.registration.ClientRegistration")
                      || i.isAsterisk()
                          && i.getNameAsString()
                              .equals("org.springframework.security.oauth2.client.registration"));
    return call.getScope().map(s -> clientRegistrationScope(s, unit)).orElse(false);
  }

  private static String callbackType(MethodCallExpr call, Expression expression) {
    if (expression.isObjectCreationExpr())
      return expression.asObjectCreationExpr().getType().asString();
    String name =
        expression.isNameExpr()
            ? expression.asNameExpr().getNameAsString()
            : expression.isFieldAccessExpr()
                ? expression.asFieldAccessExpr().getNameAsString()
                : null;
    if (name == null) return null;
    var owner = call.findAncestor(ClassOrInterfaceDeclaration.class);
    if (owner.isEmpty()) return null;
    for (var field : owner.get().getFields())
      for (var variable : field.getVariables())
        if (variable.getNameAsString().equals(name)) return variable.getType().asString();
    var method = call.findAncestor(MethodDeclaration.class);
    if (method.isPresent())
      for (var parameter : method.get().getParameters())
        if (parameter.getNameAsString().equals(name)) return parameter.getType().asString();
    return null;
  }

  private static Values values(
      Expression expr,
      Unit unit,
      ClassOrInterfaceDeclaration owner,
      MethodDeclaration method,
      int depth,
      Set<String> active,
      Context context,
      Map<String, Values> env) {
    var unknown = new Values(Set.of(), true, List.of(source(unit.file(), expr)));
    if (depth >= 10) return unknown;
    if (expr.isNameExpr() && env.containsKey(expr.asNameExpr().getNameAsString()))
      return env.get(expr.asNameExpr().getNameAsString());
    if (expr.isConditionalExpr()) {
      // Both branches: the redirect may take either (ADR 0166).
      var c = expr.asConditionalExpr();
      var a = values(c.getThenExpr(), unit, owner, method, depth + 1, active, context, env);
      var b = values(c.getElseExpr(), unit, owner, method, depth + 1, active, context, env);
      Set<String> paths = new TreeSet<>(a.paths());
      paths.addAll(b.paths());
      List<SourceLocation> proof = new ArrayList<>(a.sources());
      proof.addAll(b.sources());
      return new Values(paths, a.unresolved() || b.unresolved(), proof);
    }
    if (expr.isMethodCallExpr()) {
      var builder =
          uriBuilder(expr.asMethodCallExpr(), unit, owner, method, depth, active, context, env);
      if (builder != null) return builder;
      var setting = configured(expr.asMethodCallExpr(), unit, owner, context);
      if (setting != null) return setting;
    }
    if (expr.isStringLiteralExpr())
      return new Values(
          Set.of(expr.asStringLiteralExpr().asString()), false, List.of(source(unit.file(), expr)));
    if (expr.isEnclosedExpr())
      return values(
          expr.asEnclosedExpr().getInner(), unit, owner, method, depth + 1, active, context, env);
    if (expr.isBinaryExpr() && expr.asBinaryExpr().getOperator() == BinaryExpr.Operator.PLUS) {
      var b = expr.asBinaryExpr();
      var a = values(b.getLeft(), unit, owner, method, depth + 1, active, context, env);
      var c = values(b.getRight(), unit, owner, method, depth + 1, active, context, env);
      Set<String> paths = new TreeSet<>();
      for (String x : a.paths()) for (String y : c.paths()) paths.add(x + y);
      return new Values(
          paths, a.unresolved() || c.unresolved(), List.of(source(unit.file(), expr)));
    }
    if (expr.isNameExpr()) {
      String key = "var:" + method.getNameAsString() + ":" + expr.asNameExpr().getNameAsString();
      if (!active.add(key)) return unknown;
      var candidates =
          method.findAll(VariableDeclarator.class).stream()
              .filter(v -> v.getNameAsString().equals(expr.asNameExpr().getNameAsString()))
              .toList();
      if (method.findAll(AssignExpr.class).stream()
          .anyMatch(
              a ->
                  a.getTarget().isNameExpr()
                      && a.getTarget()
                          .asNameExpr()
                          .getNameAsString()
                          .equals(expr.asNameExpr().getNameAsString()))) return unknown;
      if (candidates.size() == 1 && candidates.get(0).getInitializer().isPresent())
        return values(
            candidates.get(0).getInitializer().get(),
            unit,
            owner,
            method,
            depth + 1,
            active,
            context,
            env);
      return unknown;
    }
    if (expr.isMethodCallExpr()) {
      var call = expr.asMethodCallExpr();
      if (call.getScope().isPresent() && !call.getScope().get().isThisExpr()) return unknown;
      var matches = owner.getMethodsByName(call.getNameAsString());
      if (matches.size() != 1) return unknown;
      var fn = matches.get(0);
      String key = "method:" + fn.getSignature();
      if (!active.add(key) || fn.getParameters().size() != call.getArguments().size())
        return unknown;
      // Arguments are read in the caller, then stand for the parameters inside the callee.
      Map<String, Values> bound = new HashMap<>();
      for (int i = 0; i < fn.getParameters().size(); i++)
        bound.put(
            fn.getParameter(i).getNameAsString(),
            values(
                call.getArgument(i),
                unit,
                owner,
                method,
                depth + 1,
                new HashSet<>(active),
                context,
                env));
      Set<String> paths = new TreeSet<>();
      boolean unresolved = false;
      List<SourceLocation> proof = new ArrayList<>();
      for (ReturnStmt ret : fn.findAll(ReturnStmt.class))
        if (ret.getExpression().isPresent()
            && ret.findAncestor(com.github.javaparser.ast.expr.LambdaExpr.class).isEmpty()
            && ret.findAncestor(MethodDeclaration.class).orElse(null) == fn) {
          var value =
              values(
                  ret.getExpression().get(),
                  unit,
                  owner,
                  fn,
                  depth + 1,
                  new HashSet<>(active),
                  context,
                  bound);
          paths.addAll(value.paths());
          unresolved |= value.unresolved();
          proof.addAll(value.sources());
        }
      return new Values(paths, unresolved || paths.isEmpty(), proof);
    }
    return unknown;
  }

  /**
   * {@code UriComponentsBuilder.fromPath(p).queryParam("k", "v").build().toUriString()}: the path,
   * with literal query parameters; a parameter whose value is not literal is written {@code k={k}}.
   * An absolute URL keeps only its path, which is what a frontend route can match. Null when the
   * call is not such a chain.
   */
  private static Values uriBuilder(
      MethodCallExpr call,
      Unit unit,
      ClassOrInterfaceDeclaration owner,
      MethodDeclaration method,
      int depth,
      Set<String> active,
      Context context,
      Map<String, Values> env) {
    String name = call.getNameAsString();
    if (URI_FACTORIES.contains(name)
        && call.getArguments().size() == 1
        && call.getScope().map(s -> s.toString().endsWith("UriComponentsBuilder")).orElse(false)) {
      var inner = values(call.getArgument(0), unit, owner, method, depth + 1, active, context, env);
      Set<String> paths = new TreeSet<>();
      for (String path : inner.paths()) paths.add(pathOf(path));
      return new Values(paths, inner.unresolved(), inner.sources());
    }
    if (call.getScope().isEmpty() || !chainOfUriBuilder(call)) return null;
    var base = values(call.getScope().get(), unit, owner, method, depth + 1, active, context, env);
    if (URI_PASS_THROUGH.contains(name)) return base;
    if (name.equals("queryParam") && call.getArguments().size() >= 2) {
      var key = call.getArgument(0);
      if (!key.isStringLiteralExpr()) return base;
      String k = key.asStringLiteralExpr().asString(),
          v =
              call.getArguments().size() == 2 && call.getArgument(1).isStringLiteralExpr()
                  ? call.getArgument(1).asStringLiteralExpr().asString()
                  : "{" + k + "}";
      Set<String> paths = new TreeSet<>();
      for (String path : base.paths())
        paths.add(path + (path.contains("?") ? "&" : "?") + k + "=" + v);
      return new Values(paths, base.unresolved(), base.sources());
    }
    return null;
  }

  /** The chain starts at a UriComponentsBuilder factory, directly or through a helper method. */
  private static boolean chainOfUriBuilder(MethodCallExpr call) {
    Expression scope = call.getScope().orElse(null);
    while (scope instanceof MethodCallExpr inner) {
      if (URI_FACTORIES.contains(inner.getNameAsString())) return true;
      if (inner.getScope().isEmpty() || inner.getScope().get().isThisExpr())
        return true; // a helper of this class that builds one; it is read like any method
      scope = inner.getScope().get();
    }
    return false;
  }

  private static String pathOf(String target) {
    if (target.startsWith("http://") || target.startsWith("https://")) {
      int slash = target.indexOf('/', target.indexOf("//") + 2);
      return slash < 0 ? "/" : target.substring(slash);
    }
    return target;
  }

  /**
   * {@code properties.successRedirectPath()} where the field's type is a
   * {@code @ConfigurationProperties(prefix = "app.auth")} class: every value the project's
   * configuration files give {@code app.auth.success-redirect-path}, each with its file and line.
   * Null when the call is not such an accessor; unresolved when no file sets the key.
   */
  private static Values configured(
      MethodCallExpr call, Unit unit, ClassOrInterfaceDeclaration owner, Context context) {
    if (!call.getArguments().isEmpty() || call.getScope().isEmpty()) return null;
    var scope = call.getScope().get();
    String field =
        scope.isNameExpr()
            ? scope.asNameExpr().getNameAsString()
            : scope.isFieldAccessExpr() && scope.asFieldAccessExpr().getScope().isThisExpr()
                ? scope.asFieldAccessExpr().getNameAsString()
                : null;
    if (field == null) return null;
    String type = null;
    for (var declaration : owner.getFields())
      for (var variable : declaration.getVariables())
        if (variable.getNameAsString().equals(field)) type = variable.getTypeAsString();
    if (type == null) return null;
    String prefix = null;
    for (Unit candidate : context.units())
      for (var declaration : candidate.ast().findAll(TypeDeclaration.class))
        if (declaration.getNameAsString().equals(simple(type)))
          for (var annotation : declaration.getAnnotations())
            if (((AnnotationExpr) annotation).getNameAsString().equals("ConfigurationProperties"))
              prefix = prefixOf((AnnotationExpr) annotation);
    if (prefix == null) return null;
    String accessor = call.getNameAsString();
    if (accessor.startsWith("get") && accessor.length() > 3)
      accessor = Character.toLowerCase(accessor.charAt(3)) + accessor.substring(4);
    String key =
        prefix + "." + accessor.replaceAll("([a-z0-9])([A-Z])", "$1-$2").toLowerCase(Locale.ROOT);
    Set<String> paths = new TreeSet<>();
    List<SourceLocation> proof = new ArrayList<>();
    boolean unresolved = false;
    for (var setting : context.settings().getOrDefault(key, List.of())) {
      String value = io.screentrace.parser.jsp.BackgroundJobs.literalOrDefault(setting.raw());
      proof.add(new SourceLocation(setting.file(), setting.line()));
      if (value == null) unresolved = true;
      else paths.add(value);
    }
    if (paths.isEmpty()) unresolved = true;
    return new Values(
        paths, unresolved, proof.isEmpty() ? List.of(source(unit.file(), call)) : proof);
  }

  private static String prefixOf(AnnotationExpr annotation) {
    Expression value = null;
    if (annotation instanceof SingleMemberAnnotationExpr single) value = single.getMemberValue();
    if (annotation instanceof NormalAnnotationExpr normal)
      for (var pair : normal.getPairs())
        if (pair.getNameAsString().equals("prefix") || pair.getNameAsString().equals("value"))
          value = pair.getValue();
    return value != null && value.isStringLiteralExpr()
        ? value.asStringLiteralExpr().asString()
        : null;
  }

  private static String simple(String type) {
    int dot = type.lastIndexOf('.');
    return dot < 0 ? type : type.substring(dot + 1);
  }

  private static SourceLocation source(String file, com.github.javaparser.ast.Node node) {
    return new SourceLocation(file, node.getBegin().map(p -> p.line).orElse(1));
  }

  private static AnalysisEvidence evidence(SourceLocation source, String detail) {
    return new AnalysisEvidence(source, PARSER, ResolutionStatus.INFERRED, detail);
  }

  private static Diagnostic diagnostic(SourceLocation source, String code, String message) {
    return new Diagnostic(
        message,
        Confidence.UNRESOLVED,
        source,
        code,
        List.of(new AnalysisEvidence(source, PARSER, ResolutionStatus.UNRESOLVED, message)));
  }
}
