package io.screentrace.report;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.Relationship;
import io.screentrace.core.PrototypeModel;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Converts source-derived graph relationships into an editable visual baseline. */
final class PrototypeModelGenerator {
  private static final String ROUTE = "route";
  private static final String COMPONENT_TYPE = "componentType";
  private static final String ACTION = "action";
  private static final int COMPONENTS_PER_COLUMN = 6;

  PrototypeModel generate(ApplicationGraph graph) {
    Map<String, PrototypeModel.PrototypeScreen> screens = screens(graph);
    return new PrototypeModel("1", new ArrayList<>(screens.values()), components(graph, screens));
  }

  private static Map<String, PrototypeModel.PrototypeScreen> screens(ApplicationGraph graph) {
    Map<String, PrototypeModel.PrototypeScreen> screens = new HashMap<>();
    for (GraphNode node : graph.nodes()) {
      if (node.type() == ApplicationGraph.NodeType.SCREEN) {
        String route = node.attributes().getOrDefault(ROUTE, "");
        screens.put(
            node.id(),
            new PrototypeModel.PrototypeScreen(
                "prototype:" + node.id(), node.id(), node.name(), route, screenshot(route)));
      }
    }
    return screens;
  }

  private static List<PrototypeModel.PrototypeComponent> components(
      ApplicationGraph graph, Map<String, PrototypeModel.PrototypeScreen> screens) {
    Map<String, GraphNode> nodesById = nodesById(graph);
    Map<EdgeType, Map<String, Relationship>> firstFrom = firstRelationshipFrom(graph);
    List<PrototypeModel.PrototypeComponent> components = new ArrayList<>();
    int index = 0;
    for (Relationship contains : graph.relationships()) {
      GraphNode component = componentFor(contains, screens, nodesById);
      if (component != null) {
        components.add(component(firstFrom, screens, contains, component, index));
        index++;
      }
    }
    return components;
  }

  private static GraphNode componentFor(
      Relationship contains,
      Map<String, PrototypeModel.PrototypeScreen> screens,
      Map<String, GraphNode> nodesById) {
    if (contains.type() != EdgeType.CONTAINS || !screens.containsKey(contains.from())) {
      return null;
    }
    return nodesById.get(contains.to());
  }

  private static PrototypeModel.PrototypeComponent component(
      Map<EdgeType, Map<String, Relationship>> firstFrom,
      Map<String, PrototypeModel.PrototypeScreen> screens,
      Relationship contains,
      GraphNode component,
      int index) {
    Relationship navigation = relationshipFrom(firstFrom, EdgeType.NAVIGATES_TO, component.id());
    Relationship request = relationshipFrom(firstFrom, EdgeType.TRIGGERS, component.id());
    PrototypeModel.PrototypeScreen owner = screens.get(contains.from());
    return new PrototypeModel.PrototypeComponent(
        "prototype:" + component.id(),
        owner.id(),
        component.id(),
        component.attributes().getOrDefault(COMPONENT_TYPE, "COMPONENT"),
        component.name(),
        bounds(index),
        Map.of(),
        new PrototypeModel.PrototypeAction(
            component.attributes().getOrDefault(ACTION, "NONE"),
            targetScreen(screens, navigation),
            targetEndpoint(request)),
        component.source(),
        component.confidence());
  }

  private static Map<String, GraphNode> nodesById(ApplicationGraph graph) {
    Map<String, GraphNode> nodes = new HashMap<>();
    for (GraphNode node : graph.nodes()) {
      nodes.put(node.id(), node);
    }
    return nodes;
  }

  /** The first relationship of each type from each node, in graph order (HC-004). */
  static Map<EdgeType, Map<String, Relationship>> firstRelationshipFrom(ApplicationGraph graph) {
    Map<EdgeType, Map<String, Relationship>> first = new EnumMap<>(EdgeType.class);
    for (Relationship relationship : graph.relationships())
      first
          .computeIfAbsent(relationship.type(), type -> new HashMap<>())
          .putIfAbsent(relationship.from(), relationship);
    return first;
  }

  private static Relationship relationshipFrom(
      Map<EdgeType, Map<String, Relationship>> firstFrom, EdgeType type, String id) {
    return firstFrom.getOrDefault(type, Map.of()).get(id);
  }

  private static String targetScreen(
      Map<String, PrototypeModel.PrototypeScreen> screens, Relationship navigation) {
    if (navigation == null) {
      return null;
    }
    PrototypeModel.PrototypeScreen screen = screens.get(navigation.to());
    return screen == null ? null : screen.id();
  }

  private static String targetEndpoint(Relationship request) {
    return request == null ? null : request.to();
  }

  private static PrototypeModel.Bounds bounds(int index) {
    return new PrototypeModel.Bounds(32, 80 + index % COMPONENTS_PER_COLUMN * 52, 320, 40);
  }

  private static String screenshot(String route) {
    if (route == null || route.isBlank()) return null;
    String path = route.equals("/") ? "home" : route.substring(1);
    return "screenshots/" + path.replace("/", "__").replaceAll("[:?=&]", "_") + ".png";
  }
}
