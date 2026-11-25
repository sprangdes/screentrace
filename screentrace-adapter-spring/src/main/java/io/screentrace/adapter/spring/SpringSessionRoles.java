package io.screentrace.adapter.spring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.IfStmt;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.io.IOException;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Roles of a Spring MVC / JSP application from its own access rule (ADR 0188): a servlet filter or
 * interceptor that sends requests under a path prefix to a login page unless a session attribute is
 * set. Screens reached only under that prefix need the attribute; the login page is where a request
 * without it goes. Without configured personas, two roles are suggested from this rule: the public
 * user and the signed-in role, each with a flow over endpoints, renders, redirects and the links
 * and forms on each screen.
 */
final class SpringSessionRoles {
  private static final ObjectMapper JSON = new ObjectMapper();
  static final String SESSION_FACTS = "sessionFacts";

  /** Requests under {@code prefix}, except {@code open} paths, need session {@code attribute}. */
  record Rule(
      String prefix, Set<String> open, String attribute, String login, SourceLocation source) {
    boolean guards(String path) {
      return path != null
          && path.startsWith(prefix)
          && !open.contains(path)
          && !open.contains(path.endsWith("/") ? path.substring(0, path.length() - 1) : path);
    }

    String fact() {
      return "sessionScope." + attribute;
    }
  }

  private SpringSessionRoles() {}

  static Optional<Rule> rule(ProjectInventory inventory, ParsedJavaUnits units) {
    List<Rule> rules = new ArrayList<>();
    for (Path file : inventory.javaFiles())
      try {
        CompilationUnit unit = units.parse(file);
        String relative = inventory.root().relativize(file).toString().replace('\\', '/');
        for (var type : unit.findAll(ClassOrInterfaceDeclaration.class)) {
          boolean filter =
              type.getImplementedTypes().stream()
                      .anyMatch(
                          t -> Set.of("Filter", "HandlerInterceptor").contains(t.getNameAsString()))
                  || type.getExtendedTypes().stream()
                      .anyMatch(
                          t ->
                              Set.of(
                                      "OncePerRequestFilter",
                                      "GenericFilterBean",
                                      "HandlerInterceptorAdapter")
                                  .contains(t.getNameAsString()));
          if (!filter) continue;
          for (var method : type.getMethods())
            if (Set.of("doFilter", "doFilterInternal", "preHandle")
                .contains(method.getNameAsString()))
              for (var branch : method.findAll(IfStmt.class)) {
                var found = rule(method, branch, relative);
                if (found != null) rules.add(found);
              }
        }
      } catch (IOException | RuntimeException unreadable) {
        // Another file may hold the rule.
      }
    return rules.size() == 1 ? Optional.of(rules.get(0)) : Optional.empty();
  }

  private static Rule rule(MethodDeclaration method, IfStmt branch, String file) {
    var redirect =
        branch.getThenStmt().findAll(MethodCallExpr.class).stream()
            .filter(c -> c.getNameAsString().equals("sendRedirect") && c.getArguments().size() == 1)
            .findFirst()
            .orElse(null);
    if (redirect == null) return null;
    String login = null;
    for (var literal : redirect.getArgument(0).findAll(StringLiteralExpr.class))
      if (literal.asString().startsWith("/")) login = literal.asString();
    if (redirect.getArgument(0).isStringLiteralExpr())
      login = redirect.getArgument(0).asStringLiteralExpr().asString();
    if (login == null) return null;
    Set<String> paths = new HashSet<>();
    for (var v : method.findAll(VariableDeclarator.class))
      if (v.getInitializer()
          .filter(Expression::isMethodCallExpr)
          .map(
              e ->
                  Set.of("getServletPath", "getRequestURI")
                      .contains(e.asMethodCallExpr().getNameAsString()))
          .orElse(false)) paths.add(v.getNameAsString());
    String prefix = null, attribute = null;
    Set<String> open = new TreeSet<>();
    for (var atom : conjuncts(branch.getCondition())) {
      boolean negated = false;
      while (atom.isUnaryExpr()
          && atom.asUnaryExpr().getOperator() == UnaryExpr.Operator.LOGICAL_COMPLEMENT) {
        negated = !negated;
        atom = unwrap(atom.asUnaryExpr().getExpression());
      }
      if (!atom.isMethodCallExpr()) {
        // session.getAttribute("x") == null
        if (atom.isBinaryExpr()
            && atom.asBinaryExpr().getOperator() == BinaryExpr.Operator.EQUALS
            && atom.asBinaryExpr().getRight().isNullLiteralExpr()) {
          String name = attribute(atom.asBinaryExpr().getLeft());
          if (name != null && !negated) attribute = name;
        }
        continue;
      }
      var call = atom.asMethodCallExpr();
      String name = call.getNameAsString();
      if (name.equals("startsWith")
          && !negated
          && call.getScope().filter(s -> s.isNameExpr() && paths.contains(s.toString())).isPresent()
          && call.getArguments().size() == 1
          && call.getArgument(0).isStringLiteralExpr())
        prefix = call.getArgument(0).asStringLiteralExpr().asString();
      else if (name.equals("equals") && negated && call.getArguments().size() == 1) {
        var scope = call.getScope().orElse(null);
        var argument = call.getArgument(0);
        if (scope != null
            && scope.isStringLiteralExpr()
            && argument.isNameExpr()
            && paths.contains(argument.toString()))
          open.add(scope.asStringLiteralExpr().asString());
        else if (scope != null
            && scope.isNameExpr()
            && paths.contains(scope.toString())
            && argument.isStringLiteralExpr()) open.add(argument.asStringLiteralExpr().asString());
        else if (scope != null
            && (scope.toString().equals("Boolean.TRUE")
                || scope.toString().equals("java.lang.Boolean.TRUE"))) {
          String found = attribute(argument);
          if (found != null) attribute = found;
        }
      }
    }
    if (prefix == null || attribute == null) return null;
    open.add(login);
    return new Rule(
        prefix,
        Set.copyOf(open),
        attribute,
        login,
        new SourceLocation(file, branch.getBegin().map(p -> p.line).orElse(1)));
  }

  private static String attribute(Expression expression) {
    expression = unwrap(expression);
    if (expression.isMethodCallExpr()
        && expression.asMethodCallExpr().getNameAsString().equals("getAttribute")
        && expression.asMethodCallExpr().getArguments().size() == 1
        && expression.asMethodCallExpr().getArgument(0).isStringLiteralExpr())
      return expression.asMethodCallExpr().getArgument(0).asStringLiteralExpr().asString();
    return null;
  }

  private static List<Expression> conjuncts(Expression expression) {
    expression = unwrap(expression);
    if (expression.isBinaryExpr()
        && expression.asBinaryExpr().getOperator() == BinaryExpr.Operator.AND) {
      var all = new ArrayList<>(conjuncts(expression.asBinaryExpr().getLeft()));
      all.addAll(conjuncts(expression.asBinaryExpr().getRight()));
      return all;
    }
    return List.of(expression);
  }

  private static Expression unwrap(Expression e) {
    while (e.isEnclosedExpr()) e = e.asEnclosedExpr().getInner();
    return e;
  }

  // ---------------------------------------------------------------------------------------------
  // Graph helpers

  private record View(
      Map<String, GraphNode> nodes,
      Map<String, List<Relationship>> out,
      Map<String, List<Relationship>> in,
      Map<String, List<Behavior>> behaviors) {
    static View of(ApplicationGraph graph) {
      Map<String, GraphNode> nodes = new LinkedHashMap<>();
      graph.nodes().forEach(n -> nodes.put(n.id(), n));
      Map<String, List<Relationship>> out = new HashMap<>(), in = new HashMap<>();
      for (var e : graph.relationships()) {
        out.computeIfAbsent(e.from(), k -> new ArrayList<>()).add(e);
        in.computeIfAbsent(e.to(), k -> new ArrayList<>()).add(e);
      }
      Map<String, List<Behavior>> behaviors = new HashMap<>();
      for (var b : graph.behaviors())
        if (b.triggerId() != null)
          behaviors.computeIfAbsent(b.triggerId(), k -> new ArrayList<>()).add(b);
      return new View(nodes, out, in, behaviors);
    }

    List<Relationship> out(String id, EdgeType type) {
      return out.getOrDefault(id, List.of()).stream().filter(e -> e.type() == type).toList();
    }

    List<Relationship> in(String id, EdgeType type) {
      return in.getOrDefault(id, List.of()).stream().filter(e -> e.type() == type).toList();
    }

    String path(String endpoint) {
      var n = nodes.get(endpoint);
      return n == null ? null : n.attributes().get("path");
    }

    /** Screens an endpoint shows, each with whether its handler reaches it normally. */
    Map<String, Boolean> screens(String endpoint) {
      return screens(endpoint, List.of());
    }

    /** As above, for a request with these URLs (their query can select a branch). */
    Map<String, Boolean> screens(String endpoint, List<String> requests) {
      Map<String, Boolean> result = new LinkedHashMap<>();
      for (var handled : out(endpoint, EdgeType.HANDLED_BY))
        for (var e : out.getOrDefault(handled.to(), List.of())) {
          if (!Set.of(EdgeType.RENDERS, EdgeType.FORWARDS_TO).contains(e.type())) continue;
          var target = nodes.get(e.to());
          if (target == null || target.type() != NodeType.SCREEN) continue;
          // A redirect's request conditions belong to the page it redirects to.
          if (e.type() == EdgeType.RENDERS
              && !SpringRequestConditions.permits(e, endpoint, requests)) continue;
          var handler = nodes.get(handled.to());
          String method =
              "方法="
                  + handler.attributes().getOrDefault("class", "")
                  + "."
                  + handler.attributes().getOrDefault("method", "")
                  + "；";
          boolean main =
              e.evidence().stream()
                  .anyMatch(
                      p ->
                          p.parser().equals(SpringControllerReturns.MAIN_PATH)
                              && Objects.toString(p.detail(), "").startsWith(method));
          result.merge(e.to(), main, Boolean::logicalOr);
        }
      return result;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Session facts on screens (before JSP guards are evaluated)

  /**
   * Screens reached only under the guarded prefix have the session attribute; the login page, where
   * a request without it is sent, does not.
   */
  static ApplicationGraph annotate(ApplicationGraph graph, Optional<Rule> found) {
    if (found.isEmpty()) return graph;
    var rule = found.get();
    var view = View.of(graph);
    List<GraphNode> nodes = new ArrayList<>();
    boolean changed = false;
    for (var node : graph.nodes()) {
      Boolean value = null;
      if (node.type() == NodeType.SCREEN) value = sessionValue(view, rule, node.id());
      if (value == null) {
        nodes.add(node);
        continue;
      }
      var attributes = new TreeMap<>(node.attributes());
      attributes.put(SESSION_FACTS, json(Map.of(rule.fact(), value)));
      var evidence = new ArrayList<>(node.evidence());
      evidence.add(
          new AnalysisEvidence(
              rule.source(),
              "SpringSessionRole",
              ResolutionStatus.INFERRED,
              value
                  ? "只由 " + rule.prefix() + " 下需要 session " + rule.attribute() + " 的網址顯示"
                  : "未設定 session " + rule.attribute() + " 時導向的登入頁 " + rule.login()));
      nodes.add(
          new GraphNode(
              node.id(),
              node.type(),
              node.name(),
              attributes,
              node.source(),
              node.confidence(),
              evidence,
              node.audience()));
      changed = true;
    }
    if (!changed) return graph;
    return new ApplicationGraph(
        graph.application(),
        nodes,
        graph.relationships(),
        graph.diagnostics(),
        graph.apiContracts(),
        graph.schemaVersion(),
        graph.behaviors(),
        graph.validationRules());
  }

  /** True when every way to the screen is guarded, false for the login page, else unknown. */
  private static Boolean sessionValue(View view, Rule rule, String screen) {
    Set<String> paths = new TreeSet<>();
    boolean unknown = false;
    for (var render : view.in.getOrDefault(screen, List.of())) {
      // A redirect is shown by the request it redirects to, which has its own render.
      if (render.type() != EdgeType.RENDERS
          && !(render.type() == EdgeType.FORWARDS_TO && forward(render))) continue;
      var from = view.nodes.get(render.from());
      if (from == null || from.type() != NodeType.HANDLER) continue;
      var endpoints = view.in(from.id(), EdgeType.HANDLED_BY);
      if (endpoints.isEmpty()) {
        // An exception handler: the servlet path its branch tested decides.
        String prefix = servletPrefix(render);
        if (prefix == null) unknown = true;
        else paths.add(prefix);
        continue;
      }
      for (var e : endpoints)
        if (SpringRequestConditions.permits(render, e.from(), List.of())) {
          String path = view.path(e.from());
          if (path == null) unknown = true;
          else paths.add(path);
        }
    }
    if (unknown || paths.isEmpty()) return null;
    if (paths.stream().allMatch(rule::guards)) return Boolean.TRUE;
    // The login page: where the filter sends a request without the attribute (aliases of its
    // handler are not guarded either).
    if (paths.contains(rule.login()) && paths.stream().noneMatch(rule::guards))
      return Boolean.FALSE;
    return null;
  }

  private static boolean forward(Relationship edge) {
    return edge.evidence().stream()
        .anyMatch(p -> Objects.toString(p.detail(), "").contains("導向規則=FORWARD"));
  }

  private static String servletPrefix(Relationship render) {
    for (var proof : render.evidence())
      if (proof.parser().equals("SpringRequestCondition"))
        try {
          var data = JSON.readTree(proof.detail());
          if (data.has("servletPrefix") && "false".equals(data.path("negated").asText()))
            return data.path("servletPrefix").asText();
        } catch (IOException unreadable) {
          // No servlet path condition.
        }
    return null;
  }

  // ---------------------------------------------------------------------------------------------
  // Suggested roles and their flows (after state screens exist)

  static ApplicationGraph personas(
      ApplicationGraph graph, Optional<Rule> found, ProjectInventory inventory) {
    if (found.isEmpty() || inventory.personasConfigured()) return graph;
    var rule = found.get();
    var view = View.of(graph);
    String guestStart = null;
    List<String> gets = new ArrayList<>();
    for (var n : graph.nodes())
      if (n.type() == NodeType.ENDPOINT
          && "GET".equals(n.attributes().get("httpMethod"))
          && n.attributes().get("path") != null) gets.add(n.id());
    gets.sort(Comparator.comparing(view::path));
    String loginEndpoint = null;
    for (String e : gets) {
      String path = view.path(e);
      if (path.equals("/") && !rule.guards(path)) guestStart = e;
      if (path.equals(rule.login())) loginEndpoint = e;
    }
    if (guestStart == null)
      guestStart =
          gets.stream()
              .filter(e -> !rule.guards(view.path(e)) && !view.path(e).contains("{"))
              .filter(e -> !view.path(e).equals(rule.login()))
              .findFirst()
              .orElse(null);
    if (guestStart == null || loginEndpoint == null) return graph;

    List<GraphNode> nodes = new ArrayList<>(graph.nodes());
    List<Relationship> edges = new ArrayList<>(graph.relationships());
    Map<String, String> entries = new LinkedHashMap<>();
    for (String endpoint : List.of(guestStart, loginEndpoint)) {
      String path = view.path(endpoint);
      String id = ApplicationGraph.id(NodeType.ENTRY_POINT, "persona-start:" + path);
      var source = view.nodes.get(endpoint).source();
      nodes.add(
          new GraphNode(
              id,
              NodeType.ENTRY_POINT,
              "GET " + path,
              Map.of("path", path, "role", "persona-start"),
              source,
              Confidence.INFERRED,
              List.of(
                  new AnalysisEvidence(
                      source, "SpringSessionRole", ResolutionStatus.INFERRED, "角色起點：" + path))));
      for (String screen : view.screens(endpoint).keySet()) {
        String key =
            ApplicationGraph.id(NodeType.ENTRY_POINT, "persona-start:" + path + ":" + screen);
        edges.add(
            new Relationship(
                key,
                EdgeType.RENDERS,
                id,
                screen,
                Confidence.INFERRED,
                source,
                List.of(
                    new AnalysisEvidence(
                        source, "SpringSessionRole", ResolutionStatus.INFERRED, "角色起點：" + path))));
      }
      entries.put(endpoint, id);
    }
    String loginScreen = view.screens(loginEndpoint).keySet().stream().findFirst().orElse(null);
    String signedIn = roleName(graph, loginScreen, inventory);
    var facts =
        List.of(
            new AudienceAtom(rule.fact(), false, rule.source()),
            new AudienceAtom(rule.fact(), true, rule.source()));
    List<Persona> personas = new ArrayList<>();
    personas.add(
        persona(
            view,
            rule,
            "guest",
            "一般用戶",
            "自動建議：未登入的使用者（session " + rule.attribute() + " 未設定），由 " + view.path(guestStart) + " 進入",
            facts.get(0),
            guestStart,
            entries.get(guestStart)));
    personas.add(
        persona(
            view,
            rule,
            "signed-in",
            signedIn,
            "自動建議：在 "
                + rule.login()
                + " 登入後 session "
                + rule.attribute()
                + " 為 true，可使用 "
                + rule.prefix()
                + " 下的頁面（"
                + rule.source().file()
                + " 第 "
                + rule.source().line()
                + " 行）",
            facts.get(1),
            loginEndpoint,
            entries.get(loginEndpoint)));
    var app = graph.application();
    return new ApplicationGraph(
        new Application(
            app.name(),
            app.path(),
            app.technologies(),
            app.audiences(),
            app.personaDimensions(),
            personas),
        nodes,
        edges,
        graph.diagnostics(),
        graph.apiContracts(),
        ApplicationGraph.PERSONA_SCHEMA_VERSION,
        graph.behaviors(),
        graph.validationRules());
  }

  /** The signed-in role is named after its login page heading, e.g. 「後台管理員登入」→「後台管理員」. */
  private static String roleName(
      ApplicationGraph graph, String loginScreen, ProjectInventory inventory) {
    var screen =
        graph.nodes().stream().filter(n -> n.id().equals(loginScreen)).findFirst().orElse(null);
    String fallback = "管理者";
    if (screen == null) return fallback;
    String body = SpringRequestVariants.bodyText(screen, inventory);
    if (body == null) return fallback;
    Matcher h1 = Pattern.compile("(?is)<h1\\b[^>]*>(.*?)</h1>").matcher(body);
    if (!h1.find()) return fallback;
    String text = h1.group(1).replaceAll("<[^>]*>", "").replaceAll("\\s+", "").strip();
    if (text.contains("${")) return fallback;
    text = text.replaceAll("(登入|登录|Login|Sign ?in)$", "").strip();
    return text.isEmpty() || text.length() > 20 ? fallback : text;
  }

  private static Persona persona(
      View view,
      Rule rule,
      String id,
      String name,
      String description,
      AudienceAtom fact,
      String startEndpoint,
      String entry) {
    boolean signedIn = fact.truth();
    Map<String, Object> known = Map.of(rule.fact(), signedIn);
    // Screen statuses: guarded screens are only for the signed-in role.
    Map<String, PersonaStatus> statuses = new TreeMap<>();
    for (var n : view.nodes.values()) {
      if (n.type() != NodeType.SCREEN) continue;
      Boolean needs = sessionFact(n, rule);
      statuses.put(
          n.id(),
          needs == null
              ? PersonaStatus.UNKNOWN
              : needs && !signedIn ? PersonaStatus.EXCLUDED : PersonaStatus.APPLIES);
    }
    // Flow: breadth first from the role's start over links, forms and redirects.
    List<PersonaStep> steps = new ArrayList<>();
    Map<String, Integer> depth = new LinkedHashMap<>();
    Map<String, Boolean> certain = new HashMap<>();
    ArrayDeque<String> queue = new ArrayDeque<>();
    for (var start : view.screens(startEndpoint).entrySet()) {
      if (statuses.get(start.getKey()) == PersonaStatus.EXCLUDED) continue;
      steps.add(new PersonaStep(entry, start.getKey(), "RENDERS", null, PersonaStatus.APPLIES));
      if (!depth.containsKey(start.getKey())) {
        depth.put(start.getKey(), 1);
        certain.put(start.getKey(), true);
        queue.add(start.getKey());
      }
    }
    while (!queue.isEmpty()) {
      String screen = queue.remove();
      for (var move : moves(view, rule, screen, known)) {
        if (statuses.get(move.to()) == PersonaStatus.EXCLUDED) continue;
        steps.add(move);
        boolean sure = certain.get(screen) && move.status() == PersonaStatus.APPLIES;
        if (!depth.containsKey(move.to())) {
          depth.put(move.to(), depth.get(screen) + 1);
          certain.put(move.to(), sure);
          queue.add(move.to());
        } else if (sure && !certain.get(move.to())) certain.put(move.to(), true);
      }
    }
    List<PersonaReach> reached = new ArrayList<>();
    for (var e : depth.entrySet())
      reached.add(
          new PersonaReach(
              e.getKey(), certain.get(e.getKey()) ? "REACHABLE" : "POSSIBLE", e.getValue()));
    List<String> unreached = new ArrayList<>();
    for (var e : statuses.entrySet())
      if (e.getValue() != PersonaStatus.EXCLUDED && !depth.containsKey(e.getKey()))
        unreached.add(e.getKey());
    var flow =
        new PersonaFlow(List.of(entry), reached, unreached, steps.stream().distinct().toList(), 0);
    return new Persona(
        id,
        name,
        description,
        List.of(fact),
        List.of(view.path(startEndpoint)),
        statuses,
        List.of(),
        flow);
  }

  /**
   * A page in a request mode (ADR 0186) continues the mode of the page it came from; the other mode
   * stays possible.
   */
  private static boolean sameMode(GraphNode from, GraphNode to) {
    String property = to == null ? null : to.attributes().get("requestProperty");
    if (property == null || !property.equals(from.attributes().get("requestProperty"))) return true;
    return emptiness(from).equals(emptiness(to));
  }

  private static String emptiness(GraphNode screen) {
    try {
      var values = JSON.readTree(screen.attributes().getOrDefault("requestFacts", "{}")).elements();
      return values.hasNext() ? values.next().path("empty").asText("") : "";
    } catch (IOException unreadable) {
      return "";
    }
  }

  private static Boolean sessionFact(GraphNode screen, Rule rule) {
    String raw = screen.attributes().get(SESSION_FACTS);
    if (raw == null) return null;
    try {
      var value = JSON.readTree(raw).path(rule.fact());
      return value.isBoolean() ? value.asBoolean() : null;
    } catch (IOException unreadable) {
      return null;
    }
  }

  /** Where a role can go from one screen: each usable link or form and the screens it opens. */
  private static List<PersonaStep> moves(
      View view, Rule rule, String screen, Map<String, Object> known) {
    List<PersonaStep> moves = new ArrayList<>();
    var node = view.nodes.get(screen);
    // Another state of the same JSP page (ADR 0183/0185) is the same page later in the process.
    String base = node.attributes().getOrDefault("stateVariantOf", screen);
    if (node.attributes().containsKey("jspStateField"))
      for (var other : view.nodes.values())
        if (other.type() == NodeType.SCREEN
            && !other.id().equals(screen)
            && other.attributes().containsKey("jspStateField")
            && other.attributes().getOrDefault("stateVariantOf", other.id()).equals(base))
          moves.add(new PersonaStep(screen, other.id(), "RENDERS", null, PersonaStatus.UNKNOWN));
    for (var contains : view.out(screen, EdgeType.CONTAINS)) {
      var component = view.nodes.get(contains.to());
      if (component == null || component.type() != NodeType.COMPONENT) continue;
      Map<String, Object> facts = new HashMap<>(known);
      // The controller branch's model facts (ADR 0185) hold on every state of the page.
      facts.putAll(JspScreenFacts.facts(view.in.getOrDefault(base, List.of())));
      facts.putAll(JspScreenFacts.facts(view.in.getOrDefault(screen, List.of())));
      facts.putAll(JspScreenFacts.requestFacts(node));
      if (node.attributes().containsKey("jspStateField"))
        facts.put(node.attributes().get("jspStateField"), node.attributes().get("jspStateValue"));
      Boolean visible = JspGuards.evaluate(JspGuards.guard(contains, component), facts);
      if (Boolean.FALSE.equals(visible)) continue;
      var behavior = behavior(view, component);
      if (behavior == null) continue;
      Set<String> allowed = scope(contains);
      // A submitter that moves a JSP page to another state (ADR 0183) goes to that state.
      var transitions =
          view.out(component.id(), EdgeType.NAVIGATES_TO).stream()
              .filter(
                  e -> e.evidence().stream().anyMatch(p -> p.parser().equals("JspStateTransition")))
              .toList();
      if (!transitions.isEmpty()) {
        for (var t : transitions)
          moves.add(
              new PersonaStep(screen, t.to(), "NAVIGATE", behavior.id(), status(visible, true)));
        continue;
      }
      for (var trigger : view.out(component.id(), EdgeType.TRIGGERS)) {
        String endpoint = trigger.to();
        if (view.nodes.get(endpoint) == null
            || view.nodes.get(endpoint).type() != NodeType.ENDPOINT
            || (allowed != null && !allowed.contains(endpoint))) continue;
        // The filter sends a request without the attribute to the login page instead.
        if (rule.guards(view.path(endpoint)) && !Boolean.TRUE.equals(known.get(rule.fact())))
          continue;
        List<String> requests = new ArrayList<>();
        for (var proof : trigger.evidence())
          if (proof.parser().equals("JspRequestPath")
              && Objects.toString(proof.detail(), "").startsWith(endpoint + " "))
            requests.add(proof.detail().substring(endpoint.length() + 1));
        // A literal link or form target is the request itself.
        String literal = component.attributes().get("target");
        if (requests.isEmpty()
            && literal != null
            && literal.startsWith("/")
            && !literal.startsWith("//")) requests.add(literal);
        var targets = view.screens(endpoint, requests);
        boolean anyMain = targets.containsValue(true);
        for (var target : targets.entrySet())
          moves.add(
              new PersonaStep(
                  screen,
                  target.getKey(),
                  "NAVIGATE",
                  behavior.id(),
                  status(
                      visible,
                      (!anyMain || target.getValue())
                          && sameMode(node, view.nodes.get(target.getKey())))));
      }
    }
    return moves;
  }

  /** Certain only when the element is surely there and the request goes this way normally. */
  private static PersonaStatus status(Boolean visible, boolean main) {
    return Boolean.TRUE.equals(visible) && main ? PersonaStatus.APPLIES : PersonaStatus.UNKNOWN;
  }

  private static Behavior behavior(View view, GraphNode component) {
    var own = view.behaviors.getOrDefault(component.id(), List.of());
    if (!own.isEmpty()) return own.get(0);
    String form = component.attributes().get("formId");
    var shared = form == null ? List.<Behavior>of() : view.behaviors.getOrDefault(form, List.of());
    return shared.isEmpty() ? null : shared.get(0);
  }

  private static Set<String> scope(Relationship contains) {
    for (var proof : contains.evidence())
      if (proof.parser().equals(JspScreenFacts.PARSER))
        try {
          Set<String> endpoints = new HashSet<>();
          JSON.readTree(proof.detail()).path("endpoints").forEach(e -> endpoints.add(e.asText()));
          return endpoints;
        } catch (IOException unreadable) {
          return null;
        }
    return null;
  }

  private static String json(Object value) {
    try {
      return JSON.writeValueAsString(value);
    } catch (IOException error) {
      throw new IllegalStateException(error);
    }
  }
}
