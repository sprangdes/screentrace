package io.screentrace.adapter.spring;

import com.github.javaparser.ast.body.EnumDeclaration;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.io.IOException;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Finite JSP states connected by a guarded POST submitter and a proven redirect to its page. */
final class JspStateVariants {
  private static final Pattern EQUALITY =
      Pattern.compile(
          "([A-Za-z_][\\w]*(?:\\.[A-Za-z_][\\w]*)*)\\s+(eq|ne|==|!=)\\s+(['\"])([A-Z][A-Z0-9_]{0,63})\\3");
  private static final Pattern EL = Pattern.compile("\\$\\{([^{}]+)}");
  private static final Pattern GUARD = Pattern.compile("；guard=(.*?)；repeated=", Pattern.DOTALL);
  private static final Pattern VALUE = Pattern.compile("[A-Z][A-Z0-9_]{0,63}");

  private record Transition(
      GraphNode button,
      Relationship request,
      Relationship navigation,
      String field,
      String previous,
      String next) {}

  static ApplicationGraph enrich(
      ApplicationGraph graph, ProjectInventory inventory, ParsedJavaUnits units) {
    Map<String, GraphNode> nodes =
        graph.nodes().stream()
            .collect(
                Collectors.toMap(GraphNode::id, n -> n, (first, second) -> first, TreeMap::new));
    Map<String, List<Relationship>> outgoing =
        graph.relationships().stream().collect(Collectors.groupingBy(Relationship::from));
    Map<String, Relationship> edges =
        graph.relationships().stream()
            .collect(
                Collectors.toMap(Relationship::id, e -> e, (first, second) -> first, TreeMap::new));
    var contracts =
        graph.apiContracts().stream()
            .collect(Collectors.toMap(ApiContract::endpointId, c -> c, (first, second) -> first));
    for (GraphNode screen : graph.nodes()) {
      if (screen.type() != NodeType.SCREEN
          || screen.attributes().containsKey("stateVariant")
          || !screen.attributes().getOrDefault("view", "").endsWith(".jsp")) continue;
      var ownership = related(outgoing, screen.id(), EdgeType.CONTAINS);
      var transitions = transitions(screen, ownership, nodes, outgoing, contracts);
      if (transitions.isEmpty()
          || transitions.stream().map(Transition::field).distinct().count() != 1) continue;
      var field = transitions.get(0).field();
      var initial =
          transitions.stream()
              .map(Transition::previous)
              .collect(Collectors.toCollection(TreeSet::new));
      transitions.forEach(t -> initial.remove(t.next()));
      if (initial.size() != 1) continue;
      Set<String> values = new TreeSet<>(initial);
      for (int i = 0; i < 8; i++)
        for (var t : transitions) if (values.contains(t.previous())) values.add(t.next());
      if (values.size() < 2
          || values.size() > 8
          || transitions.stream().anyMatch(t -> !values.contains(t.previous()))) continue;

      Map<String, String> ids = new TreeMap<>();
      var labels = labels(field, values, inventory, units);
      for (String value : values)
        ids.put(
            value,
            value.equals(initial.first())
                ? screen.id()
                : ApplicationGraph.id(
                    NodeType.SCREEN, screen.id() + ":jsp-state:" + field + "=" + value));
      for (var edge : ownership) edges.remove(edge.id());
      for (String value : values) {
        String id = ids.get(value);
        var attributes = new TreeMap<>(screen.attributes());
        attributes.put("stateVariant", field + " = " + value);
        attributes.put("jspStateField", field);
        attributes.put("jspStateValue", value);
        if (labels.containsKey(value)) attributes.put("jspStateLabel", labels.get(value));
        var evidence = new ArrayList<>(screen.evidence());
        transitions.stream()
            .filter(t -> t.previous().equals(value) || t.next().equals(value))
            .forEach(
                t ->
                    evidence.add(
                        new AnalysisEvidence(
                            t.button().source(),
                            "JspStateVariant",
                            ResolutionStatus.INFERRED,
                            field + " = " + value)));

        if (!id.equals(screen.id())) attributes.put("stateVariantOf", screen.id());
        nodes.put(
            id,
            new GraphNode(
                id,
                screen.type(),
                screen.name(),
                attributes,
                screen.source(),
                Confidence.INFERRED,
                evidence,
                screen.audience()));
        if (!id.equals(screen.id()))
          for (var include : related(outgoing, screen.id(), EdgeType.INCLUDES)) {
            String key =
                ApplicationGraph.id(
                    NodeType.TEMPLATE_FRAGMENT, "INCLUDES:" + id + ":" + include.to());
            edges.put(
                key,
                new Relationship(
                    key,
                    EdgeType.INCLUDES,
                    id,
                    include.to(),
                    include.confidence(),
                    include.source(),
                    include.evidence()));
          }
        for (var edge : ownership) {
          String guard = guard(edge, nodes.get(edge.to()));
          if (!visible(guard, field, value)) continue;
          if (id.equals(screen.id())) edges.put(edge.id(), edge);
          else {
            String key =
                ApplicationGraph.id(NodeType.COMPONENT, "CONTAINS:" + id + ":" + edge.to());
            edges.put(
                key,
                new Relationship(
                    key,
                    EdgeType.CONTAINS,
                    id,
                    edge.to(),
                    edge.confidence(),
                    edge.source(),
                    edge.evidence()));
          }
        }
      }
      for (var t : transitions) {
        var old = t.navigation();
        edges.remove(old.id());
        String to = ids.get(t.next());
        String id =
            ApplicationGraph.id(NodeType.COMPONENT, "NAVIGATES_TO:" + t.button().id() + ":" + to);
        var proof = new ArrayList<>(old.evidence());
        proof.add(
            new AnalysisEvidence(
                t.button().source(),
                "JspStateTransition",
                ResolutionStatus.INFERRED,
                t.request().to()));
        edges.put(
            id,
            new Relationship(
                id,
                EdgeType.NAVIGATES_TO,
                t.button().id(),
                to,
                Confidence.INFERRED,
                t.button().source(),
                proof));
      }
    }
    if (nodes.size() == graph.nodes().size()) return graph;
    return new ApplicationGraph(
        graph.application(),
        List.copyOf(nodes.values()),
        List.copyOf(edges.values()),
        graph.diagnostics(),
        graph.apiContracts(),
        graph.schemaVersion(),
        graph.behaviors(),
        graph.validationRules());
  }

  private static List<Transition> transitions(
      GraphNode screen,
      List<Relationship> ownership,
      Map<String, GraphNode> nodes,
      Map<String, List<Relationship>> outgoing,
      Map<String, ApiContract> contracts) {
    List<Transition> found = new ArrayList<>();
    for (var edge : ownership) {
      var button = nodes.get(edge.to());
      if (!"SUBMIT".equals(button.attributes().get("kind"))) continue;
      String name = button.attributes().getOrDefault("name", "");
      String next = button.attributes().getOrDefault("value", "");
      if (name.isEmpty() || !VALUE.matcher(next).matches()) continue;
      var requests = related(outgoing, button.id(), EdgeType.TRIGGERS);
      if (requests.size() != 1) continue;
      var request = requests.get(0);
      var endpoint = nodes.get(request.to());
      if (!"POST".equals(endpoint.attributes().get("httpMethod"))) continue;
      var contract = contracts.get(endpoint.id());
      if (contract == null
          || contract.request() == null
          || contract.request().fields().stream()
              .noneMatch(
                  f ->
                      f.name().equals(name)
                          && "QUERY".equals(f.location())
                          && f.confidence() == Confidence.CONFIRMED)) continue;
      var handlers = related(outgoing, endpoint.id(), EdgeType.HANDLED_BY);
      if (handlers.size() != 1) continue;
      var returns = related(outgoing, handlers.get(0).to(), EdgeType.FORWARDS_TO);
      var destinations = related(outgoing, button.id(), EdgeType.NAVIGATES_TO);
      if (returns.isEmpty()
          || returns.stream().anyMatch(e -> !e.to().equals(screen.id()))
          || destinations.size() != 1
          || !destinations.get(0).to().equals(screen.id())) continue;
      String guard = guard(edge, button);
      var clauses = EL.matcher(guard);
      Set<String> matched = new HashSet<>();
      Transition transition = null;
      while (clauses.find()) {
        var match = EQUALITY.matcher(clauses.group(1).strip());
        if (!match.matches() || !Set.of("eq", "==").contains(match.group(2))) continue;
        String field = match.group(1), previous = match.group(4);
        String root = field.split("\\.", 2)[0];
        if (!root.toLowerCase(Locale.ROOT).endsWith(name.toLowerCase(Locale.ROOT))
            || previous.equals(next)) continue;
        matched.add(field + "=" + previous);
        transition = new Transition(button, request, destinations.get(0), field, previous, next);
      }
      if (matched.size() == 1) found.add(transition);
    }
    return found;
  }

  private static List<Relationship> related(
      Map<String, List<Relationship>> outgoing, String from, EdgeType type) {
    return outgoing.getOrDefault(from, List.of()).stream().filter(e -> e.type() == type).toList();
  }

  private static String guard(Relationship ownership, GraphNode component) {
    for (var evidence : ownership.evidence()) {
      var match = GUARD.matcher(Objects.toString(evidence.detail(), ""));
      if (match.find()) return match.group(1);
    }
    return component.attributes().getOrDefault("guard", "");
  }

  private static Map<String, String> labels(
      String field, Set<String> values, ProjectInventory inventory, ParsedJavaUnits units) {
    String root = field.split("\\.", 2)[0];
    var files =
        inventory.javaFiles().stream()
            .filter(p -> p.getFileName().toString().equalsIgnoreCase(root + ".java"))
            .toList();
    if (files.size() != 1) return Map.of();
    try {
      for (var type : units.parse(files.get(0)).findAll(EnumDeclaration.class))
        if (type.getNameAsString().equalsIgnoreCase(root)) {
          var labels = new TreeMap<String, String>();
          for (var entry : type.getEntries())
            if (entry.getArguments().size() == 1 && entry.getArgument(0).isStringLiteralExpr())
              labels.put(
                  entry.getNameAsString(), entry.getArgument(0).asStringLiteralExpr().asString());
          return labels.keySet().containsAll(values) ? labels : Map.of();
        }
    } catch (IOException | RuntimeException error) {
      // The JSP comparison and submitter still supply the state codes.
    }
    return Map.of();
  }

  private static boolean visible(String guard, String field, String value) {
    var clauses = EL.matcher(guard);
    while (clauses.find()) {
      boolean reachable = false;
      for (String alternative : clauses.group(1).split("\\s+(?:or|\\|\\|)\\s+")) {
        boolean contradicted =
            Arrays.stream(alternative.split("\\s+(?:and|&&)\\s+"))
                .anyMatch(
                    atom -> {
                      var match = EQUALITY.matcher(atom.strip());
                      return match.matches()
                          && match.group(1).equals(field)
                          && (value.equals(match.group(4))
                              != Set.of("eq", "==").contains(match.group(2)));
                    });
        if (!contradicted) reachable = true;
      }
      if (!reachable) return false;
    }
    return true;
  }
}
