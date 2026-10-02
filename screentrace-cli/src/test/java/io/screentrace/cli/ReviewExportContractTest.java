package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.report.ReportGenerator;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReviewExportContractTest {
    @TempDir Path analysis;
    private final ObjectMapper json = new ObjectMapper();

    @Test void cliAndAuthenticatedBrowserExportHaveIdenticalV2Contracts() throws Exception {
        ApplicationGraph graph = new ApplicationGraph(new Application("sample", "/private/source", List.of("JSP")), List.of(
                new GraphNode("screen:orders", NodeType.SCREEN, "Orders", Map.of("route", "/orders"), null, Confidence.CONFIRMED),
                new GraphNode("endpoint:load", NodeType.ENDPOINT, "GET /api/orders", Map.of(), null, Confidence.CONFIRMED)),
                List.of(new Relationship("call", EdgeType.CALLS, "screen:orders", "endpoint:load", Confidence.CONFIRMED, null)), List.of());
        new ReportGenerator().write(graph, analysis);
        String overlay = """
                {"version":"1","operations":[{"screenId":"screen:orders","componentId":null,
                 "operation":"UPDATE","changes":{"reviewStatus":"CONFIRMED"}}]}
                """;
        Files.writeString(analysis.resolve("edit-overlay.json"), overlay);
        Method cliExport = ScreenTraceCli.class.getDeclaredMethod("export", ProjectCatalog.Project.class);
        cliExport.setAccessible(true);
        Path cliPath = (Path) cliExport.invoke(null, new ProjectCatalog.Project("sample", analysis.resolve("source"), analysis));
        JsonNode cli = json.readTree(cliPath.toFile());

        Method browserExport = ScreenTraceCli.class.getDeclaredMethod("handleReviewResult", HttpExchange.class, Path.class, Path.class, String.class);
        browserExport.setAccessible(true);
        HttpServer server = HttpServer.create(new InetSocketAddress(ScreenTraceCli.REPORT_ADDRESS, 0), 0);
        server.createContext("/review-result.json", exchange -> {
            try { browserExport.invoke(null, exchange, analysis, analysis.resolve("edit-overlay.json"), "test-token"); }
            catch (IllegalAccessException | InvocationTargetException failure) { throw new IOException(failure); }
        });
        server.start();
        try {
            URI uri = URI.create("http://localhost:" + server.getAddress().getPort() + "/review-result.json");
            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json").header("X-ScreenTrace-Token", "test-token")
                    .POST(HttpRequest.BodyPublishers.ofString(overlay)).build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode());
            assertEquals("attachment; filename=review-result.json", response.headers().firstValue("Content-Disposition").orElseThrow());
            JsonNode browser = json.readTree(response.body());
            assertEquals("2", browser.path("version").asText());
            assertEquals("KEEP", browser.path("screens").get(0).path("decision").asText());
            assertEquals("endpoint:load", browser.path("screens").get(0).path("pageApis").get(0).asText());
            ((ObjectNode) cli).remove("generatedAt");
            ((ObjectNode) browser).remove("generatedAt");
            assertEquals(cli, browser);

            HttpRequest unauthorized = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5))
                    .POST(HttpRequest.BodyPublishers.ofString(overlay)).build();
            assertEquals(403, client.send(unauthorized, HttpResponse.BodyHandlers.discarding()).statusCode());
            HttpRequest wrongMethod = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5)).GET().build();
            assertEquals(405, client.send(wrongMethod, HttpResponse.BodyHandlers.discarding()).statusCode());
        } finally { server.stop(0); }
    }
}
