package io.screentrace.parser.jsp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.AnalysisEvidence;
import io.screentrace.core.ApplicationGraph.Behavior;
import io.screentrace.core.ApplicationGraph.BehaviorType;
import io.screentrace.core.ApplicationGraph.ComponentKind;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Diagnostic;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.core.StableGraphIds;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Adds React single-page screens to a graph: routes become screens, rendered interactive elements become
 * components, and handler effects become behaviors. Target sources reach the AST tool as inert JSON data.
 */
public final class ReactGraphContribution {
    public static final String PARSER = "BabelReactAnalyzer";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> EXTENSIONS = List.of(".tsx", ".jsx", ".ts", ".js", ".mjs");
    private static final Set<String> SKIPPED_DIRECTORIES = Set.of("dist", "coverage", "__tests__", "__mocks__", ".next", "out", "public", "static");
    private static final List<String> COPIED_ATTRIBUTES = List.of("type", "name", "id", "href", "role", "placeholder", "title", "aria-label", "value", "action", "method");

    private ReactGraphContribution() { }

    public static boolean applies(ProjectInventory inventory) {
        return inventory.technologies().contains("React");
    }

    public static ApplicationGraph enrich(ApplicationGraph graph, ProjectInventory inventory) {
        if (!applies(inventory)) return graph;
        var builder = new Builder(graph);
        try {
            List<String> unreadable = new ArrayList<>();
            JsonNode result = analyze(inventory, false, unreadable);
            unreadable.forEach(file -> builder.diagnostic(new SourceLocation(file, 1), "REACT_SOURCE_READ", "前端來源無法安全讀取"));
            for (JsonNode screen : result.path("screens")) builder.screen(screen);
            builder.navigation();
            for (JsonNode item : result.path("diagnostics")) builder.diagnostic(source(item), item.path("code").asText("REACT_DIAGNOSTIC"), item.path("message").asText());
        } catch (Exception error) {
            if (error instanceof InterruptedException) Thread.currentThread().interrupt();
            builder.diagnostic(new SourceLocation(".", 1), "REACT_ANALYZER_FAILURE", "React 靜態分析失敗：" + error.getMessage());
        }
        return builder.build();
    }

    /**
     * Writes `static-preview/react-preview.json`: the reconstructed markup of every React screen and the
     * stylesheets the bundle imports. The capture step turns it into static documents and screenshots.
     */
    public static void writePreview(ProjectInventory inventory, Path output) throws IOException, InterruptedException {
        if (!applies(inventory)) return;
        JsonNode result;
        try {
            result = analyze(inventory, true, new ArrayList<>());
        } catch (InterruptedException error) {
            throw error;
        } catch (Exception error) {
            throw new IOException("React 靜態預覽重建失敗：" + error.getMessage(), error);
        }
        Map<String, Object> screens = new TreeMap<>();
        for (JsonNode screen : result.path("screens")) screens.put(screenId(screen.path("file").asText(), screen.path("route").asText()), screen.path("markup").asText(""));
        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("stylesheets", result.path("stylesheets"));
        preview.put("screens", screens);
        Path target = SafeProjectFiles.requireWritePathWithin(output, output.resolve("static-preview").resolve("react-preview.json"));
        java.nio.file.Files.createDirectories(target.getParent());
        java.nio.file.Files.write(target, JSON.writeValueAsBytes(preview));
    }

    private static JsonNode analyze(ProjectInventory inventory, boolean markup, List<String> unreadable) throws Exception {
        List<Map<String, Object>> files = new ArrayList<>();
        for (Path file : inventory.files()) {
            String relative = inventory.root().relativize(file).toString().replace('\\', '/');
            if (!isSource(relative)) continue;
            try {
                files.add(Map.of("file", relative, "code", SafeProjectFiles.readUtf8Limited(inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES)));
            } catch (IOException | SecurityException error) {
                unreadable.add(relative);
            }
        }
        return JavaScriptGraphContribution.run(Map.of("mode", "react", "files", files, "markup", markup, "maxDepth", Integer.getInteger("screentrace.react.maxDepth", 24)));
    }

    static boolean isSource(String relative) {
        if (EXTENSIONS.stream().noneMatch(relative::endsWith) || relative.endsWith(".d.ts") || relative.endsWith(".min.js")) return false;
        if (relative.matches(".*\\.(test|spec|stories)\\.[cm]?[jt]sx?$")) return false;
        for (String segment : relative.split("/")) if (SKIPPED_DIRECTORIES.contains(segment)) return false;
        return true;
    }

    /** The screen ID React routes have always used, so earlier review decisions keep matching. */
    public static String screenId(String routeFile, String route) {
        return ApplicationGraph.id(NodeType.SCREEN, routeFile + ":" + route);
    }

    private static SourceLocation source(JsonNode item) {
        return new SourceLocation(item.path("source").path("file").asText("."), Math.max(1, item.path("source").path("line").asInt(1)));
    }

    private static Confidence confidence(JsonNode item) {
        return Confidence.valueOf(item.path("status").asText("UNRESOLVED"));
    }

    private static List<AnalysisEvidence> proof(SourceLocation source, Confidence confidence, String detail) {
        return List.of(new AnalysisEvidence(source, PARSER, confidence.resolutionStatus(), detail));
    }

    private static final class Builder {
        private final ApplicationGraph graph;
        private final Map<String, GraphNode> nodes = new TreeMap<>();
        private final Map<String, Relationship> edges = new TreeMap<>();
        private final Map<String, Behavior> behaviors = new TreeMap<>();
        private final List<Diagnostic> diagnostics = new ArrayList<>();
        private final Map<String, String> screensByRoute = new HashMap<>();
        private final Map<String, Integer> occurrences = new HashMap<>();
        private final List<PendingNavigation> navigations = new ArrayList<>();
        private final Map<String, List<String>> redirects = new LinkedHashMap<>();

        private Builder(ApplicationGraph graph) {
            this.graph = graph;
            graph.nodes().forEach(node -> nodes.put(node.id(), node));
            graph.relationships().forEach(edge -> edges.put(edge.id(), edge));
            graph.behaviors().forEach(behavior -> behaviors.put(behavior.id(), behavior));
            diagnostics.addAll(graph.diagnostics());
        }

        void screen(JsonNode screen) {
            String route = screen.path("route").asText();
            String routeFile = screen.path("file").asText();
            var source = new SourceLocation(routeFile, Math.max(1, screen.path("line").asInt(1)));
            String id = screenId(routeFile, route);
            Map<String, String> attributes = new TreeMap<>();
            attributes.put("route", route);
            attributes.put("view", screen.path("view").asText());
            attributes.put("viewSource", screen.path("viewSource").asText());
            List<String> sources = new ArrayList<>();
            screen.path("sources").forEach(item -> sources.add(item.asText()));
            attributes.put("viewSources", String.join("|", sources));
            attributes.put("rendering", "static-reconstruction");
            nodes.put(id, new GraphNode(id, NodeType.SCREEN, route.equals("/") ? "Home" : route.substring(1), attributes, source, Confidence.CONFIRMED,
                    proof(source, Confidence.CONFIRMED, "路由宣告；畫面元件 " + screen.path("view").asText())));
            screensByRoute.put(route, id);
            if (screen.path("redirectOnly").asBoolean()) {
                List<String> targets = new ArrayList<>();
                screen.path("redirectTo").forEach(item -> targets.add(item.asText()));
                redirects.put(id, targets);
            }
            Map<String, String> componentIds = new LinkedHashMap<>();
            for (JsonNode component : screen.path("components")) componentIds.put(component.path("key").asText(), component(id, component));
            for (JsonNode component : screen.path("components")) {
                String form = component.path("form").asText(null);
                if (form != null && componentIds.containsKey(form)) {
                    var node = nodes.get(componentIds.get(component.path("key").asText()));
                    var attributesWithForm = new TreeMap<>(node.attributes());
                    attributesWithForm.put("formId", componentIds.get(form));
                    nodes.put(node.id(), new GraphNode(node.id(), node.type(), node.name(), attributesWithForm, node.source(), node.confidence(), node.evidence()));
                }
            }
            for (JsonNode effect : screen.path("load")) behavior(id, effect);
        }

        private String component(String screenId, JsonNode component) {
            String file = component.path("file").asText();
            var kind = ComponentKind.valueOf(component.path("kind").asText("OTHER"));
            String id = StableGraphIds.component(file, kind, Map.of("instance", component.path("key").asText()), 0);
            var source = new SourceLocation(file, Math.max(1, component.path("line").asInt(1)));
            Map<String, String> attributes = new TreeMap<>();
            component.path("attrs").fields().forEachRemaining(entry -> {
                if (COPIED_ATTRIBUTES.contains(entry.getKey())) attributes.put(entry.getKey(), entry.getValue().asText());
                if (entry.getKey().equals("className")) attributes.put("class", entry.getValue().asText());
            });
            String tag = component.path("tag").asText();
            String label = component.path("label").asText(null);
            attributes.put("kind", kind.name());
            attributes.put("kindStatus", "CONFIRMED");
            attributes.put("tag", tag);
            attributes.put("componentType", componentType(kind));
            attributes.put("expansionAnchor", component.path("anchor").asText());
            attributes.put("conditional", Boolean.toString(component.hasNonNull("guard")));
            attributes.put("repeated", Boolean.toString(component.path("repeated").asBoolean()));
            if (component.hasNonNull("guard")) attributes.put("guard", component.path("guard").asText());
            if (label != null) {
                attributes.put("displayName", label);
                attributes.put("labelSource", component.path("labelSource").asText());
                if ("visibleText".equals(component.path("labelSource").asText())) attributes.put("visibleText", label);
            }
            if (component.hasNonNull("target")) attributes.put("target", component.path("target").asText());
            String name = label != null ? label : "<" + tag + ">";
            var old = nodes.get(id);
            nodes.put(id, new GraphNode(id, NodeType.COMPONENT, name, attributes, source, Confidence.CONFIRMED,
                    old == null ? proof(source, Confidence.CONFIRMED, "渲染路徑：" + component.path("anchor").asText()) : old.evidence()));
            contains(screenId, id, source);
            // A component outside the routes (an app-wide header or dialog) is the same instance on every
            // screen: it is contained by each of them, but its behaviors are recorded once.
            if (old == null) for (JsonNode effect : component.path("behaviors")) behavior(id, effect);
            return id;
        }

        private void contains(String screenId, String componentId, SourceLocation source) {
            String id = ApplicationGraph.id(NodeType.COMPONENT, EdgeType.CONTAINS + ":" + screenId + ":" + componentId);
            edges.putIfAbsent(id, new Relationship(id, EdgeType.CONTAINS, screenId, componentId, Confidence.CONFIRMED, source,
                    proof(source, Confidence.CONFIRMED, null)));
        }

        private void behavior(String triggerId, JsonNode effect) {
            var type = BehaviorType.valueOf(effect.path("type").asText("UNKNOWN"));
            String event = effect.path("event").asText("click");
            var source = source(effect);
            var confidence = confidence(effect);
            String guard = effect.path("guard").asText(null);
            String expression = effect.path("expression").asText();
            List<AnalysisEvidence> evidence = new ArrayList<>();
            for (JsonNode step : effect.path("trace"))
                evidence.add(new AnalysisEvidence(source(step), PARSER, confidence.resolutionStatus(), "跨函式呼叫：" + step.path("callee").asText()));
            if (effect.path("viaForm").asBoolean()) evidence.add(new AnalysisEvidence(source, PARSER, confidence.resolutionStatus(), "透過所屬表單的 submit 處理器"));
            List<String> urls = new ArrayList<>();
            effect.path("urls").forEach(item -> urls.add(item.asText()));
            if (type == BehaviorType.CALL_API) {
                String method = effect.path("method").asText(null);
                if (urls.isEmpty()) urls.add(null);
                for (String url : urls) {
                    Map<String, Object> detail = new LinkedHashMap<>();
                    detail.put("url", url);
                    detail.put("method", method);
                    detail.put("expression", expression);
                    String target = url == null || method == null ? null : requestEndpoint(method, url, source, confidence);
                    add(triggerId, event, type, target, guard, expression, method + " " + url, source, confidence, json(detail), evidence);
                }
                return;
            }
            if (type == BehaviorType.NAVIGATE) {
                List<String> targets = new ArrayList<>();
                effect.path("targetRoutes").forEach(item -> targets.add(item.asText()));
                var navigation = new PendingNavigation(triggerId, event, guard, expression, source, confidence, urls, targets, evidence);
                navigations.add(navigation);
                return;
            }
            add(triggerId, event, type, null, guard, expression, "", source, confidence, "無法靜態判定事件處理器：" + expression, evidence);
        }

        /** Navigation targets are screens, so they are linked once every route has been added. */
        void navigation() {
            // A route that only redirects is marked with the screens it forwards to, its own redirect first.
            redirects.forEach((id, routes) -> {
                var node = nodes.get(id);
                var attributes = new TreeMap<>(node.attributes());
                attributes.put("redirectTargets", String.join("|", routes.stream().map(screensByRoute::get).filter(java.util.Objects::nonNull).distinct().toList()));
                nodes.put(id, new GraphNode(id, node.type(), node.name(), attributes, node.source(), node.confidence(), node.evidence()));
            });
            for (var item : navigations) {
                List<String> screens = item.targets().stream().map(screensByRoute::get).filter(java.util.Objects::nonNull).sorted().toList();
                String target = screens.size() == 1 ? screens.get(0) : null;
                var confidence = screens.isEmpty() ? Confidence.UNRESOLVED : screens.size() > 1 ? Confidence.AMBIGUOUS : item.confidence();
                String detail = "目標網址=" + item.urls() + "；候選路由=" + item.targets();
                add(item.triggerId(), item.event(), BehaviorType.NAVIGATE, target, item.guard(), item.expression(), String.join(" ", item.urls()), item.source(), confidence, detail, item.evidence());
                var trigger = nodes.get(item.triggerId());
                if (trigger == null || trigger.type() != NodeType.COMPONENT) continue;
                for (String screen : screens) {
                    String id = ApplicationGraph.id(NodeType.COMPONENT, EdgeType.NAVIGATES_TO + ":" + item.triggerId() + ":" + screen);
                    String componentTarget = trigger.attributes().get("target");
                    var edgeConfidence = confidence == Confidence.CONFIRMED && componentTarget != null && !componentTarget.equals(nodes.get(screen).attributes().get("route")) ? Confidence.INFERRED : confidence;
                    edges.putIfAbsent(id, new Relationship(id, EdgeType.NAVIGATES_TO, item.triggerId(), screen, edgeConfidence, item.source(),
                            proof(item.source(), edgeConfidence, detail)));
                }
            }
        }

        /** Behavior IDs are keyed by trigger, event, type, expression and resolved target text, never by line. */
        private void add(String triggerId, String event, BehaviorType type, String target, String guard, String expression, String resolved,
                         SourceLocation source, Confidence confidence, String detail, List<AnalysisEvidence> trace) {
            String key = expression + "\u001f" + resolved;
            int occurrence = occurrences.merge(triggerId + "\u001f" + event + "\u001f" + type + "\u001f" + key, 1, Integer::sum) - 1;
            String id = StableGraphIds.behavior(triggerId, event, type, key, occurrence);
            List<AnalysisEvidence> evidence = new ArrayList<>(proof(source, confidence, detail));
            evidence.addAll(trace);
            behaviors.put(id, new Behavior(id, triggerId, event, type, target, guard, null, expression, evidence.stream().distinct().toList()));
        }

        private String requestEndpoint(String method, String url, SourceLocation source, Confidence confidence) {
            String id = ApplicationGraph.id(NodeType.ENDPOINT, "javascript-request:" + method + ":" + url);
            if (!nodes.containsKey(id)) {
                Map<String, String> attributes = new TreeMap<>();
                attributes.put("path", url);
                attributes.put("httpMethod", method);
                attributes.put("origin", "javascript-request");
                attributes.put("backendStatus", "UNRESOLVED");
                nodes.put(id, new GraphNode(id, NodeType.ENDPOINT, method + " " + url, attributes, source, confidence, proof(source, confidence, "前端請求")));
            }
            return id;
        }

        void diagnostic(SourceLocation source, String code, String message) {
            diagnostics.add(new Diagnostic(message, Confidence.UNRESOLVED, source, code, proof(source, Confidence.UNRESOLVED, message)));
        }

        ApplicationGraph build() {
            return new ApplicationGraph(graph.application(), List.copyOf(nodes.values()), List.copyOf(edges.values()), diagnostics.stream().distinct().toList(),
                    graph.apiContracts(), graph.schemaVersion(), List.copyOf(behaviors.values()), graph.validationRules());
        }
    }

    private static String componentType(ComponentKind kind) {
        return switch (kind) {
            case LINK -> "NAVIGATION";
            case SUBMIT -> "FORM_SUBMIT";
            case FORM -> "FORM";
            case BUTTON, OTHER -> "BUTTON";
            default -> "INPUT";
        };
    }

    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (IOException error) {
            throw new IllegalStateException(error);
        }
    }

    private record PendingNavigation(String triggerId, String event, String guard, String expression, SourceLocation source, Confidence confidence,
                                     List<String> urls, List<String> targets, List<AnalysisEvidence> evidence) { }
}
