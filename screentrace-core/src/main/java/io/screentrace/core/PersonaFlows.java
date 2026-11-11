package io.screentrace.core;

import static io.screentrace.core.ApplicationGraph.*;

import java.util.*;

/**
 * Persona flows over the graph. An entry point is reached by a URL without a known query, so it
 * only renders the screens that need no URL parameter; a screen split off by a parameter ({@code
 * entryQuery}) is reached only by a navigation that targets it.
 */
public final class PersonaFlows {
  private PersonaFlows() {}

  public static ApplicationGraph enrich(ApplicationGraph graph) {
    if (graph.application().personas().isEmpty()) return graph;
    Map<String, List<String>> entries = new TreeMap<>(),
        renders = new TreeMap<>(),
        renderedBy = new TreeMap<>(),
        contained = new TreeMap<>();
    Map<String, GraphNode> nodes = new TreeMap<>();
    graph
        .nodes()
        .forEach(
            n -> {
              nodes.put(n.id(), n);
              if (n.type() == NodeType.ENTRY_POINT && n.attributes().containsKey("path"))
                add(entries, n.attributes().get("path"), n.id());
            });
    for (var e : graph.relationships()) {
      var from = nodes.get(e.from());
      var to = nodes.get(e.to());
      if (from == null || to == null) continue;
      if (e.type() == EdgeType.RENDERS
          && from.type() == NodeType.ENTRY_POINT
          && to.type() == NodeType.SCREEN) {
        add(renders, e.from(), e.to());
        add(renderedBy, e.to(), e.from());
      }
      if (e.type() == EdgeType.CONTAINS
          && from.type() == NodeType.SCREEN
          && to.type() == NodeType.COMPONENT) add(contained, e.from(), e.to());
    }
    Map<String, List<Behavior>> byTrigger = new TreeMap<>();
    for (var b : graph.behaviors())
      if (b.type() == BehaviorType.NAVIGATE && b.triggerId() != null)
        byTrigger.computeIfAbsent(b.triggerId(), x -> new ArrayList<>()).add(b);
    List<Persona> personas = new ArrayList<>();
    List<Diagnostic> diagnostics = new ArrayList<>(graph.diagnostics());
    for (var p : graph.application().personas()) {
      var starts = new TreeSet<String>();
      for (String path : p.startPaths()) {
        var found = entries.getOrDefault(path, List.of());
        starts.addAll(found);
        if (found.isEmpty()) {
          var source =
              new SourceLocation(
                  "workspace:config.json",
                  p.facts().isEmpty() ? 1 : p.facts().get(0).source().line());
          String message = "角色 " + p.id() + " 的起點 " + path + " 沒有對應的網址入口";
          diagnostics.add(
              new Diagnostic(
                  message,
                  Confidence.UNRESOLVED,
                  source,
                  "PERSONA_START_UNRESOLVED",
                  List.of(
                      new AnalysisEvidence(
                          source, "PersonaFlows", ResolutionStatus.UNRESOLVED, message))));
        }
      }
      Map<String, PersonaNavigation> navs = new HashMap<>();
      p.navigations().forEach(n -> navs.put(n.behaviorId(), n));
      Set<String> unevaluated = new HashSet<>();
      java.util.function.Function<String, List<PersonaStep>> expand =
          id -> {
            var steps = new ArrayList<PersonaStep>();
            var node = nodes.get(id);
            if (node == null) return steps;
            if (node.type() == NodeType.ENTRY_POINT)
              for (String s : renders.getOrDefault(id, List.of())) {
                if (nodes.get(s).attributes().containsKey("entryQuery")) continue;
                var status = status(p, s);
                if (status != PersonaStatus.EXCLUDED)
                  steps.add(new PersonaStep(id, s, "RENDERS", null, status));
              }
            if (node.type() == NodeType.ENTRY_POINT || node.type() == NodeType.SCREEN) {
              for (var b : byTrigger.getOrDefault(id, List.of()))
                navigate(id, "REDIRECT", b, p, navs, renderedBy, unevaluated, steps);
              if (node.type() == NodeType.SCREEN)
                for (String c : contained.getOrDefault(id, List.of()))
                  for (var b : byTrigger.getOrDefault(c, List.of()))
                    navigate(id, "NAVIGATE", b, p, navs, renderedBy, unevaluated, steps);
            }
            return steps;
          };
      var certain = bfs(starts, expand, true, null);
      var allSteps = new LinkedHashSet<PersonaStep>();
      var possible = bfs(starts, expand, false, allSteps);
      var reached = new ArrayList<PersonaReach>();
      for (var e : possible.entrySet()) {
        var node = nodes.get(e.getKey());
        if (node != null && node.type() == NodeType.SCREEN) {
          boolean applies = certain.containsKey(e.getKey());
          reached.add(
              new PersonaReach(
                  e.getKey(),
                  applies ? "REACHABLE" : "POSSIBLE",
                  applies ? certain.get(e.getKey()) : e.getValue()));
        }
      }
      var unreached =
          nodes.values().stream()
              .filter(
                  n ->
                      n.type() == NodeType.SCREEN
                          && status(p, n.id()) != PersonaStatus.EXCLUDED
                          && !possible.containsKey(n.id()))
              .map(GraphNode::id)
              .toList();
      var flow =
          new PersonaFlow(
              List.copyOf(starts), reached, unreached, List.copyOf(allSteps), unevaluated.size());
      personas.add(
          new Persona(
              p.id(),
              p.name(),
              p.description(),
              p.facts(),
              p.startPaths(),
              p.screens(),
              p.navigations(),
              flow));
    }
    var app = graph.application();
    return new ApplicationGraph(
        new Application(
            app.name(),
            app.path(),
            app.technologies(),
            app.audiences(),
            app.personaDimensions(),
            personas),
        graph.nodes(),
        graph.relationships(),
        diagnostics,
        graph.apiContracts(),
        graph.schemaVersion(),
        graph.behaviors(),
        graph.validationRules());
  }

  private static void add(Map<String, List<String>> map, String key, String value) {
    map.computeIfAbsent(key, x -> new ArrayList<>()).add(value);
    map.get(key).sort(String::compareTo);
  }

  private static PersonaStatus status(Persona p, String id) {
    return p.screens().getOrDefault(id, PersonaStatus.UNKNOWN);
  }

  private static void navigate(
      String from,
      String kind,
      Behavior b,
      Persona p,
      Map<String, PersonaNavigation> navs,
      Map<String, List<String>> renderedBy,
      Set<String> unevaluated,
      List<PersonaStep> steps) {
    var nav = navs.get(b.id());
    if (nav == null) {
      unevaluated.add(b.id());
      return;
    }
    if (nav.status() == PersonaStatus.EXCLUDED) return;
    for (String t : nav.targets()) {
      var target = status(p, t);
      if (target != PersonaStatus.EXCLUDED)
        steps.add(
            new PersonaStep(
                from,
                t,
                kind,
                b.id(),
                nav.status() == PersonaStatus.APPLIES && target == PersonaStatus.APPLIES
                    ? PersonaStatus.APPLIES
                    : PersonaStatus.UNKNOWN));
      else
        for (String entry : renderedBy.getOrDefault(t, List.of()))
          steps.add(new PersonaStep(from, entry, kind, b.id(), nav.status()));
    }
  }

  private static Map<String, Integer> bfs(
      Set<String> starts,
      java.util.function.Function<String, List<PersonaStep>> expand,
      boolean certain,
      Set<PersonaStep> collected) {
    Map<String, Integer> distances = new LinkedHashMap<>();
    var queue = new ArrayDeque<String>();
    for (String s : starts) {
      distances.put(s, 0);
      queue.add(s);
    }
    while (!queue.isEmpty()) {
      String current = queue.remove();
      for (var step : expand.apply(current)) {
        if (collected != null) collected.add(step);
        if (certain && step.status() != PersonaStatus.APPLIES) continue;
        if (!distances.containsKey(step.to())) {
          distances.put(step.to(), distances.get(current) + 1);
          queue.add(step.to());
        }
      }
    }
    return distances;
  }
}
