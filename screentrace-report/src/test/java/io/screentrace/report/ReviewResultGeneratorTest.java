package io.screentrace.report;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.core.EditOverlay;
import io.screentrace.core.PreviewModel;
import io.screentrace.core.PreviewModel.*;
import io.screentrace.core.PrototypeModel.Bounds;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReviewResultGeneratorTest {
    @TempDir Path output;
    private final ObjectMapper json = new ObjectMapper();

    @Test void preservesReviewDecisionsAndCountsIncludingLastOperation() throws Exception {
        Fixture fixture = fixture();
        JsonNode result = export(fixture);
        assertEquals("2", result.path("version").asText());
        assertEquals("KEEP", screen(result, "screen:orders").path("decision").asText());
        assertEquals("REMOVE", screen(result, "screen:detail").path("decision").asText());
        assertEquals("UNDECIDED", screen(result, "screen:next").path("decision").asText());
        JsonNode components = screen(result, "screen:orders").path("components");
        assertEquals("KEEP", components.get(0).path("decision").asText());
        assertEquals("REMOVE", components.get(1).path("decision").asText());
        assertEquals("UNDECIDED", components.get(2).path("decision").asText());
        assertEquals(json.readTree("{\"keep\":1,\"remove\":1,\"undecided\":1}"), result.path("summary").path("screens"));
        assertEquals(result.path("summary").path("screens"), result.path("summary").path("components"));
        assertEquals(3, result.path("summary").path("apis").path("total").asInt());
        assertFalse(result.path("application").has("contextPath"));
        assertFalse(result.path("application").has("path"));
    }

    @Test void exportsPreviewMetadataAndGraphComponentSource() throws Exception {
        JsonNode result = export(fixture());
        JsonNode screen = screen(result, "screen:orders");
        assertEquals("src/main/webapp/orders.jsp", screen.path("source").path("file").asText());
        assertEquals(json.readTree("""
                {"staticDocument":"static-preview/orders.html","screenshot":"screenshots/orders.png","width":1440,"height":900}
                """), screen.path("preview"));
        JsonNode component = screen.path("components").get(0);
        assertEquals("static-1", component.path("id").asText());
        assertEquals("component:submit", component.path("graphComponentId").asText());
        assertEquals("/orders/submit", component.path("target").asText());
        assertEquals("screen:detail", component.path("targetScreenId").asText());
        assertEquals(json.readTree("{\"x\":120,\"y\":350,\"width\":100,\"height\":36}"), component.path("bounds"));
        assertEquals("red", component.path("css").path("color").asText());
        assertEquals(87, component.path("source").path("line").asInt());
    }

    @Test void separatesPageCallsFromComponentTriggersAndMapsBackReferences() throws Exception {
        JsonNode result = export(fixture());
        JsonNode orders = screen(result, "screen:orders");
        assertEquals(json.readTree("[\"endpoint:load\"]"), orders.path("pageApis"));
        assertEquals(json.readTree("[\"endpoint:submit\"]"), orders.path("components").get(0).path("triggeredApis"));
        assertEquals(json.readTree("[]"), orders.path("components").get(1).path("triggeredApis"));
        assertEquals(json.readTree("[\"screen:orders\"]"), api(result, "endpoint:load").path("calledByScreens"));
        assertEquals(json.readTree("[{\"screenId\":\"screen:orders\",\"componentId\":\"static-1\"}]"),
                api(result, "endpoint:submit").path("triggeredByComponents"));
        assertEquals(json.readTree("[{\"screenId\":\"screen:orders\",\"graphComponentId\":\"component:uncaptured\"}]"),
                api(result, "endpoint:unknown").path("triggeredByComponents"));
        for (JsonNode api : result.path("apis")) assertFalse(api.has("decision"));
    }

    @Test void exportsOnlyDirectNavigationAndDeduplicatesRelationships() throws Exception {
        JsonNode result = export(fixture());
        assertEquals(json.readTree("[\"screen:detail\"]"), screen(result, "screen:orders").path("outgoingScreens"));
        assertEquals(json.readTree("[\"screen:next\"]"), screen(result, "screen:detail").path("outgoingScreens"));
        assertEquals(2, result.path("navigation").size());
        JsonNode nav = result.path("navigation").get(1);
        assertEquals("screen:orders", nav.path("fromScreenId").asText());
        assertEquals("screen:detail", nav.path("toScreenId").asText());
        assertEquals("static-1", nav.path("componentId").asText());
        assertEquals("component:submit", nav.path("graphComponentId").asText());
        assertEquals("送出", nav.path("label").asText());
        assertEquals("/orders/submit", nav.path("target").asText());
        assertFalse(result.path("navigation").get(0).has("componentId"));
    }

    @Test void preservesRealApiContractsAndConservativelyResolvesMethodAndPath() throws Exception {
        JsonNode result = export(fixture());
        JsonNode api = api(result, "endpoint:submit");
        assertEquals("POST", api.path("method").asText());
        assertEquals("/api/orders", api.path("path").asText());
        assertEquals("application/json", api.path("request").path("contentType").asText());
        assertEquals("OrderRequest", api.path("request").path("bodyType").asText());
        JsonNode field = api.path("request").path("fields").get(0);
        assertEquals("orderId", field.path("name").asText());
        assertEquals("Long", field.path("type").asText());
        assertEquals("body", field.path("location").asText());
        assertTrue(field.path("required").asBoolean());
        assertEquals("CONFIRMED", field.path("confidence").asText());
        JsonNode response = api.path("responses").get(0);
        assertEquals("201", response.path("status").asText());
        assertEquals("OrderResponse", response.path("bodyType").asText());
        assertEquals(json.readTree("[]"), response.path("fields"));
        assertEquals(52, api.path("source").path("line").asInt());
        assertEquals("GET", api(result, "endpoint:load").path("method").asText());
        assertEquals("/api/orders", api(result, "endpoint:load").path("path").asText());
        assertFalse(api(result, "endpoint:unknown").has("method"));
        assertFalse(api(result, "endpoint:unknown").has("path"));
    }

    @Test void toleratesMissingMetadataAndRetainsEmptyLists() throws Exception {
        JsonNode result = export(fixture());
        JsonNode bare = screen(result, "screen:next");
        assertFalse(bare.has("source"));
        assertFalse(bare.has("preview"));
        for (String key : List.of("components", "pageApis", "outgoingScreens")) assertEquals(json.readTree("[]"), bare.path(key));
        JsonNode component = screen(result, "screen:orders").path("components").get(2);
        for (String key : List.of("source", "bounds", "target", "targetScreenId", "graphComponentId")) assertFalse(component.has(key));
        assertEquals(json.readTree("{}"), component.path("css"));
        JsonNode api = api(result, "endpoint:unknown");
        assertFalse(api.has("source"));
        assertFalse(api.has("request"));
        assertEquals(json.readTree("[]"), api.path("responses"));
        assertEquals(json.readTree("[]"), api.path("calledByScreens"));
        JsonNode empty = export(new Fixture(new ApplicationGraph(new Application("empty", "/private/project", null), null, null, null),
                new PreviewModel("1", null, null), new EditOverlay("1", null)));
        for (String key : List.of("screens", "apis", "navigation")) assertEquals(json.readTree("[]"), empty.path(key));
    }

    @Test void outputIsByteStableExceptTimestampAcrossPermutedInputs() throws Exception {
        Fixture original = fixture();
        export(original);
        String first = Files.readString(output.resolve("review-result.json")).replaceAll("\"generatedAt\" : \"[^\"]+\"", "\"generatedAt\" : \"fixed\"");
        ApplicationGraph g = original.graph();
        Fixture shuffled = new Fixture(new ApplicationGraph(g.application(), reversed(g.nodes()), reversed(g.relationships()),
                g.diagnostics(), reversed(g.apiContracts()), g.schemaVersion()),
                new PreviewModel("1", reversed(original.preview().screens()), reversed(original.preview().components())), original.overlay());
        export(shuffled);
        String second = Files.readString(output.resolve("review-result.json")).replaceAll("\"generatedAt\" : \"[^\"]+\"", "\"generatedAt\" : \"fixed\"");
        assertEquals(first, second);
        JsonNode result = json.readTree(second);
        assertEquals("screen:detail", result.path("screens").get(0).path("id").asText());
        assertEquals("endpoint:load", result.path("apis").get(0).path("id").asText());
    }

    @Test void mapsSharedGraphComponentToEveryActualPreviewIdAndFallsBackPerScreen() throws Exception {
        Fixture f = fixture();
        List<PreviewComponent> components = new ArrayList<>(f.preview().components());
        components.add(new PreviewComponent("static-shared", "component:submit", "screen:detail", "BUTTON", "送出", null, null, null, null));
        components.add(new PreviewComponent("orphan", "component:submit", "screen:missing", "BUTTON", "送出", null, null, null, null));
        List<Relationship> relationships = new ArrayList<>(f.graph().relationships());
        relationships.add(edge("shared", EdgeType.CONTAINS, "screen:detail", "component:submit"));
        relationships.add(edge("uncaptured-owner", EdgeType.CONTAINS, "screen:next", "component:submit"));
        JsonNode result = export(new Fixture(new ApplicationGraph(f.graph().application(), f.graph().nodes(), relationships, List.of(),
                f.graph().apiContracts(), ApplicationGraph.CURRENT_SCHEMA_VERSION), new PreviewModel("1", f.preview().screens(), components), f.overlay()));
        assertEquals(json.readTree("""
                [{"screenId":"screen:detail","componentId":"static-shared"},
                 {"screenId":"screen:next","graphComponentId":"component:submit"},
                 {"screenId":"screen:orders","componentId":"static-1"}]
                """), api(result, "endpoint:submit").path("triggeredByComponents"));
    }

    @Test void sortsAndDeduplicatesEveryRelationshipIdArray() throws Exception {
        Fixture f = fixture();
        List<Relationship> relationships = new ArrayList<>(f.graph().relationships());
        relationships.add(edge("extra-trigger", EdgeType.TRIGGERS, "component:submit", "endpoint:load"));
        relationships.add(edge("extra-call", EdgeType.CALLS, "screen:orders", "endpoint:submit"));
        relationships.add(edge("extra-caller", EdgeType.CALLS, "screen:detail", "endpoint:load"));
        relationships.add(edge("extra-navigation", EdgeType.NAVIGATES_TO, "component:submit", "screen:next"));
        relationships.add(edge("extra-navigation-duplicate", EdgeType.NAVIGATES_TO, "component:submit", "screen:next"));
        JsonNode result = export(new Fixture(new ApplicationGraph(f.graph().application(), f.graph().nodes(), relationships,
                List.of(), f.graph().apiContracts(), "2.1"), f.preview(), f.overlay()));
        JsonNode screen = screen(result, "screen:orders");
        assertEquals(json.readTree("[\"endpoint:load\",\"endpoint:submit\"]"), screen.path("pageApis"));
        assertEquals(screen.path("pageApis"), screen.path("components").get(0).path("triggeredApis"));
        assertEquals(json.readTree("[\"screen:detail\",\"screen:next\"]"), screen.path("outgoingScreens"));
        assertEquals(json.readTree("[\"screen:detail\",\"screen:orders\"]"), api(result, "endpoint:load").path("calledByScreens"));
        assertEquals(3, result.path("navigation").size());
    }

    @Test void navigationRequiresGraphOwnershipAndDoesNotInventContainsRelationships() throws Exception {
        Fixture f = fixture();
        List<Relationship> relationships = f.graph().relationships().stream().filter(edge -> edge.type() != EdgeType.CONTAINS).toList();
        JsonNode result = export(new Fixture(new ApplicationGraph(f.graph().application(), f.graph().nodes(), relationships,
                List.of(), f.graph().apiContracts(), "2.1"), f.preview(), f.overlay()));
        assertEquals(json.readTree("[]"), screen(result, "screen:orders").path("outgoingScreens"));
        assertEquals(1, result.path("navigation").size());
        assertEquals("screen:detail", result.path("navigation").get(0).path("fromScreenId").asText());
    }

    @Test void omitsAbsoluteSourceAndAssetPathsIncludingNestedContractSources() throws Exception {
        Fixture f = fixture();
        List<GraphNode> nodes = new ArrayList<>(f.graph().nodes());
        nodes.add(node("screen:absolute", NodeType.SCREEN, "Absolute", Map.of("route", "/absolute"), new SourceLocation("/private/project/page.jsp", 1)));
        nodes.add(node("endpoint:absolute", NodeType.ENDPOINT, "unknown", Map.of(), new SourceLocation("C:\\project\\Controller.java", 0)));
        ApiContract contract = new ApiContract("endpoint:absolute", new Request(null, null, List.of(
                new Field("x", "String", "body", false, new SourceLocation("/private/DTO.java", 1), null))),
                List.of(new Response("200", null, null, null, new SourceLocation("file:///private/Controller.java", 2), null)), null, null);
        JsonNode result = export(new Fixture(new ApplicationGraph(f.graph().application(), nodes, List.of(), List.of(), List.of(contract), "2.1"),
                new PreviewModel("1", List.of(new PreviewScreen("screen:absolute", "/private/page.html", "data:image/png;base64,test", 0, 0)), List.of()), f.overlay()));
        assertFalse(screen(result, "screen:absolute").has("source"));
        assertFalse(screen(result, "screen:absolute").has("preview"));
        JsonNode api = api(result, "endpoint:absolute");
        assertFalse(api.has("source"));
        assertFalse(api.path("request").path("fields").get(0).has("source"));
        assertFalse(api.path("responses").get(0).has("source"));
    }

    @Test void refusesWritesOutsideAnalysisRootAndSymlinkedInputsOrDestination() throws Exception {
        Fixture f = fixture();
        export(f);
        ReviewResultGenerator generator = new ReviewResultGenerator();
        assertThrows(Exception.class, () -> generator.write(output, output.resolve("../outside-review.json")));
        Path victim = output.resolve("victim.json");
        Files.writeString(victim, "original");
        Files.delete(output.resolve("review-result.json"));
        Files.createSymbolicLink(output.resolve("review-result.json"), victim);
        assertThrows(Exception.class, () -> generator.write(output, output.resolve("review-result.json")));
        assertEquals("original", Files.readString(victim));
        Files.delete(output.resolve("review-result.json"));
        Files.move(output.resolve("application-graph.json"), output.resolve("graph-real.json"));
        Files.createSymbolicLink(output.resolve("application-graph.json"), output.resolve("graph-real.json"));
        assertThrows(Exception.class, () -> generator.write(output, output.resolve("review-result.json")));
    }

    @Test void generatesDocumentationExampleUsingTheRealExporter() throws Exception {
        export(fixture());
        Path example = Path.of("target/review-result-example/review-result.json");
        Files.createDirectories(example.getParent());
        Files.copy(output.resolve("review-result.json"), example, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        assertEquals("2", json.readTree(example.toFile()).path("version").asText());
    }

    private JsonNode export(Fixture fixture) throws Exception {
        json.writeValue(output.resolve("application-graph.json").toFile(), fixture.graph());
        json.writeValue(output.resolve("preview-model.json").toFile(), fixture.preview());
        json.writeValue(output.resolve("edit-overlay.json").toFile(), fixture.overlay());
        new ReviewResultGenerator().write(output, output.resolve("review-result.json"));
        return json.readTree(output.resolve("review-result.json").toFile());
    }

    private static JsonNode screen(JsonNode result, String id) { return byId(result.path("screens"), id); }
    private static JsonNode api(JsonNode result, String id) { return byId(result.path("apis"), id); }
    private static JsonNode byId(JsonNode array, String id) {
        for (JsonNode node : array) if (id.equals(node.path("id").asText())) return node;
        throw new AssertionError("Missing " + id);
    }
    private static <T> List<T> reversed(List<T> items) { List<T> result = new ArrayList<>(items); Collections.reverse(result); return result; }
    private static GraphNode node(String id, NodeType type, String name, Map<String, String> attributes, SourceLocation source) {
        return new GraphNode(id, type, name, attributes, source, Confidence.CONFIRMED);
    }
    private static Relationship edge(String id, EdgeType type, String from, String to) {
        return new Relationship(id, type, from, to, Confidence.CONFIRMED, null);
    }
    private static EditOverlay.EditOperation review(String screen, String component, String status) {
        return new EditOverlay.EditOperation(screen, component, EditOverlay.Operation.UPDATE, Map.of("reviewStatus", status));
    }
    private static Fixture fixture() {
        SourceLocation jsp = new SourceLocation("src/main/webapp/orders.jsp", 1);
        SourceLocation controller = new SourceLocation("src/main/java/example/OrderController.java", 52);
        List<GraphNode> nodes = List.of(
                node("screen:orders", NodeType.SCREEN, "Orders", Map.of("route", "/orders"), jsp),
                node("screen:detail", NodeType.SCREEN, "Detail", Map.of("route", "/detail"), jsp),
                node("screen:next", NodeType.SCREEN, "Next", Map.of("route", "/next"), null),
                node("component:submit", NodeType.COMPONENT, "Submit", Map.of("target", "/orders/submit"), new SourceLocation(jsp.file(), 87)),
                node("component:uncaptured", NodeType.COMPONENT, "Not captured", Map.of(), null),
                node("endpoint:submit", NodeType.ENDPOINT, "POST /api/orders", Map.of("httpMethod", "POST", "path", "/api/orders"), controller),
                node("endpoint:load", NodeType.ENDPOINT, "GET /api/orders", Map.of(), null),
                node("endpoint:unknown", NodeType.ENDPOINT, "unresolved", Map.of(), null));
        List<Relationship> edges = List.of(
                edge("contains", EdgeType.CONTAINS, "screen:orders", "component:submit"),
                edge("contains2", EdgeType.CONTAINS, "screen:orders", "component:uncaptured"),
                edge("call", EdgeType.CALLS, "screen:orders", "endpoint:load"),
                edge("call-duplicate", EdgeType.CALLS, "screen:orders", "endpoint:load"),
                edge("trigger", EdgeType.TRIGGERS, "component:submit", "endpoint:submit"),
                edge("trigger-duplicate", EdgeType.TRIGGERS, "component:submit", "endpoint:submit"),
                edge("uncaptured", EdgeType.TRIGGERS, "component:uncaptured", "endpoint:unknown"),
                edge("navigation", EdgeType.NAVIGATES_TO, "component:submit", "screen:detail"),
                edge("navigation-duplicate", EdgeType.NAVIGATES_TO, "component:submit", "screen:detail"),
                edge("direct", EdgeType.NAVIGATES_TO, "screen:detail", "screen:next"),
                edge("dangling", EdgeType.CALLS, "screen:orders", "endpoint:missing"),
                edge("wrong-type", EdgeType.CALLS, "component:submit", "endpoint:load"));
        ApiContract contract = new ApiContract("endpoint:submit", new Request("application/json", "OrderRequest", List.of(
                new Field("orderId", "Long", "body", true, new SourceLocation("src/main/java/example/OrderRequest.java", 3), Confidence.CONFIRMED))),
                List.of(new Response("201", "application/json", "OrderResponse", List.of(), controller, Confidence.CONFIRMED)), controller, Confidence.CONFIRMED);
        ApiContract load = new ApiContract("endpoint:load", new Request(null, null, List.of()), List.of(), null, Confidence.INFERRED);
        ApplicationGraph graph = new ApplicationGraph(new Application("sample", "/private/local/sample", List.of("Spring MVC", "JSP")), nodes, edges, List.of(), List.of(contract, load), "2.1");
        PreviewModel preview = new PreviewModel("1", List.of(new PreviewScreen("screen:orders", "static-preview/orders.html", "screenshots/orders.png", 1440, 900)), List.of(
                new PreviewComponent("static-2", null, "screen:orders", "LINK", "查看", null, null, null, Map.of()),
                new PreviewComponent("static-1", "component:submit", "screen:orders", "BUTTON", "送出", "/orders/submit", "screen:detail", new Bounds(120, 350, 100, 36), Map.of("color", "red", "display", "block")),
                new PreviewComponent("static-3", null, "screen:orders", "INPUT", "姓名", null, null, null, null)));
        EditOverlay overlay = new EditOverlay("1", List.of(review("screen:orders", null, "REMOVED"), review("screen:orders", null, "CONFIRMED"),
                review("screen:detail", null, "REMOVED"), review("screen:orders", "static-1", "CONFIRMED"), review("screen:orders", "static-2", "REMOVED"),
                review("screen:orders", "static-3", "UNKNOWN")));
        return new Fixture(graph, preview, overlay);
    }
    private record Fixture(ApplicationGraph graph, PreviewModel preview, EditOverlay overlay) { }
}
