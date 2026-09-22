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
        <spring:url value="/owners" var="formUrl"/>
        <form:form action="${fn:escapeXml(formUrl)}" method="get"><button type="submit">Find Owner</button></form:form>
        <form:form action="/orders/search" method="post"><button formaction="/orders/export">Export</button></form:form>
        <form:form modelAttribute="order"><button type="submit">Save</button></form:form>
        <html:link page="/orders/history">History</html:link>
        <a href="<spring:url value="/orders/export" htmlEscape="true" />">Inline export</a>
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
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("/orders/search") && item.type() == JspAnalysis.InteractionType.NAVIGATION));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("/owners") && item.type() == JspAnalysis.InteractionType.FORM_SUBMIT));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("/owners")
        && item.type() == JspAnalysis.InteractionType.FORM_SUBMIT && item.label().equals("Find Owner")
        && item.httpMethod().equals("GET")));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("/orders/export")));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("/orders/history")));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("/orders/export")
        && item.type() == JspAnalysis.InteractionType.NAVIGATION));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.submitsCurrentView()
        && item.target().equals(JspProjectParser.CURRENT_VIEW_TARGET) && item.httpMethod().equals("POST")));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.target().equals("${dynamicUrl}") && item.confidence() == Confidence.UNRESOLVED));
    assertEquals("orders.search", analysis.tilesDefinitions().get(0).name());
    assertEquals("/WEB-INF/layout.jsp", analysis.tilesDefinitions().get(0).template());
  }

  @Test void preprocessesJstlUrlsCommentsAndProjectsIncludedNavigationOntoTheScreen() throws Exception {
    Path root = Files.createTempDirectory("jsp-parser-preprocessing");
    Path home = root.resolve("src/main/webapp/WEB-INF/views/home.jsp");
    Path header = root.resolve("src/main/webapp/WEB-INF/views/templates/header.jsp");
    Files.createDirectories(header.getParent());
    Files.writeString(home, "<%@include file=\"/WEB-INF/views/templates/header.jsp\"%><img src=\"<c:url value=\"/resources/images/back.jpg\"/>\" alt=\"Slide\"><a href=\"#myCarousel\" data-slide=\"next\">Next</a><a href=\"#\">View details »</a><a href=\"#contact\">Contact</a><%-- <a href=\"/signup\">Sign up</a> --%>");
    Files.writeString(header, "<a href=\"<c:url value=\"/productList\"/>\">Products</a>");

    JspAnalysis analysis = new JspProjectParser().analyze(root, List.of(home, header));

    assertEquals("<img src=\"/resources/images/back.jpg\" alt=\"Slide\">", JspProjectParser.preprocess("<img src=\"<c:url value=\"/resources/images/back.jpg\"/>\" alt=\"Slide\">"));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.viewPath().endsWith("home.jsp")
        && item.label().equals("Products") && item.target().equals("/productList")
        && item.type() == JspAnalysis.InteractionType.NAVIGATION && item.source().file().endsWith("header.jsp")));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.label().equals("Next") && item.type() == JspAnalysis.InteractionType.UI_STATE_CHANGE));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.label().equals("View details »") && item.type() == JspAnalysis.InteractionType.PLACEHOLDER));
    assertTrue(analysis.interactions().stream().anyMatch(item -> item.label().equals("Contact") && item.type() == JspAnalysis.InteractionType.ANCHOR));
    assertTrue(analysis.interactions().stream().noneMatch(item -> item.label().equals("Sign up")));
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
