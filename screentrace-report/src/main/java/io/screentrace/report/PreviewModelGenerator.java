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

/** Consolidates browser-rendered static preview assets into the report contract. */
final class PreviewModelGenerator {
  private final ObjectMapper json = new ObjectMapper();

  PreviewModel generate(ApplicationGraph graph, PrototypeModel prototype, Path output) throws IOException {
    JsonNode staticDocuments = read(output.resolve("static-preview/manifest.json"));
    JsonNode screenshots = read(output.resolve("screenshots/manifest.json"));
    JsonNode interactions = read(output.resolve("screenshots/interactions.json"));
    Map<String, PrototypeModel.PrototypeScreen> prototypes = new HashMap<>();
    prototype.screens().forEach(screen -> prototypes.put(screen.graphScreenId(), screen));
    Map<String, List<GraphComponent>> graphComponents = graphComponents(graph);
    List<PreviewModel.PreviewScreen> screens = new ArrayList<>();
    List<PreviewModel.PreviewComponent> components = new ArrayList<>();
    for (GraphNode screen : graph.nodes()) {
      if (screen.type() != ApplicationGraph.NodeType.SCREEN) continue;
      String route = screen.attributes().getOrDefault("route", screen.name());
      JsonNode captured = interaction(interactions, screen.id(), route);
      PrototypeModel.PrototypeScreen prototypeScreen = prototypes.get(screen.id());
      screens.add(new PreviewModel.PreviewScreen(screen.id(), text(staticDocuments, screen.id()),
          text(screenshots, screen.id(), route, prototypeScreen == null ? null : prototypeScreen.screenshot()),
          captured.path("width").asInt(1440), captured.path("height").asInt(900)));
      if (captured.has("items")) {
        for (JsonNode item : captured.path("items")) components.add(component(screen.id(), item, graphComponents.getOrDefault(screen.id(), List.of())));
      } else for (GraphComponent component : graphComponents.getOrDefault(screen.id(), List.of())) {
          PrototypeModel.PrototypeComponent baseline = prototype.components().stream()
              .filter(item -> item.graphComponentId().equals(component.node.id())).findFirst().orElse(null);
          components.add(new PreviewModel.PreviewComponent(component.node.id(), component.node.id(), screen.id(),
              component.node.attributes().getOrDefault("componentType", "COMPONENT"), component.node.name(),
              component.node.attributes().get("target"), component.targetScreenId, baseline == null ? null : baseline.bounds(), Map.of()));
      }
    }
    return new PreviewModel("1", screens, components);
  }

  private PreviewModel.PreviewComponent component(String screenId, JsonNode item, List<GraphComponent> graphComponents) {
    String type = item.path("type").asText("COMPONENT");
    String label = item.path("label").asText();
    String target = optional(item, "target");
    GraphComponent graphComponent = graphComponents.stream().filter(candidate -> candidate.matches(type, label, target)).findFirst().orElse(null);
    JsonNode bounds = item.path("bounds");
    return new PreviewModel.PreviewComponent(item.path("id").asText(), graphComponent == null ? null : graphComponent.node.id(), screenId,
        type, label, target, optional(item, "targetScreenId", graphComponent == null ? null : graphComponent.targetScreenId),
        bounds.isMissingNode() ? null : new PrototypeModel.Bounds(bounds.path("x").asInt(), bounds.path("y").asInt(),
            bounds.path("width").asInt(), bounds.path("height").asInt()), css(item.path("css")));
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
  private static JsonNode interaction(JsonNode interactions, String id, String route) { return interactions.path(id).has("items") ? interactions.path(id) : interactions.path(route); }
  private static String text(JsonNode node, String... keys) { for (String key : keys) { if (key != null && node.hasNonNull(key)) return node.path(key).asText(); } return null; }
  private static String optional(JsonNode node, String name) { return node.hasNonNull(name) ? node.path(name).asText() : null; }
  private static String optional(JsonNode node, String name, String fallback) { String value = optional(node, name); return value == null ? fallback : value; }
  private static Map<String, String> css(JsonNode node) { Map<String, String> values = new HashMap<>(); node.fields().forEachRemaining(entry -> values.put(entry.getKey(), entry.getValue().asText())); return values; }
  private record GraphComponent(GraphNode node, String targetScreenId) {
    boolean matches(String type, String label, String target) {
      if (!node.attributes().getOrDefault("componentType", "COMPONENT").equals(type)) return false;
      String sourceTarget = node.attributes().get("target");
      return java.util.Objects.equals(sourceTarget, target)
          && node.name().equals(label) || routeTemplateMatches(sourceTarget, target);
    }

    private static boolean routeTemplateMatches(String template, String value) {
      if (template == null || value == null || !template.startsWith("/") || !value.startsWith("/")) return false;
      String[] templateSegments = template.replaceFirst("^/", "").split("/");
      String[] valueSegments = value.replaceFirst("^/", "").split("/");
      if (templateSegments.length != valueSegments.length) return false;
      for (int index = 0; index < templateSegments.length; index++) {
        String expected = templateSegments[index];
        if (expected.equals("*") || expected.startsWith("{") && expected.endsWith("}")) continue;
        if (!expected.equals(valueSegments[index])) return false;
      }
      return true;
    }
  }
}
