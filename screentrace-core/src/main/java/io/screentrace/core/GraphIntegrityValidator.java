package io.screentrace.core;

import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Rejects graph data that would make the prototype present a false relationship. */
public final class GraphIntegrityValidator {
    private GraphIntegrityValidator() {
    }

    public static void validate(ApplicationGraph graph) {
        List<String> errors = new ArrayList<>();
        Map<String, GraphNode> nodes = validateNodes(graph.nodes(), errors);
        validateRelationships(graph.relationships(), nodes, errors);
        if (!errors.isEmpty()) {
            throw new IllegalStateException("Application graph validation failed:\n - " + String.join("\n - ", errors));
        }
    }

    private static Map<String, GraphNode> validateNodes(List<GraphNode> graphNodes, List<String> errors) {
        Map<String, GraphNode> nodes = new HashMap<>();
        Set<String> routes = new HashSet<>();
        for (GraphNode node : graphNodes) {
            validateNode(node, nodes, routes, errors);
        }
        return nodes;
    }

    private static void validateNode(GraphNode node, Map<String, GraphNode> nodes, Set<String> routes, List<String> errors) {
        if (nodes.put(node.id(), node) != null) {
            errors.add("Duplicate node: " + node.id());
        }
        if (node.type() == NodeType.SCREEN) {
            validateRoute(node, routes, errors);
        }
    }

    private static void validateRoute(GraphNode node, Set<String> routes, List<String> errors) {
        String route = node.attributes().get("route");
        if (route != null && !routes.add(route)) {
            errors.add("Duplicate screen route: " + route);
        }
    }

    private static void validateRelationships(List<Relationship> relationships, Map<String, GraphNode> nodes, List<String> errors) {
        Set<String> identifiers = new HashSet<>();
        Set<String> containedComponents = containedComponents(relationships);
        for (Relationship relationship : relationships) {
            validateRelationship(relationship, nodes, identifiers, containedComponents, errors);
        }
    }

    private static Set<String> containedComponents(List<Relationship> relationships) {
        Set<String> components = new HashSet<>();
        for (Relationship relationship : relationships) {
            if (relationship.type() == EdgeType.CONTAINS) {
                components.add(relationship.to());
            }
        }
        return components;
    }

    private static void validateRelationship(Relationship relationship, Map<String, GraphNode> nodes, Set<String> identifiers,
            Set<String> containedComponents, List<String> errors) {
        if (!identifiers.add(relationship.id())) {
            errors.add("Duplicate relationship: " + relationship.id());
        }
        GraphNode from = nodes.get(relationship.from());
        GraphNode to = nodes.get(relationship.to());
        if (from == null || to == null) {
            errors.add("Relationship references an unknown node: " + relationship.id());
            return;
        }
        validateContains(relationship, from, to, errors);
        validateNavigation(relationship, from, to, containedComponents, errors);
    }

    private static void validateContains(Relationship relationship, GraphNode from, GraphNode to, List<String> errors) {
        if (relationship.type() == EdgeType.CONTAINS && (from.type() != NodeType.SCREEN || to.type() != NodeType.COMPONENT)) {
            errors.add("Invalid screen component relationship: " + relationship.id());
        }
    }

    private static void validateNavigation(Relationship relationship, GraphNode from, GraphNode to, Set<String> containedComponents,
            List<String> errors) {
        if (relationship.type() != EdgeType.NAVIGATES_TO) {
            return;
        }
        if (from.type() != NodeType.COMPONENT || to.type() != NodeType.SCREEN) {
            errors.add("Invalid navigation relationship: " + relationship.id());
        }
        validateNavigationTarget(relationship, from, to, errors);
        if (!containedComponents.contains(from.id())) {
            errors.add("Navigation component is not owned by a screen: " + relationship.id());
        }
    }

    private static void validateNavigationTarget(Relationship relationship, GraphNode from, GraphNode to, List<String> errors) {
        String target = from.attributes().get("target");
        String route = to.attributes().get("route");
        if (target == null || !target.equals(route)) {
            errors.add("Navigation target does not match screen route: " + relationship.id());
        }
    }
}
