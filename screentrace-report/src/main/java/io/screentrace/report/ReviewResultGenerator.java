package io.screentrace.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.SerializationFeature;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.ApiContract;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.core.PreviewModel;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/** Exports user review decisions in a deterministic, AI-consumable JSON contract. */
/** Historical JSON export entry; remove with its fixtures in WP8. New md export must require strict 2.2. */
@Deprecated
public final class ReviewResultGenerator {
    private static final String KEEP = "KEEP";
    private static final String REMOVE = "REMOVE";
    private static final String UNDECIDED = "UNDECIDED";
    private static final String ROUTE = "route";
    private final ObjectMapper json = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT, SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);

    public Path write(Path analysisOutput, Path destination) throws IOException {
        ApplicationGraph graph = json.readValue(SafeProjectFiles.readUtf8Limited(analysisOutput, analysisOutput.resolve("application-graph.json"), 32L * 1024 * 1024), ApplicationGraph.class);
        PreviewModel preview = json.readValue(SafeProjectFiles.readUtf8Limited(analysisOutput, analysisOutput.resolve("preview-model.json"), 32L * 1024 * 1024), PreviewModel.class);
        Map<String, String> decisions = decisions(json.readTree(SafeProjectFiles.readUtf8Limited(analysisOutput, analysisOutput.resolve("edit-overlay.json"), 2L * 1024 * 1024)));
        Index index = new Index(graph, preview);
        ReviewCounts counts = new ReviewCounts();
        List<Map<String, Object>> screens = screens(index, decisions, counts);
        List<Map<String, Object>> apis = apis(index);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("version", "2");
        result.put("analysisSchemaVersion", graph.schemaVersion());
        if (!ApplicationGraph.BEHAVIOR_SCHEMA_VERSION.equals(graph.schemaVersion()))
            result.put("evidenceValidation", "歷史資料,未經 2.2 證據驗證");
        result.put("generatedAt", Instant.now().toString());
        result.put("application", Map.of("name", graph.application().name(), "technologies", graph.application().technologies()));
        result.put("summary", Map.of("screens", counts.screens(), "components", counts.components(), "apis", Map.of("total", apis.size())));
        result.put("screens", screens);
        result.put("apis", apis);
        result.put("navigation", index.navigation);
        json.writeValue(SafeProjectFiles.requireWritePathWithin(analysisOutput, destination).toFile(), result);
        return destination;
    }

    private List<Map<String, Object>> screens(Index index, Map<String, String> decisions, ReviewCounts counts) {
        return index.nodes.values().stream().filter(node -> node.type() == NodeType.SCREEN)
                .sorted(Comparator.comparing((GraphNode node) -> node.attributes().getOrDefault(ROUTE, node.name()))
                        .thenComparing(GraphNode::id))
                .map(screen -> screen(screen, index, decisions, counts)).toList();
    }

    private Map<String, Object> screen(GraphNode screen, Index index, Map<String, String> decisions, ReviewCounts counts) {
        String status = decision(decisions.get(key(screen.id(), null)));
        counts.screen(status);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", screen.id());
        item.put(ROUTE, screen.attributes().getOrDefault(ROUTE, screen.name()));
        item.put("name", screen.name());
        item.put("decision", status);
        putSource(item, screen.source());
        PreviewModel.PreviewScreen preview = index.previewScreens.get(screen.id());
        if (preview != null) {
            Map<String, Object> assets = new LinkedHashMap<>();
            putPath(assets, "staticDocument", preview.staticDocument());
            putPath(assets, "screenshot", preview.screenshot());
            if (preview.width() > 0) assets.put("width", preview.width());
            if (preview.height() > 0) assets.put("height", preview.height());
            if (!assets.isEmpty()) item.put("preview", assets);
        }
        item.put("components", index.previewByScreen.getOrDefault(screen.id(), List.of()).stream()
                .sorted(Comparator.comparing(PreviewModel.PreviewComponent::id))
                .map(component -> component(component, index, decisions, counts)).toList());
        item.put("pageApis", ids(index.pageApis, screen.id()));
        item.put("outgoingScreens", ids(index.outgoingScreens, screen.id()));
        return item;
    }

    private Map<String, Object> component(PreviewModel.PreviewComponent component, Index index,
                                        Map<String, String> decisions, ReviewCounts counts) {
        String status = decision(decisions.get(key(component.graphScreenId(), component.id())));
        counts.component(status);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", component.id());
        putText(item, "graphComponentId", component.graphComponentId());
        item.put("type", component.type());
        item.put("label", component.label());
        putText(item, "target", component.target());
        putText(item, "targetScreenId", component.targetScreenId());
        item.put("decision", status);
        if (component.bounds() != null) item.put("bounds", component.bounds());
        item.put("css", new TreeMap<>(component.css()));
        GraphNode node = index.nodes.get(component.graphComponentId());
        if (node != null && node.type() == NodeType.COMPONENT) putSource(item, node.source());
        item.put("triggeredApis", ids(index.triggeredApis, component.graphComponentId()));
        return item;
    }

    private List<Map<String, Object>> apis(Index index) {
        return index.nodes.values().stream().filter(node -> node.type() == NodeType.ENDPOINT)
                .sorted(Comparator.comparing(GraphNode::id)).map(endpoint -> api(endpoint, index)).toList();
    }

    private Map<String, Object> api(GraphNode endpoint, Index index) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", endpoint.id());
        item.put("name", endpoint.name());
        String method = firstText(endpoint.attributes().get("httpMethod"), endpoint.attributes().get("method"));
        String path = firstText(endpoint.attributes().get("path"), endpoint.attributes().get("route"));
        // Only parse the familiar literal HTTP-method + absolute request-path label.
        String name = endpoint.name();
        if (name != null && name.matches("(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT) /\\S*")) {
            int separator = name.indexOf(' ');
            if (method == null) method = name.substring(0, separator);
            if (path == null) path = name.substring(separator + 1);
        }
        putText(item, "method", method);
        putText(item, "path", path);
        ApiContract contract = index.contracts.get(endpoint.id());
        putSource(item, endpoint.source() != null ? endpoint.source() : contract == null ? null : contract.source());
        if (contract != null) {
            if (contract.confidence() != null) item.put("confidence", contract.confidence());
            if (contract.request() != null) {
                Map<String, Object> request = new LinkedHashMap<>();
                putText(request, "contentType", contract.request().contentType());
                putText(request, "bodyType", contract.request().bodyType());
                request.put("fields", fields(contract.request().fields()));
                item.put("request", request);
            }
        }
        item.put("responses", contract == null ? List.of() : contract.responses().stream()
                .map(response -> {
                    Map<String, Object> value = new LinkedHashMap<>();
                    putText(value, "status", response.status());
                    putText(value, "contentType", response.contentType());
                    putText(value, "bodyType", response.bodyType());
                    value.put("fields", fields(response.fields()));
                    putSource(value, response.source());
                    if (response.confidence() != null) value.put("confidence", response.confidence());
                    return value;
                }).sorted(Comparator.comparing(this::canonical)).toList());
        item.put("calledByScreens", ids(index.calledByScreens, endpoint.id()));
        item.put("triggeredByComponents", sortedReferences(index.triggeredByComponents.getOrDefault(endpoint.id(), List.of())));
        return item;
    }

    private List<Map<String, Object>> fields(List<ApplicationGraph.Field> fields) {
        return fields.stream().map(field -> {
            Map<String, Object> value = new LinkedHashMap<>();
            putText(value, "name", field.name());
            putText(value, "type", field.type());
            putText(value, "location", field.location());
            value.put("required", field.required());
            putSource(value, field.source());
            if (field.confidence() != null) value.put("confidence", field.confidence());
            return value;
        }).sorted(Comparator.comparing(this::canonical)).toList();
    }

    private String canonical(Map<String, Object> item) {
        try { return json.writeValueAsString(item); }
        catch (IOException exception) { throw new IllegalStateException("Cannot serialize review metadata", exception); }
    }

    private static List<Map<String, Object>> sortedReferences(List<Map<String, Object>> references) {
        return references.stream().distinct().sorted(Comparator
                .comparing((Map<String, Object> value) -> text(value, "screenId"))
                .thenComparing(value -> text(value, "componentId"))
                .thenComparing(value -> text(value, "graphComponentId"))).toList();
    }

    private static String text(Map<String, Object> value, String key) {
        return (String) value.getOrDefault(key, "");
    }

    private static String firstText(String first, String second) {
        return first != null && !first.isBlank() ? first : second != null && !second.isBlank() ? second : null;
    }

    private static void putText(Map<String, Object> item, String key, String value) {
        if (value != null && !value.isBlank()) item.put(key, value);
    }

    private static List<String> ids(Map<String, Set<String>> index, String id) {
        return new ArrayList<>(index.getOrDefault(id, Set.of()));
    }

    private static void add(Map<String, Set<String>> index, String from, String to) {
        index.computeIfAbsent(from, ignored -> new TreeSet<>()).add(to);
    }

    /** Index graph references once; preview IDs are scoped to their actual exported screen. */
    private static final class Index {
        private final Map<String, GraphNode> nodes = new HashMap<>();
        private final Map<String, PreviewModel.PreviewScreen> previewScreens = new HashMap<>();
        private final Map<String, List<PreviewModel.PreviewComponent>> previewByScreen = new HashMap<>();
        private final Map<String, List<PreviewModel.PreviewComponent>> previewByComponent = new HashMap<>();
        private final Map<String, PreviewModel.PreviewComponent> previewLookup = new HashMap<>();
        private final Map<String, ApiContract> contracts = new HashMap<>();
        private final Map<String, Set<String>> owners = new HashMap<>();
        private final Map<String, Set<String>> pageApis = new HashMap<>();
        private final Map<String, Set<String>> triggeredApis = new HashMap<>();
        private final Map<String, Set<String>> calledByScreens = new HashMap<>();
        private final Map<String, Set<String>> outgoingScreens = new HashMap<>();
        private final Map<String, List<Map<String, Object>>> triggeredByComponents = new HashMap<>();
        private final List<Map<String, Object>> navigation;

        private Index(ApplicationGraph graph, PreviewModel preview) {
            graph.nodes().forEach(node -> nodes.put(node.id(), node));
            graph.apiContracts().forEach(contract -> contracts.put(contract.endpointId(), contract));
            preview.screens().forEach(screen -> previewScreens.put(screen.graphScreenId(), screen));
            preview.components().forEach(component -> {
                if (!isType(component.graphScreenId(), NodeType.SCREEN)) return;
                previewByScreen.computeIfAbsent(component.graphScreenId(), ignored -> new ArrayList<>()).add(component);
                previewLookup.put(key(component.graphScreenId(), component.id()), component);
                if (isType(component.graphComponentId(), NodeType.COMPONENT))
                    previewByComponent.computeIfAbsent(component.graphComponentId(), ignored -> new ArrayList<>()).add(component);
            });
            Map<String, Set<String>> targets = new HashMap<>();
            List<Map<String, Object>> navigationItems = new ArrayList<>();
            for (ApplicationGraph.Relationship edge : graph.relationships()) {
                if (edge.type() == EdgeType.CONTAINS && isType(edge.from(), NodeType.SCREEN) && isType(edge.to(), NodeType.COMPONENT))
                    add(owners, edge.to(), edge.from());
                if (edge.type() == EdgeType.CALLS && isType(edge.from(), NodeType.SCREEN) && isType(edge.to(), NodeType.ENDPOINT)) {
                    add(pageApis, edge.from(), edge.to());
                    add(calledByScreens, edge.to(), edge.from());
                }
                if (edge.type() == EdgeType.TRIGGERS && isType(edge.from(), NodeType.COMPONENT) && isType(edge.to(), NodeType.ENDPOINT))
                    add(triggeredApis, edge.from(), edge.to());
                if (edge.type() == EdgeType.NAVIGATES_TO && isType(edge.to(), NodeType.SCREEN)) {
                    if (isType(edge.from(), NodeType.COMPONENT)) add(targets, edge.from(), edge.to());
                    else if (isType(edge.from(), NodeType.SCREEN)) {
                        add(outgoingScreens, edge.from(), edge.to());
                        navigationItems.add(navigationItem(edge.from(), edge.to(), null, null));
                    }
                }
            }
            triggeredApis.forEach((componentId, endpoints) -> {
                List<Map<String, Object>> references = componentReferences(componentId);
                endpoints.forEach(endpoint -> triggeredByComponents.computeIfAbsent(endpoint, ignored -> new ArrayList<>()).addAll(references));
            });
            targets.forEach((componentId, screens) -> {
                for (Map<String, Object> reference : componentReferences(componentId)) {
                    String owner = text(reference, "screenId");
                    if (!owners.getOrDefault(componentId, Set.of()).contains(owner)) continue;
                    for (String target : screens) {
                        add(outgoingScreens, owner, target);
                        String previewId = (String) reference.get("componentId");
                        PreviewModel.PreviewComponent component = previewId == null ? null : previewLookup.get(key(owner, previewId));
                        navigationItems.add(navigationItem(owner, target, nodes.get(componentId), component));
                    }
                }
            });
            navigation = navigationItems.stream().distinct().sorted(Comparator
                    .comparing((Map<String, Object> value) -> text(value, "fromScreenId"))
                    .thenComparing(value -> text(value, "toScreenId"))
                    .thenComparing(value -> text(value, "componentId"))
                    .thenComparing(value -> text(value, "graphComponentId"))).toList();
        }

        private boolean isType(String id, NodeType type) {
            GraphNode node = nodes.get(id);
            return node != null && node.type() == type;
        }

        private List<Map<String, Object>> componentReferences(String componentId) {
            List<Map<String, Object>> references = new ArrayList<>();
            Set<String> represented = new TreeSet<>();
            for (PreviewModel.PreviewComponent component : previewByComponent.getOrDefault(componentId, List.of())) {
                represented.add(component.graphScreenId());
                references.add(Map.of("screenId", component.graphScreenId(), "componentId", component.id()));
            }
            for (String owner : ids(owners, componentId)) {
                if (!represented.contains(owner)) references.add(Map.of("screenId", owner, "graphComponentId", componentId));
            }
            return references;
        }

        private static Map<String, Object> navigationItem(String from, String to, GraphNode node,
                                                         PreviewModel.PreviewComponent component) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("fromScreenId", from);
            item.put("toScreenId", to);
            if (component != null) item.put("componentId", component.id());
            if (node != null) {
                item.put("graphComponentId", node.id());
                putText(item, "label", component == null ? node.name() : component.label());
                putText(item, "target", component == null ? node.attributes().get("target") : component.target());
            }
            return item;
        }
    }

    private static Map<String, String> decisions(JsonNode overlay) {
        Map<String, String> values = new HashMap<>();
        overlay.path("operations").forEach(operation -> {
            JsonNode status = operation.path("changes").path("reviewStatus");
            if (!status.isMissingNode()) {
                String componentId = operation.hasNonNull("componentId") ? operation.path("componentId").asText() : null;
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
        if (source == null || !relativePath(source.file())) return;
        Map<String, Object> location = new LinkedHashMap<>();
        location.put("file", source.file());
        if (source.line() > 0) location.put("line", source.line());
        item.put("source", location);
    }

    private static void putPath(Map<String, Object> item, String key, String path) {
        if (relativePath(path)) item.put(key, path);
    }

    private static boolean relativePath(String path) {
        return path != null && !path.isBlank() && !path.startsWith("/") && !path.startsWith("\\")
                && !path.matches("^[A-Za-z][A-Za-z0-9+.-]*:.*");
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
