package io.screentrace.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.PreviewModel;
import io.screentrace.core.PrototypeModel;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Combines static preview documents with graph-derived component trace data. */
final class PreviewModelGenerator {
  private final ObjectMapper json = new ObjectMapper();

  PreviewModel generate(ApplicationGraph graph, PrototypeModel prototype, Path output) throws IOException {
    JsonNode staticDocuments = read(output.resolve("static-preview/manifest.json"));
    Map<String, List<GraphComponent>> graphComponents = graphComponents(graph);
    List<PreviewModel.PreviewScreen> screens = new ArrayList<>();
    List<PreviewModel.PreviewComponent> components = new ArrayList<>();
    for (GraphNode screen : graph.nodes()) {
      if (screen.type() != ApplicationGraph.NodeType.SCREEN) continue;
      screens.add(new PreviewModel.PreviewScreen(screen.id(), text(staticDocuments, screen.id()), 1440, 900));
      for (GraphComponent component : graphComponents.getOrDefault(screen.id(), List.of())) {
          PrototypeModel.PrototypeComponent baseline = prototype.components().stream()
              .filter(item -> item.graphComponentId().equals(component.node.id())).findFirst().orElse(null);
          components.add(new PreviewModel.PreviewComponent(component.node.id(), component.node.id(), screen.id(),
              component.node.attributes().getOrDefault("componentType", "COMPONENT"), component.node.name(),
              component.node.attributes().get("target"), component.targetScreenId, baseline == null ? null : baseline.bounds(), Map.of()));
      }
    }
    return new PreviewModel("1", screens, components);
  }

  private static Map<String, List<GraphComponent>> graphComponents(ApplicationGraph graph) {
    Map<String, GraphNode> nodes = new HashMap<>(); graph.nodes().forEach(node -> nodes.put(node.id(), node));
    Map<String, String> targetScreens = new HashMap<>();
    graph.relationships().forEach(edge -> { if (edge.type() == EdgeType.NAVIGATES_TO) targetScreens.put(edge.from(), edge.to()); });
    Map<String, List<GraphComponent>> result = new HashMap<>();
    graph.relationships().stream().filter(edge -> edge.type() == EdgeType.CONTAINS).forEach(edge -> {
      GraphNode component = nodes.get(edge.to());
      if (component != null && component.type() == ApplicationGraph.NodeType.COMPONENT)
        result.computeIfAbsent(edge.from(), ignored -> new ArrayList<>()).add(new GraphComponent(component, targetScreens.get(component.id())));
    });
    return result;
  }

  private JsonNode read(Path path) throws IOException { return Files.isRegularFile(path) ? json.readTree(path.toFile()) : json.createObjectNode(); }
  private static String text(JsonNode node, String... keys) { for (String key : keys) { if (key != null && node.hasNonNull(key)) return node.path(key).asText(); } return null; }
  private record GraphComponent(GraphNode node, String targetScreenId) {
  }
}
