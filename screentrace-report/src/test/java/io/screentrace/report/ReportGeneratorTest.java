package io.screentrace.report;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReportGeneratorTest {
  private final ObjectMapper json = new ObjectMapper();
  @TempDir Path output;

  @Test void consolidatesCapturedAssetsIntoPreviewContractAndReportReadsOnlyContracts() throws Exception {
    GraphNode screen = new GraphNode("screen:orders", NodeType.SCREEN, "Orders", Map.of("route", "/orders"), null, Confidence.CONFIRMED);
    GraphNode component = new GraphNode("component:next", NodeType.COMPONENT, "Next", Map.of("componentType", "BUTTON", "target", "/done"), null, Confidence.CONFIRMED);
    GraphNode target = new GraphNode("screen:done", NodeType.SCREEN, "Done", Map.of("route", "/done"), null, Confidence.CONFIRMED);
    ApplicationGraph graph = new ApplicationGraph(new ApplicationGraph.Application("sample", "/sample", List.of("JSP")), List.of(screen, component, target),
        List.of(new Relationship("contains", EdgeType.CONTAINS, screen.id(), component.id(), Confidence.CONFIRMED, null),
            new Relationship("navigates", EdgeType.NAVIGATES_TO, component.id(), target.id(), Confidence.CONFIRMED, null)), List.of());
    Files.createDirectories(output.resolve("static-preview"));
    Files.writeString(output.resolve("static-preview/manifest.json"), "{\"screen:orders\":\"static-preview/orders.html\"}");
    Files.createDirectories(output.resolve("screenshots"));
    Files.writeString(output.resolve("screenshots/manifest.json"), "{\"screen:orders\":\"screenshots/orders.png\"}");
    Files.writeString(output.resolve("screenshots/interactions.json"), "{\"screen:orders\":{\"width\":1440,\"height\":900,\"items\":[{\"id\":\"static-component-0\",\"type\":\"BUTTON\",\"label\":\"Next\",\"target\":\"/done\",\"targetScreenId\":\"screen:done\",\"bounds\":{\"x\":1,\"y\":2,\"width\":3,\"height\":4},\"css\":{\"color\":\"red\"}}]}}");

    new ReportGenerator().write(graph, output);

    JsonNode preview = json.readTree(output.resolve("preview-model.json").toFile());
    assertEquals("static-preview/orders.html", preview.path("screens").get(1).path("staticDocument").asText());
    assertEquals("screenshots/orders.png", preview.path("screens").get(1).path("screenshot").asText());
    assertEquals("screen:done", preview.path("components").get(0).path("targetScreenId").asText());
    String report = Files.readString(output.resolve("report/index.html"));
    assertTrue(report.contains("/preview-model.json"));
    assertFalse(report.contains("/static-preview/manifest.json"));
    assertTrue(report.contains("thumbnailFor=screen=>previewScreens[screen.id]?.screenshot"));
    assertTrue(report.contains("screenshots/static-"));
    assertTrue(report.contains("API — 頁面載入時呼叫"));
    assertTrue(report.contains("API — 由按鈕／元件觸發"));
    assertTrue(report.contains("API Detail"));
    assertTrue(report.contains("showApiDetail"));
    assertTrue(report.contains("returnToButton?'Button Detail':'Page Detail"));
    assertTrue(report.contains("graphComponentFor"));
    assertTrue(report.contains("staticComponentFor"));
    assertTrue(report.contains("selectedEndpoint"));
    assertTrue(report.contains("linkedComponentKey"));
    assertTrue(report.contains("screenFlowHistory"));
    assertTrue(report.contains("returnToPreviousFlow"));
  }
}
