package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.screentrace.core.ApplicationGraph.Confidence;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class JspProjectParserTest {
  @Test void discoversJspJspfLiteralInteractionsIncludesAndTiles() throws Exception {
    Path root = Files.createTempDirectory("jsp-parser");
    Path screen = root.resolve("src/main/webapp/WEB-INF/jsp/orders/search.jsp");
    Path fragment = root.resolve("src/main/webapp/WEB-INF/jsp/common/filters.jspf");
    Path tiles = root.resolve("src/main/webapp/WEB-INF/layout-definitions.xml");
    Files.createDirectories(screen.getParent());
    Files.createDirectories(fragment.getParent());
    Files.writeString(screen, """
        <%@ include file="/WEB-INF/jsp/common/filters.jspf" %>
        <spring:url value="/orders/search" var="searchUrl"/>
        <a href="${searchUrl}">Search</a>
        <form:form action="/orders/search" method="post"><button formaction="/orders/export">Export</button></form:form>
        <html:link page="/orders/history">History</html:link>
        <a href="${dynamicUrl}">Dynamic</a>
        """);
    Files.writeString(fragment, "<input name=\"keyword\"/>");
    Files.writeString(tiles, """
        <!DOCTYPE tiles-definitions SYSTEM "tiles-config_3_0.dtd">
        <tiles-definitions><definition name="orders.search" template="/WEB-INF/layout.jsp">
          <put-attribute name="body" value="/WEB-INF/jsp/orders/search.jsp"/>
        </definition></tiles-definitions>
        """);

    JspAnalysis analysis = new JspProjectParser().analyze(root, List.of(screen, fragment, tiles));

    assertEquals(2, analysis.views().size());
    assertEquals(1, analysis.includes().size());
    assertEquals("/WEB-INF/jsp/common/filters.jspf", analysis.includes().get(0).targetPath());
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("/orders/search") && item.httpMethod().equals("POST")));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("/orders/search") && item.type() == JspAnalysis.InteractionType.LINK));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("/orders/export")));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("/orders/history")));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("${dynamicUrl}") && item.confidence() == Confidence.UNRESOLVED));
    assertEquals("orders.search", analysis.tilesDefinitions().get(0).name());
    assertEquals("/WEB-INF/layout.jsp", analysis.tilesDefinitions().get(0).template());
  }

  @Test void recordsMalformedTilesAsDiagnosticInsteadOfResolvingIt() throws Exception {
    Path root = Files.createTempDirectory("jsp-parser-invalid-tiles");
    Path tiles = root.resolve("tiles.xml");
    Files.writeString(tiles, "<tiles-definitions><definition>");

    JspAnalysis analysis = new JspProjectParser().analyze(root, List.of(tiles));

    assertTrue(analysis.tilesDefinitions().isEmpty());
    assertTrue(analysis.diagnostics().stream().anyMatch(item -> item.code().equals("JSP_UNRESOLVED")));
  }
}
