package io.screentrace.core;

import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import java.util.*;

/** Rejects graph data that would make a framework-neutral report present a false relationship. */
public final class GraphIntegrityValidator {
  private GraphIntegrityValidator() { }

  public static void validate(ApplicationGraph graph) {
    List<String> errors = new ArrayList<>();
    validateSchema(graph, errors);
    Map<String, GraphNode> nodes = validateNodes(graph.nodes(), errors);
    validateRelationships(graph.relationships(), nodes, errors);
    validateApiContracts(graph.apiContracts(), nodes, errors);
    validateBehaviors(graph, nodes, errors);
    if (ApplicationGraph.BEHAVIOR_SCHEMA_VERSION.equals(graph.schemaVersion())) validateStrictEvidence(graph, errors);
    if (!errors.isEmpty()) {
      throw new IllegalStateException("Application graph validation failed:\n - " + String.join("\n - ", errors));
    }
  }

  private static void validateStrictEvidence(ApplicationGraph graph, List<String> errors) {
    for (GraphNode node : graph.nodes()) {
      requireEvidence(node.id(), node.evidence(), errors);
      if (node.type() == NodeType.COMPONENT) {
        try { ApplicationGraph.ComponentKind.valueOf(node.attributes().getOrDefault("kind", "")); }
        catch (IllegalArgumentException invalid) { errors.add("Missing or invalid component kind: " + node.id()); }
      }
    }
    for (Relationship edge : graph.relationships()) requireEvidence(edge.id(), edge.evidence(), errors);
  }

  private static void requireEvidence(String owner, List<ApplicationGraph.AnalysisEvidence> evidence, List<String> errors) {
    if (evidence.isEmpty()) errors.add("Missing evidence: " + owner);
    for (var item : evidence) {
      if (item.source() == null || item.source().file() == null || item.source().file().isBlank() || item.source().line() < 1
          || item.source().file().startsWith("/") || item.source().file().matches("^[A-Za-z]:.*")
          || Arrays.asList(item.source().file().replace('\\', '/').split("/")).contains("..")) errors.add("Missing or invalid source: " + owner);
      if (item.parser() == null || item.parser().isBlank() || Set.of("UNKNOWN", "LEGACY").contains(item.parser())) errors.add("Missing parser: " + owner);
      if (item.resolution() == null) errors.add("Missing resolution: " + owner);
    }
  }

  private static void validateBehaviors(ApplicationGraph graph, Map<String, GraphNode> nodes, List<String> errors) {
    Map<String, ApplicationGraph.Behavior> behaviors = new HashMap<>();
    Map<String, ApplicationGraph.ValidationRule> rules = new HashMap<>();
    for (var rule : graph.validationRules()) {
      if (rule.id() == null || rule.id().isBlank() || rules.put(rule.id(), rule) != null || nodes.containsKey(rule.id())) errors.add("Duplicate or blank validation id: " + rule.id());
      if (rule.kind() == null || rule.kind().isBlank() || rule.fields().isEmpty() || rule.layer() == null) errors.add("Incomplete validation rule: " + rule.id());
      requireEvidence(rule.id(), rule.evidence(), errors);
    }
    for (var behavior : graph.behaviors()) {
      if (behavior.id() == null || behavior.id().isBlank() || behaviors.put(behavior.id(), behavior) != null || nodes.containsKey(behavior.id()) || rules.containsKey(behavior.id())) errors.add("Duplicate or blank behavior id: " + behavior.id());
      if (behavior.event() == null || behavior.event().isBlank() || behavior.type() == null) errors.add("Incomplete behavior: " + behavior.id());
      GraphNode trigger = nodes.get(behavior.triggerId());
      if (behavior.triggerId() != null && (trigger == null || !Set.of(NodeType.COMPONENT, NodeType.SCREEN).contains(trigger.type()))) errors.add("Invalid behavior trigger: " + behavior.id());
      if (behavior.triggerId() == null && behavior.parentId() == null) errors.add("Behavior has no trigger or parent: " + behavior.id());
      requireEvidence(behavior.id(), behavior.evidence(), errors);
      if (behavior.targetId() != null) {
        GraphNode target = nodes.get(behavior.targetId());
        boolean valid = behavior.type() != null && switch (behavior.type()) {
          case VALIDATE -> rules.containsKey(behavior.targetId());
          case NAVIGATE -> target != null && target.type() == NodeType.SCREEN;
          case CALL_API, SUBMIT_FORM -> target != null && target.type() == NodeType.ENDPOINT;
          case OPEN_DIALOG -> target != null && target.type() == NodeType.COMPONENT && "MODAL".equals(target.attributes().get("kind"));
          default -> target != null || rules.containsKey(behavior.targetId());
        };
        if (!valid) errors.add("Invalid behavior target: " + behavior.id());
      }
    }
    for (var behavior : graph.behaviors()) {
      Set<String> seen = new HashSet<>();
      var current = behavior;
      while (current.parentId() != null) {
        if (!seen.add(current.id())) { errors.add("Behavior parent cycle: " + behavior.id()); break; }
        current = behaviors.get(current.parentId());
        if (current == null) { errors.add("Unknown behavior parent: " + behavior.id()); break; }
      }
    }
  }

  private static void validateApiContracts(List<ApplicationGraph.ApiContract> contracts,
                                           Map<String, GraphNode> nodes, List<String> errors) {
    Set<String> endpointIds = new HashSet<>();
    for (ApplicationGraph.ApiContract contract : contracts) {
      GraphNode endpoint = nodes.get(contract.endpointId());
      if (endpoint == null || endpoint.type() != NodeType.ENDPOINT) {
        errors.add("API contract references an unknown endpoint: " + contract.endpointId());
      } else if (!endpointIds.add(contract.endpointId())) {
        errors.add("Duplicate API contract: " + contract.endpointId());
      }
    }
  }

  private static void validateSchema(ApplicationGraph graph, List<String> errors) {
    if (!ApplicationGraph.SUPPORTED_SCHEMA_VERSIONS.contains(graph.schemaVersion())) {
      errors.add("Unsupported schema version: " + graph.schemaVersion());
    }
  }

  private static Map<String, GraphNode> validateNodes(List<GraphNode> graphNodes, List<String> errors) {
    Map<String, GraphNode> nodes = new HashMap<>();
    Set<String> routes = new HashSet<>();
    for (GraphNode node : graphNodes) {
      if (node.id() == null || node.id().isBlank()) errors.add("Node has no id");
      else if (nodes.put(node.id(), node) != null) errors.add("Duplicate node: " + node.id());
      if (node.type() == null) errors.add("Node has no type: " + node.id());
      if (node.type() == NodeType.SCREEN) validateRoute(node, routes, errors);
      validateEvidence(node.id(), node.evidence(), errors);
    }
    return nodes;
  }

  private static void validateRoute(GraphNode node, Set<String> routes, List<String> errors) {
    String route = node.attributes().get("route");
    if (route != null && !routes.add(route)) errors.add("Duplicate screen route: " + route);
  }

  private static void validateEvidence(String owner, List<ApplicationGraph.AnalysisEvidence> evidence, List<String> errors) {
    for (ApplicationGraph.AnalysisEvidence item : evidence) {
      if (item.source() != null && (item.source().file() == null || item.source().file().isBlank() || item.source().line() < 1)) {
        errors.add("Invalid evidence source for: " + owner);
      }
    }
  }

  private static void validateRelationships(List<Relationship> relationships, Map<String, GraphNode> nodes, List<String> errors) {
    Set<String> identifiers = new HashSet<>();
    Set<String> containedComponents = containedComponents(relationships);
    for (Relationship relationship : relationships) {
      if (relationship.id() == null || relationship.id().isBlank() || !identifiers.add(relationship.id())) {
        errors.add("Duplicate or blank relationship: " + relationship.id());
      }
      GraphNode from = nodes.get(relationship.from());
      GraphNode to = nodes.get(relationship.to());
      if (from == null || to == null) {
        errors.add("Relationship references an unknown node: " + relationship.id());
        continue;
      }
      validateRelationship(relationship, from, to, containedComponents, errors);
      validateEvidence(relationship.id(), relationship.evidence(), errors);
    }
  }

  private static Set<String> containedComponents(List<Relationship> relationships) {
    Set<String> components = new HashSet<>();
    for (Relationship relationship : relationships) if (relationship.type() == EdgeType.CONTAINS) components.add(relationship.to());
    return components;
  }

  private static void validateRelationship(Relationship edge, GraphNode from, GraphNode to,
                                           Set<String> containedComponents, List<String> errors) {
    switch (edge.type()) {
      case CONTAINS -> require(edge, from, to, NodeType.SCREEN, NodeType.COMPONENT, errors);
      case HANDLED_BY -> require(edge, from, to, NodeType.ENDPOINT, NodeType.HANDLER, errors);
      case RENDERS -> requireTarget(edge, from, to, Set.of(NodeType.HANDLER), Set.of(NodeType.SCREEN, NodeType.VIEW), errors);
      case NAVIGATES_TO -> validateNavigation(edge, from, to, containedComponents, errors);
      case TRIGGERS -> requireTarget(edge, from, to, Set.of(NodeType.COMPONENT), Set.of(NodeType.ENDPOINT, NodeType.ENTRY_POINT), errors);
      case INCLUDES -> requireTarget(edge, from, to, Set.of(NodeType.SCREEN, NodeType.VIEW, NodeType.TEMPLATE_FRAGMENT), Set.of(NodeType.VIEW, NodeType.TEMPLATE_FRAGMENT), errors);
      case BINDS_TO -> require(edge, from, to, NodeType.COMPONENT, NodeType.FORM_MODEL, errors);
      case FORWARDS_TO -> requireTarget(edge, from, to, Set.of(NodeType.HANDLER, NodeType.ENDPOINT), Set.of(NodeType.SCREEN, NodeType.VIEW), errors);
      case CALLS -> requireTarget(edge, from, to, Set.of(NodeType.SCREEN, NodeType.HANDLER, NodeType.COMPONENT), Set.of(NodeType.ENDPOINT, NodeType.INTEGRATION), errors);
      case DECLARED_BY, DEFINED_IN -> { /* Evidence-bearing provenance is intentionally framework-neutral. */ }
    }
  }

  private static void require(Relationship edge, GraphNode from, GraphNode to, NodeType expectedFrom, NodeType expectedTo, List<String> errors) {
    requireTarget(edge, from, to, Set.of(expectedFrom), Set.of(expectedTo), errors);
  }

  private static void requireTarget(Relationship edge, GraphNode from, GraphNode to,
                                    Set<NodeType> fromTypes, Set<NodeType> toTypes, List<String> errors) {
    if (!fromTypes.contains(from.type()) || !toTypes.contains(to.type())) {
      errors.add("Invalid " + edge.type() + " relationship: " + edge.id());
    }
  }

  private static void validateNavigation(Relationship edge, GraphNode from, GraphNode to,
                                         Set<String> containedComponents, List<String> errors) {
    require(edge, from, to, NodeType.COMPONENT, NodeType.SCREEN, errors);
    if (!containedComponents.contains(from.id())) errors.add("Navigation component is not owned by a screen: " + edge.id());
    String target = from.attributes().get("target");
    String route = to.attributes().get("route");
    String view = to.attributes().get("view");
    if (edge.confidence() == ApplicationGraph.Confidence.CONFIRMED && target != null && !target.equals(route) && !target.equals(view)) {
      errors.add("Navigation target does not match screen route or view: " + edge.id());
    }
  }
}
