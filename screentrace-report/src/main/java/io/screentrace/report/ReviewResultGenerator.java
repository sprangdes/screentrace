package io.screentrace.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import java.io.IOException;
import java.nio.file.Files;
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
    private static final String KEEP = "KEEP";
    private static final String REMOVE = "REMOVE";
    private static final String UNDECIDED = "UNDECIDED";
    private static final String ROUTE = "route";
    private final ObjectMapper json = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    public Path write(Path analysisOutput, Path destination) throws IOException {
        ApplicationGraph graph = json.readValue(analysisOutput.resolve("application-graph.json").toFile(), ApplicationGraph.class);
        JsonNode interactions = interactions(analysisOutput);
        Map<String, String> decisions = decisions(json.readTree(analysisOutput.resolve("edit-overlay.json").toFile()));
        ReviewCounts counts = new ReviewCounts();
        List<Map<String, Object>> screens = screens(graph, interactions, decisions, counts);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("version", "1");
        result.put("generatedAt", Instant.now().toString());
        result.put("application", Map.of("name", graph.application().name(), "technologies", graph.application().technologies()));
        result.put("summary", Map.of("screens", counts.screens(), "components", counts.components()));
        result.put("screens", screens);
        json.writeValue(destination.toFile(), result);
        return destination;
    }

    private JsonNode interactions(Path analysisOutput) throws IOException {
        Path file = analysisOutput.resolve("screenshots/interactions.json");
        return Files.exists(file) ? json.readTree(file.toFile()) : json.createObjectNode();
    }

    private List<Map<String, Object>> screens(ApplicationGraph graph, JsonNode interactions, Map<String, String> decisions, ReviewCounts counts) {
        List<Map<String, Object>> screens = new ArrayList<>();
        graph.nodes().stream().filter(node -> node.type() == NodeType.SCREEN)
                .sorted(Comparator.comparing(node -> node.attributes().getOrDefault(ROUTE, node.name())))
                .forEach(screen -> screens.add(screen(screen, interactions, decisions, counts)));
        return screens;
    }

    private Map<String, Object> screen(GraphNode screen, JsonNode interactions, Map<String, String> decisions, ReviewCounts counts) {
        String route = screen.attributes().getOrDefault(ROUTE, screen.name());
        String status = decision(decisions.get(key(screen.id(), null)));
        counts.screen(status);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", screen.id());
        item.put(ROUTE, route);
        item.put("name", screen.name());
        item.put("decision", status);
        putSource(item, screen.source());
        item.put("components", components(screen, interactions.path(route).path("items"), decisions, counts));
        return item;
    }

    private List<Map<String, Object>> components(GraphNode screen, JsonNode runtimeComponents, Map<String, String> decisions, ReviewCounts counts) {
        List<Map<String, Object>> components = new ArrayList<>();
        for (JsonNode component : runtimeComponents) {
            String id = component.path("id").asText();
            String status = decision(decisions.get(key(screen.id(), id)));
            counts.component(status);
            components.add(component(component, id, status));
        }
        return components;
    }

    private Map<String, Object> component(JsonNode component, String id, String status) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("type", component.path("type").asText());
        item.put("label", component.path("label").asText());
        String target = component.path("target").asText();
        if (!target.isBlank()) {
            item.put("target", target);
        }
        item.put("decision", status);
        item.put("css", json.convertValue(component.path("css"), Map.class));
        return item;
    }

    private static Map<String, String> decisions(JsonNode overlay) {
        Map<String, String> values = new HashMap<>();
        overlay.path("operations").forEach(operation -> {
            JsonNode status = operation.path("changes").path("reviewStatus");
            if (!status.isMissingNode()) {
                String componentId = operation.path("componentId").isNull() ? null : operation.path("componentId").asText();
                values.put(key(operation.path("screenId").asText(), componentId), status.asText());
            }
        });
        return values;
    }

    private static String key(String screenId, String componentId) {
        return screenId + "::" + (componentId == null ? "__screen__" : componentId);
    }

    private static String decision(String status) {
        if ("CONFIRMED".equals(status)) {
            return KEEP;
        }
        if ("REMOVED".equals(status)) {
            return REMOVE;
        }
        return UNDECIDED;
    }

    private static void putSource(Map<String, Object> item, SourceLocation source) {
        if (source != null) {
            item.put("source", Map.of("file", source.file(), "line", source.line()));
        }
    }

    private static final class ReviewCounts {
        private int keptScreens;
        private int removedScreens;
        private int undecidedScreens;
        private int keptComponents;
        private int removedComponents;
        private int undecidedComponents;

        private void screen(String decision) {
            if (KEEP.equals(decision)) {
                keptScreens++;
            } else if (REMOVE.equals(decision)) {
                removedScreens++;
            } else {
                undecidedScreens++;
            }
        }

        private void component(String decision) {
            if (KEEP.equals(decision)) {
                keptComponents++;
            } else if (REMOVE.equals(decision)) {
                removedComponents++;
            } else {
                undecidedComponents++;
            }
        }

        private Map<String, Integer> screens() {
            return countSummary(keptScreens, removedScreens, undecidedScreens);
        }

        private Map<String, Integer> components() {
            return countSummary(keptComponents, removedComponents, undecidedComponents);
        }

        private static Map<String, Integer> countSummary(int keep, int remove, int undecided) {
            return Map.of("keep", keep, "remove", remove, "undecided", undecided);
        }
    }
}
