package io.screentrace.report;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Adds isolated browser-captured in-page workflow states to the canonical graph. */
public final class FlowStateGraphAugmenter {
  private final ObjectMapper json = new ObjectMapper();

  public ApplicationGraph augment(ApplicationGraph graph, Path analysisDirectory) throws IOException {
    Path stateFile = analysisDirectory.resolve("flow-states.json");
    if (!Files.isRegularFile(stateFile)) return graph;
    FlowStates captured = json.readValue(stateFile.toFile(), FlowStates.class);
    if (captured.states == null || captured.states.isEmpty()) return graph;

    Map<String, GraphNode> nodesById = new HashMap<>();
    graph.nodes().forEach(node -> nodesById.put(node.id(), node));
    List<GraphNode> nodes = new ArrayList<>(graph.nodes());
    List<Relationship> relationships = new ArrayList<>(graph.relationships());
    Map<String, String> routes = new HashMap<>();
    graph.nodes().stream().filter(node -> node.type() == NodeType.SCREEN)
        .forEach(node -> routes.put(node.attributes().get("route"), node.id()));

    for (CapturedState state : captured.states) {
      GraphNode source = nodesById.get(state.sourceScreenId);
      if (!validState(state) || source == null || source.type() != NodeType.SCREEN || nodesById.containsKey(state.id) || routes.containsKey(state.route)) continue;
      Map<String, String> attributes = new LinkedHashMap<>();
      attributes.put("route", state.route);
      attributes.put("flowState", "true");
      attributes.put("flowStateLabel", state.label);
      attributes.put("sourceRoute", source.attributes().getOrDefault("route", source.name()));
      GraphNode node = new GraphNode(state.id, NodeType.SCREEN, state.name, attributes, source.source(), Confidence.INFERRED);
      nodes.add(node);
      nodesById.put(node.id(), node);
      routes.put(state.route, state.id);
    }

    for (CapturedState state : captured.states) {
      GraphNode from = nodesById.get(state.from);
      GraphNode to = nodesById.get(state.id);
      if (from == null || to == null || from.type() != NodeType.SCREEN || to.type() != NodeType.SCREEN || state.transitionLabel == null || state.transitionLabel.isBlank()) continue;
      String componentId = ApplicationGraph.id(NodeType.COMPONENT, "flow-state:" + from.id() + ":" + to.id() + ":" + state.transitionLabel);
      if (nodesById.containsKey(componentId)) continue;
      GraphNode component = new GraphNode(componentId, NodeType.COMPONENT, state.transitionLabel,
          Map.of("componentType", "BUTTON", "target", state.route, "flowStateTransition", "true"), from.source(), Confidence.INFERRED);
      nodes.add(component);
      nodesById.put(component.id(), component);
      relationships.add(new Relationship(relationshipId("contains:" + from.id() + ":" + component.id()), EdgeType.CONTAINS, from.id(), component.id(), Confidence.INFERRED, from.source()));
      relationships.add(new Relationship(relationshipId("navigates:" + component.id() + ":" + to.id()), EdgeType.NAVIGATES_TO, component.id(), to.id(), Confidence.INFERRED, from.source()));
    }
    return new ApplicationGraph(graph.application(), nodes, relationships, graph.diagnostics());
  }

  private static boolean validState(CapturedState state) {
    return state != null && nonBlank(state.id) && nonBlank(state.name) && nonBlank(state.route) && nonBlank(state.label) && nonBlank(state.sourceScreenId) && nonBlank(state.from);
  }

  private static boolean nonBlank(String value) {
    return value != null && !value.isBlank();
  }

  private static String relationshipId(String key) {
    return ApplicationGraph.id(NodeType.COMPONENT, "relationship:" + key);
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  static final class FlowStates {
    public List<CapturedState> states = List.of();
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  static final class CapturedState {
    public String id;
    public String name;
    public String route;
    public String label;
    public String sourceScreenId;
    public String from;
    public String transitionLabel;
  }
}
