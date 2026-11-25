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
    Map<String, List<Relationship>> incoming =
        graph.relationships().stream().collect(Collectors.groupingBy(Relationship::to));
    record Family(GraphNode screen, String field, List<String> values, String initial) {}
    List<Family> families = new ArrayList<>();
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
      // Entry state first, then each state in the order a submitter reaches it.
      List<String> ordered = new ArrayList<>(List.of(initial.first()));
      var bySource =
          transitions.stream()
              .sorted(Comparator.comparingInt(t -> t.button().source().line()))
              .toList();
      for (int i = 0; i < values.size(); i++)
        for (var t : bySource)
          if (ordered.contains(t.previous()) && !ordered.contains(t.next())) ordered.add(t.next());
      var ids =
          materialize(
              screen,
              field,
              ordered,
              initial.first(),
              transitions,
              null,
              ownership,
              JspScreenFacts.facts(incoming.getOrDefault(screen.id(), List.of())),
              inventory,
              units,
              nodes,
              edges,
              outgoing);
      families.add(new Family(screen, field, ordered, initial.first()));
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
    // Another screen rendering the same JSP body (e.g. the customer page of a shared Tiles body)
    // shows the same states, without the submitters that change them there.
    for (var family : families) {
      Pattern mention =
          Pattern.compile(Pattern.quote(family.field()) + "\\s+(?:eq|ne|==|!=)\\s+['\"]");
      Set<String> stateful = new HashSet<>();
      for (var edge : related(outgoing, family.screen().id(), EdgeType.CONTAINS))
        if (mention.matcher(guard(edge, nodes.get(edge.to()))).find()) stateful.add(edge.to());
      for (GraphNode sibling : graph.nodes()) {
        if (sibling.type() != NodeType.SCREEN
            || sibling.id().equals(family.screen().id())
            || !nodes.get(sibling.id()).attributes().getOrDefault("stateVariant", "").isEmpty()
            || !sibling.attributes().getOrDefault("view", "").endsWith(".jsp")) continue;
        var ownership = related(outgoing, sibling.id(), EdgeType.CONTAINS);
        if (ownership.stream()
            .noneMatch(
                e ->
                    stateful.contains(e.to())
                        && mention.matcher(guard(e, nodes.get(e.to()))).find())) continue;
        materialize(
            sibling,
            family.field(),
            family.values(),
            family.initial(),
            List.of(),
            family.screen(),
            ownership,
            JspScreenFacts.facts(incoming.getOrDefault(sibling.id(), List.of())),
            inventory,
            units,
            nodes,
            edges,
            outgoing);
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

  /** One screen node per state value; the entry value keeps the screen's own ID. */
  private static Map<String, String> materialize(
      GraphNode screen,
      String field,
      List<String> values,
      String initial,
      List<Transition> transitions,
      GraphNode sharedWith,
      List<Relationship> ownership,
      Map<String, Object> facts,
      ProjectInventory inventory,
      ParsedJavaUnits units,
      Map<String, GraphNode> nodes,
      Map<String, Relationship> edges,
      Map<String, List<Relationship>> outgoing) {
    Map<String, String> ids = new TreeMap<>();
    var labels = labels(field, new TreeSet<>(values), inventory, units);
    for (String value : values)
      ids.put(
          value,
          value.equals(initial)
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
      attributes.put("jspStateOrder", Integer.toString(values.indexOf(value)));
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
      if (sharedWith != null)
        evidence.add(
            new AnalysisEvidence(
                screen.source(),
                "JspStateVariant",
                ResolutionStatus.INFERRED,
                field + " = " + value + "；共用 JSP 內容的畫面=" + sharedWith.id()));
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
      var known = new HashMap<>(facts);
      known.put(field, value);
      for (var edge : ownership) {
        if (Boolean.FALSE.equals(JspGuards.evaluate(guard(edge, nodes.get(edge.to())), known)))
          continue;
        if (id.equals(screen.id())) edges.put(edge.id(), edge);
        else {
          String key = ApplicationGraph.id(NodeType.COMPONENT, "CONTAINS:" + id + ":" + edge.to());
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
    return ids;
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
    return JspGuards.guard(ownership, component);
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
}
