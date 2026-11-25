package io.screentrace.adapter.spring;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import java.io.IOException;
import java.util.*;

/**
 * Model facts a controller branch sets before rendering a shared JSP body (for example {@code
 * adminPage} on the admin route of one handler) decide which guarded components each screen owns
 * and which literal URL alternative a shared link opens there. Only branch facts proven by {@link
 * SpringRequestConditions} on every render of the screen are used; unknown guards keep ownership.
 */
final class JspScreenFacts {
  private static final ObjectMapper JSON = new ObjectMapper();
  static final String PARSER = "JspScreenFacts";

  private JspScreenFacts() {}

  static ApplicationGraph enrich(ApplicationGraph graph) {
    Map<String, GraphNode> nodes = new HashMap<>();
    graph.nodes().forEach(n -> nodes.put(n.id(), n));
    Map<String, List<Relationship>> incoming = new HashMap<>(), outgoing = new HashMap<>();
    for (var e : graph.relationships()) {
      incoming.computeIfAbsent(e.to(), k -> new ArrayList<>()).add(e);
      outgoing.computeIfAbsent(e.from(), k -> new ArrayList<>()).add(e);
    }
    Map<String, Relationship> edges = new LinkedHashMap<>();
    graph.relationships().forEach(e -> edges.put(e.id(), e));
    boolean changed = false;
    for (GraphNode screen : graph.nodes()) {
      if (screen.type() != NodeType.SCREEN) continue;
      var facts = new TreeMap<>(facts(incoming.getOrDefault(screen.id(), List.of())));
      facts.putAll(requestFacts(screen));
      facts.putAll(sessionFacts(screen));
      if (facts.isEmpty()) continue;
      for (var edge : outgoing.getOrDefault(screen.id(), List.of())) {
        if (edge.type() != EdgeType.CONTAINS) continue;
        var component = nodes.get(edge.to());
        if (component == null) continue;
        if (Boolean.FALSE.equals(JspGuards.evaluate(JspGuards.guard(edge, component), facts))) {
          long owners =
              incoming.getOrDefault(component.id(), List.of()).stream()
                  .filter(e -> e.type() == EdgeType.CONTAINS && edges.containsKey(e.id()))
                  .count();
          if (owners > 1) edges.remove(edge.id());
          else {
            // Its only page: keep the ownership, noting the condition never holds there.
            var proof = new ArrayList<>(edge.evidence());
            proof.add(
                new AnalysisEvidence(
                    component.source(),
                    PARSER,
                    ResolutionStatus.INFERRED,
                    "此畫面條件不成立，不顯示；facts=" + facts.keySet()));
            edges.put(
                edge.id(),
                new Relationship(
                    edge.id(),
                    edge.type(),
                    edge.from(),
                    edge.to(),
                    edge.confidence(),
                    edge.source(),
                    proof));
          }
          changed = true;
          continue;
        }
        var scoped = scope(component, facts, outgoing);
        if (scoped == null) continue;
        var proof = new ArrayList<>(edge.evidence());
        proof.add(
            new AnalysisEvidence(component.source(), PARSER, ResolutionStatus.INFERRED, scoped));
        edges.put(
            edge.id(),
            new Relationship(
                edge.id(),
                edge.type(),
                edge.from(),
                edge.to(),
                edge.confidence(),
                edge.source(),
                proof));
        changed = true;
      }
    }
    if (!changed) return graph;
    return new ApplicationGraph(
        graph.application(),
        graph.nodes(),
        List.copyOf(edges.values()),
        graph.diagnostics(),
        graph.apiContracts(),
        graph.schemaVersion(),
        graph.behaviors(),
        graph.validationRules());
  }

  /** Session values a role rule proves for the screen (ADR 0188). */
  static Map<String, Object> sessionFacts(GraphNode screen) {
    String raw = screen.attributes().get(SpringSessionRoles.SESSION_FACTS);
    if (raw == null) return Map.of();
    Map<String, Object> facts = new TreeMap<>();
    try {
      JSON.readTree(raw)
          .fields()
          .forEachRemaining(
              f -> {
                if (f.getValue().isBoolean()) facts.put(f.getKey(), f.getValue().asBoolean());
              });
    } catch (IOException unreadable) {
      // No session fact.
    }
    return facts;
  }

  /** The emptiness a request-mode screen stands for (ADR 0186). */
  static Map<String, Object> requestFacts(GraphNode screen) {
    String raw = screen.attributes().get("requestFacts");
    if (raw == null) return Map.of();
    Map<String, Object> facts = new TreeMap<>();
    try {
      JSON.readTree(raw)
          .fields()
          .forEachRemaining(
              f -> {
                var empty = f.getValue().path("empty");
                if (empty.isBoolean())
                  facts.put(f.getKey(), empty.asBoolean() ? "" : JspGuards.NON_EMPTY);
              });
    } catch (IOException unreadable) {
      // No mode fact.
    }
    return facts;
  }

  /** Boolean model facts shared by every conditional render of the screen. */
  static Map<String, Object> facts(List<Relationship> incoming) {
    Map<String, Object> common = null;
    for (var edge : incoming) {
      if (edge.type() != EdgeType.RENDERS) continue;
      Map<String, Object> facts = new TreeMap<>();
      for (var proof : edge.evidence()) {
        if (!proof.parser().equals("SpringRequestCondition")) continue;
        try {
          var data = JSON.readTree(proof.detail());
          String key = data.path("modelAttribute").asText("");
          String negated = data.path("negated").asText("");
          if (!key.isEmpty() && Set.of("true", "false").contains(negated))
            facts.put(key, negated.equals("false"));
          data.path("derivedFacts")
              .fields()
              .forEachRemaining(
                  f -> {
                    if (f.getValue().isBoolean()) facts.put(f.getKey(), f.getValue().asBoolean());
                  });
        } catch (IOException unreadable) {
          // An unreadable observation adds no fact.
        }
      }
      if (common == null) common = facts;
      else common.entrySet().removeIf(f -> !Objects.equals(facts.get(f.getKey()), f.getValue()));
    }
    return common == null ? Map.of() : common;
  }

  /** The URL alternatives and endpoints a shared component keeps on one screen, or null. */
  private static String scope(
      GraphNode component, Map<String, Object> facts, Map<String, List<Relationship>> outgoing) {
    String raw = component.attributes().get("requestAlternatives");
    if (raw == null) return null;
    List<Map<String, Object>> alternatives;
    try {
      alternatives = JSON.readValue(raw, new TypeReference<>() {});
    } catch (IOException unreadable) {
      return null;
    }
    Set<String> kept = new TreeSet<>();
    Boolean earlier = Boolean.FALSE;
    for (var alternative : alternatives) {
      String guard = Objects.toString(alternative.get("guard"), "");
      Boolean holds;
      if (guard.equals("otherwise")) holds = earlier == null ? null : !earlier;
      else {
        holds = JspGuards.evaluate(guard, facts);
        // Kleene "or" of the earlier branches: an otherwise branch holds only when all of them
        // fail.
        earlier =
            Boolean.TRUE.equals(earlier) || Boolean.TRUE.equals(holds)
                ? Boolean.TRUE
                : earlier == null || holds == null ? null : Boolean.FALSE;
      }
      if (!Boolean.FALSE.equals(holds)) kept.add(Objects.toString(alternative.get("path"), ""));
    }
    if (kept.isEmpty() || kept.size() == alternatives.size()) return null;
    Set<String> endpoints = new TreeSet<>();
    for (var trigger : outgoing.getOrDefault(component.id(), List.of()))
      if (trigger.type() == EdgeType.TRIGGERS)
        for (var proof : trigger.evidence())
          if (proof.parser().equals("JspRequestPath")) {
            String[] parts = Objects.toString(proof.detail(), "").split(" ", 2);
            if (parts.length == 2 && parts[0].equals(trigger.to()) && kept.contains(parts[1]))
              endpoints.add(trigger.to());
          }
    if (endpoints.isEmpty()) return null;
    try {
      var detail = new LinkedHashMap<String, Object>();
      var shown = new TreeMap<String, Object>();
      facts.forEach((k, v) -> shown.put(k, v == JspGuards.NON_EMPTY ? "（有值）" : v));
      detail.put("facts", shown);
      detail.put("paths", kept);
      detail.put("endpoints", endpoints);
      return JSON.writeValueAsString(detail);
    } catch (IOException error) {
      throw new IllegalStateException(error);
    }
  }
}
