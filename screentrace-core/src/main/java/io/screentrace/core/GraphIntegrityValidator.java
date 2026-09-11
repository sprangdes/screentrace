package io.screentrace.core;

import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import java.util.*;

/** Rejects graph data that would make the prototype present a false relationship. */
public final class GraphIntegrityValidator {
  private GraphIntegrityValidator() { }

  public static void validate(ApplicationGraph graph) {
    Map<String, GraphNode> nodes = new HashMap<>();
    Set<String> routes = new HashSet<>();
    List<String> errors = new ArrayList<>();
    for (GraphNode node : graph.nodes()) {
      if (nodes.put(node.id(), node) != null) errors.add("Duplicate node: " + node.id());
      if (node.type() == NodeType.SCREEN) {
        String route = node.attributes().get("route");
        if (route != null && !routes.add(route)) errors.add("Duplicate screen route: " + route);
      }
    }
    Set<String> relationships = new HashSet<>();
    for (Relationship relationship : graph.relationships()) {
      if (!relationships.add(relationship.id())) errors.add("Duplicate relationship: " + relationship.id());
      GraphNode from = nodes.get(relationship.from()), to = nodes.get(relationship.to());
      if (from == null || to == null) { errors.add("Relationship references an unknown node: " + relationship.id()); continue; }
      if (relationship.type() == EdgeType.CONTAINS && (from.type() != NodeType.SCREEN || to.type() != NodeType.COMPONENT)) errors.add("Invalid screen component relationship: " + relationship.id());
      if (relationship.type() == EdgeType.NAVIGATES_TO) {
        if (from.type() != NodeType.COMPONENT || to.type() != NodeType.SCREEN) errors.add("Invalid navigation relationship: " + relationship.id());
        String target = from.attributes().get("target"), route = to.attributes().get("route");
        if (target == null || !target.equals(route)) errors.add("Navigation target does not match screen route: " + relationship.id());
        boolean owned = graph.relationships().stream().anyMatch(edge -> edge.type() == EdgeType.CONTAINS && edge.to().equals(from.id()));
        if (!owned) errors.add("Navigation component is not owned by a screen: " + relationship.id());
      }
    }
    if (!errors.isEmpty()) throw new IllegalStateException("Application graph validation failed:\n - " + String.join("\n - ", errors));
  }
}
