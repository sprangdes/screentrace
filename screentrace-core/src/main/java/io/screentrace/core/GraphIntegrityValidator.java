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
    if (!errors.isEmpty()) {
      throw new IllegalStateException("Application graph validation failed:\n - " + String.join("\n - ", errors));
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
