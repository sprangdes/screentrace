package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R71: duplicated Struts target normalization (RV-803). */
class StrutsRound71Test {
  private static final String WEB_XML =
      "<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>";

  @TempDir Path root;

  void file(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  @Test
  void aLinkActionKeepsTheVariableTheJspParserResolved() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", WEB_XML);
    file(
        "src/main/webapp/WEB-INF/struts-config.xml",
        "<struts-config><action-mappings><action path=\"/save\" type=\"s.Save\"><forward name=\"ok\" path=\"/result.jsp\"/></action><action path=\"/list\" type=\"s.List\" forward=\"/list.jsp\"/></action-mappings></struts-config>");
    file(
        "src/main/webapp/list.jsp",
        "<c:url var=\"op\" value=\"/save\"/><html:link action=\"${op}\">Save</html:link>");
    file("src/main/webapp/result.jsp", "<p>Result</p>");
    ApplicationGraph graph = new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    GraphNode link =
        graph.nodes().stream()
            .filter(
                n ->
                    n.type() == NodeType.COMPONENT && "html:link".equals(n.attributes().get("tag")))
            .findFirst()
            .orElseThrow(() -> new AssertionError(graph.nodes().toString()));
    assertEquals("/save", link.attributes().get("target"), link.attributes().toString());
  }

  @Test
  void aDispatchLinkBuildsTheSameEndpointAsTheOtherDispatchPaths() throws Exception {
    // RV-802
    file("src/main/webapp/WEB-INF/web.xml", WEB_XML);
    file(
        "src/main/java/s/Save.java",
        "package s; public class Save extends org.apache.struts.actions.DispatchAction { public org.apache.struts.action.ActionForward save(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} }");
    file(
        "src/main/webapp/WEB-INF/struts-config.xml",
        "<struts-config><action-mappings><action path=\"/save\" type=\"s.Save\" parameter=\"op\"><forward name=\"ok\" path=\"/result.jsp\"/></action><action path=\"/list\" type=\"s.List\" forward=\"/list.jsp\"/></action-mappings></struts-config>");
    file("src/main/webapp/list.jsp", "<a href=\"save.do?op=save\">Save</a>");
    file("src/main/webapp/result.jsp", "<p>Result</p>");
    ApplicationGraph graph = new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    GraphNode endpoint =
        graph.nodes().stream()
            .filter(
                n ->
                    n.type() == NodeType.ENDPOINT
                        && "save".equals(n.attributes().get("parameterValue")))
            .findFirst()
            .orElseThrow(() -> new AssertionError(graph.nodes().toString()));
    assertEquals("ACTION", endpoint.attributes().get("category"), endpoint.toString());
    assertEquals("PROVEN", endpoint.attributes().get("servletMappingStatus"), endpoint.toString());
  }
}
