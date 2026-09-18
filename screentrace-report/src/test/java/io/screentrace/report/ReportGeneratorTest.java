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
    GraphNode component = new GraphNode("component:next", NodeType.COMPONENT, "Next", Map.of("componentType", "LINK", "target", "/orders/{ownerId}"), null, Confidence.CONFIRMED);
    GraphNode target = new GraphNode("screen:done", NodeType.SCREEN, "Done", Map.of("route", "/orders/{ownerId}"), null, Confidence.CONFIRMED);
    ApplicationGraph graph = new ApplicationGraph(new ApplicationGraph.Application("sample", "/sample", List.of("JSP")), List.of(screen, component, target),
        List.of(new Relationship("contains", EdgeType.CONTAINS, screen.id(), component.id(), Confidence.CONFIRMED, null),
            new Relationship("navigates", EdgeType.NAVIGATES_TO, component.id(), target.id(), Confidence.CONFIRMED, null)), List.of());
    Files.createDirectories(output.resolve("static-preview"));
    Files.writeString(output.resolve("static-preview/manifest.json"), "{\"screen:orders\":\"static-preview/orders.html\"}");
    Files.createDirectories(output.resolve("screenshots"));
    Files.writeString(output.resolve("screenshots/manifest.json"), "{\"screen:orders\":\"screenshots/orders.png\"}");
    Files.writeString(output.resolve("screenshots/interactions.json"), "{\"screen:orders\":{\"width\":1440,\"height\":900,\"items\":[{\"id\":\"static-component-0\",\"type\":\"LINK\",\"label\":\"Order One\",\"target\":\"/orders/1\",\"bounds\":{\"x\":1,\"y\":2,\"width\":3,\"height\":4},\"css\":{\"color\":\"red\"}}]}}");

    new ReportGenerator().write(graph, output);

    JsonNode preview = json.readTree(output.resolve("preview-model.json").toFile());
    assertEquals("static-preview/orders.html", preview.path("screens").get(1).path("staticDocument").asText());
    assertEquals("screenshots/orders.png", preview.path("screens").get(1).path("screenshot").asText());
    assertEquals("screen:done", preview.path("components").get(0).path("targetScreenId").asText());
    String report = Files.readString(output.resolve("report/index.html"));
    String theme = Files.readString(output.resolve("report/workflow-canvas.css"));
    assertTrue(report.contains("workflow-canvas.css"));
    assertTrue(theme.contains("--color-nav: #17181B"));
    assertTrue(theme.contains("--shadow-md:"));
    assertTrue(theme.contains(".detail-section { margin: 14px"));
    assertTrue(theme.contains(".detail .meta { color: #555B60"));
    assertTrue(theme.contains(".workspace-bottom-controls"));
    assertTrue(theme.contains(".content.overview .screen-grid .node:hover:not(.selected)"));
    assertTrue(theme.contains(".node.selected { outline: none !important; background: var(--color-node)"));
    assertTrue(theme.contains(".content.overview .folder-browser { grid-template-columns: minmax(220px, 260px)"));
    assertTrue(theme.contains("--bottom-control-height: 44px"));
    assertTrue(theme.contains("--bottom-control-fg: #3E4348"));
    assertTrue(theme.contains(".zoom-controls button { display: grid; width: 42px"));
    assertTrue(theme.contains(".mode-bar, .review-mode-shell { display: flex; height: var(--bottom-control-height); align-items: center; gap: 3px; padding: 4px; border: 1px solid #D6D9DC"));
    assertTrue(theme.contains("--highlight-green: #22C98A"));
    assertTrue(theme.contains(".review-mode .hotspot.review-unconfirmed"));
    assertTrue(theme.contains("--color-panel: #E9EFEA"));
    assertTrue(theme.contains("--color-node: #E9EBEE"));
    assertTrue(report.contains("class=\"workspace-bottom-controls\""));
    assertTrue(report.contains("class=\"review-mode-shell\""));
    assertTrue(report.contains("id=\"rail-screen-tree\""));
    assertTrue(report.contains("id=\"rail-screen-structure\""));
    assertFalse(report.contains("id=\"zoom-value\""));
    assertTrue(report.contains("Screen Structure — coming soon"));
    assertTrue(report.contains(":'Screen Tree'"));
    assertTrue(report.contains("nextReviewStatus"));
    assertTrue(report.contains("data-interaction-id"));
    assertTrue(report.contains("setRelationHighlight"));
    assertTrue(report.contains("card.onmouseenter=()=>{if(selected)setRelationHighlight"));
    assertTrue(report.contains("renderFlow(focusSelection)"));
    assertTrue(report.contains("renderFocusedCanvas(focusSelection)"));
    assertTrue(report.contains("reviewStatusControl"));
    assertTrue(theme.contains(".review-status-chip"));
    assertTrue(theme.contains(".map-canvas { background-color"));
    assertTrue(theme.contains("stroke-linejoin: round"));
    assertTrue(theme.contains(".content.focused #viewport { background-color: #FFFFFF"));
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
    assertTrue(report.contains("radius=Math.min(18,(y2-y1)/4,Math.abs(x2-x1)/2)"));
    assertFalse(report.contains("isSelected||linkedSelected?' selected':''"));
    assertTrue(report.contains("function detailHeader(label,component,onUpdated)"));
    assertTrue(report.contains("detailSection('Page ID')"));
    assertTrue(report.contains("detailSection('Page Name')"));
    assertTrue(report.contains("detailSection('Button Name')"));
    assertTrue(report.contains("detailHeader('API Detail',endpoint"));
    assertTrue(report.contains("detailSection('API Name')"));
    assertTrue(report.contains("()=>selectScreenFlow(target),null,false,target.id,component"));
    assertTrue(report.contains("()=>selectScreenFlow(link.target),null,false,link.target.id,link.component"));
    assertFalse(report.contains("detailSection('確認狀態')"));
  }
}
