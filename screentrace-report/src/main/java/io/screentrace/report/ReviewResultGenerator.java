package io.screentrace.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Exports user review decisions in a deterministic, AI-consumable JSON contract. */
public final class ReviewResultGenerator {
  private final ObjectMapper json = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

  public Path write(Path analysisOutput, Path destination) throws IOException {
    ApplicationGraph graph = json.readValue(analysisOutput.resolve("application-graph.json").toFile(), ApplicationGraph.class);
    JsonNode interactions = json.readTree(analysisOutput.resolve("screenshots/interactions.json").toFile());
    JsonNode overlay = json.readTree(analysisOutput.resolve("edit-overlay.json").toFile());
    Map<String, String> decisions = decisions(overlay);
    Map<String, GraphNode> nodes = new HashMap<>();
    graph.nodes().forEach(node -> nodes.put(node.id(), node));

    List<Map<String, Object>> screens = new ArrayList<>();
    List<GraphNode> graphScreens = graph.nodes().stream().filter(node -> node.type() == NodeType.SCREEN)
        .sorted(Comparator.comparing(node -> node.attributes().getOrDefault("route", node.name()))).toList();
    int keptScreens = 0, removedScreens = 0, undecidedScreens = 0, keptComponents = 0, removedComponents = 0, undecidedComponents = 0;
    for (GraphNode screen : graphScreens) {
      String route = screen.attributes().getOrDefault("route", screen.name());
      String decision = decision(decisions.get(key(screen.id(), null)));
      if (decision.equals("KEEP")) keptScreens++; else if (decision.equals("REMOVE")) removedScreens++; else undecidedScreens++;
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("id", screen.id()); item.put("route", route); item.put("name", screen.name()); item.put("decision", decision); putSource(item, screen.source());
      List<Map<String, Object>> components = new ArrayList<>();
      JsonNode runtimeComponents = interactions.path(route).path("items");
      for (JsonNode component : runtimeComponents) {
        String componentId = component.path("id").asText();
        String componentDecision = decision(decisions.get(key(screen.id(), componentId)));
        if (componentDecision.equals("KEEP")) keptComponents++; else if (componentDecision.equals("REMOVE")) removedComponents++; else undecidedComponents++;
        Map<String, Object> componentItem = new LinkedHashMap<>();
        componentItem.put("id", componentId); componentItem.put("type", component.path("type").asText()); componentItem.put("label", component.path("label").asText());
        if (!component.path("target").asText().isBlank()) componentItem.put("target", component.path("target").asText());
        componentItem.put("decision", componentDecision); componentItem.put("css", json.convertValue(component.path("css"), Map.class));
        components.add(componentItem);
      }
      item.put("components", components); screens.add(item);
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("version", "1"); result.put("generatedAt", Instant.now().toString());
    result.put("application", Map.of("name", graph.application().name(), "technologies", graph.application().technologies()));
    result.put("summary", Map.of("screens", counts(keptScreens, removedScreens, undecidedScreens), "components", counts(keptComponents, removedComponents, undecidedComponents)));
    result.put("screens", screens);
    json.writeValue(destination.toFile(), result);
    return destination;
  }

  private static Map<String, String> decisions(JsonNode overlay) {
    Map<String, String> values = new HashMap<>();
    overlay.path("operations").forEach(operation -> {
      JsonNode status = operation.path("changes").path("reviewStatus");
      if (!status.isMissingNode()) values.put(key(operation.path("screenId").asText(), operation.path("componentId").isNull() ? null : operation.path("componentId").asText()), status.asText());
    });
    return values;
  }

  private static String key(String screenId, String componentId) { return screenId + "::" + (componentId == null ? "__screen__" : componentId); }
  private static String decision(String status) { return "CONFIRMED".equals(status) ? "KEEP" : "REMOVED".equals(status) ? "REMOVE" : "UNDECIDED"; }
  private static Map<String, Integer> counts(int keep, int remove, int undecided) { return Map.of("keep", keep, "remove", remove, "undecided", undecided); }
  private static void putSource(Map<String, Object> item, SourceLocation source) { if (source != null) item.put("source", Map.of("file", source.file(), "line", source.line())); }
}
