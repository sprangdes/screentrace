package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.MarkupTag;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * XML and JSP structure is read with parsers, so comments and '>' in attribute values count right.
 */
class MarkupParsingBoundaryTest {
  private static final String WEB_XML_ACTION =
      "<servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping>";

  @TempDir Path root;

  private void file(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  private ApplicationGraph analyze() throws Exception {
    return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  @Test
  void jsfThatIsOnlyCommentedOutIsNotReported() throws Exception {
    file(
        "src/main/webapp/WEB-INF/web.xml",
        "<web-app><!-- <servlet><servlet-class>javax.faces.webapp.FacesServlet</servlet-class></servlet> -->"
            + WEB_XML_ACTION
            + "</web-app>");
    file(
        "src/main/webapp/WEB-INF/struts-config.xml",
        "<struts-config><action-mappings><action path='/home' type='sample.HomeAction' forward='/home.jsp'/></action-mappings></struts-config>");
    file(
        "src/main/webapp/home.jsp",
        "<%-- <%@ taglib prefix='h' uri='http://java.sun.com/jsf/html' %> --%>\n<h:form><button>Save</button></h:form>");
    ApplicationGraph graph = analyze();
    assertTrue(
        graph.diagnostics().stream()
            .noneMatch(item -> item.code().equals("UNSUPPORTED_COMPONENT_FRAMEWORK")),
        graph.diagnostics().toString());
    assertTrue(
        graph.nodes().stream()
            .noneMatch(node -> node.attributes().containsKey("unsupportedComponentFramework")));
  }

  @Test
  void jsfDeclaredWithXmlnsAfterAnAttributeHoldingGreaterThanIsReported() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", "<web-app>" + WEB_XML_ACTION + "</web-app>");
    file(
        "src/main/webapp/WEB-INF/struts-config.xml",
        "<struts-config><action-mappings><action path='/home' type='sample.HomeAction' forward='/home.jsp'/></action-mappings></struts-config>");
    file(
        "src/main/webapp/home.jsp",
        "<html data-note=\"a > b\" xmlns:h=\"http://java.sun.com/jsf/html\">\n<body>\n<h:form/>\n</body></html>");
    Diagnostic diagnostic =
        analyze().diagnostics().stream()
            .filter(item -> item.code().equals("UNSUPPORTED_COMPONENT_FRAMEWORK"))
            .findFirst()
            .orElseThrow();
    assertEquals("src/main/webapp/home.jsp", diagnostic.source().file());
    assertEquals(3, diagnostic.source().line());
    assertTrue(diagnostic.evidence().get(0).detail().endsWith("JSF 標籤=<h:form"));
  }

  @Test
  void selectOptionsIgnoreCommentsAndReadAnyAttributeQuoting() {
    String source =
        "<select name='method'><option value='save'>Save</option>"
            + "<!-- <option value='old'>Old</option> -->"
            + "<option data-note=\"1 > 0\" value='delete'>Delete</option>"
            + "<option value=print>Print</option></select>";
    MarkupTag select = MarkupTag.scan(source).get(0);
    assertEquals("delete\u001fprint\u001fsave", StrutsControls.selectOptionValues(source, select));
  }

  @Test
  void bodyHeadingWithGreaterThanInAnAttributeNamesTheTilesPage() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", "<web-app>" + WEB_XML_ACTION + "</web-app>");
    file(
        "src/main/webapp/WEB-INF/struts-config.xml",
        "<struts-config><action-mappings><action path='/orders' type='sample.Orders'><forward name='ok' path='.ordersPage'/></action></action-mappings></struts-config>");
    file(
        "tiles-defs.xml",
        "<tiles-definitions><definition name='.layout' path='/layout.jsp'/><definition name='.ordersPage' extends='.layout'><put name='body' value='/orders-body.jsp'/></definition></tiles-definitions>");
    file(
        "src/main/webapp/layout.jsp", "<html><body><tiles:insert attribute='body'/></body></html>");
    file(
        "src/main/webapp/orders-body.jsp",
        "<!-- <title>Old Title</title> -->\n<h1 data-note=\"a > b\">Orders</h1>");
    String id = ApplicationGraph.id(NodeType.SCREEN, "tiles:.ordersPage");
    GraphNode screen =
        analyze().nodes().stream().filter(node -> node.id().equals(id)).findFirst().orElseThrow();
    assertEquals("Orders", screen.name());
    assertEquals("body JSP", screen.attributes().get("screenNameSource"));
  }
}
