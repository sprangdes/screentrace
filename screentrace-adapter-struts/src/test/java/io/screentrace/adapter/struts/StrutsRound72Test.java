package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R72: include context of a shared fragment (RV-409). */
class StrutsRound72Test {
  private static final String WEB_XML =
      "<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>";

  @TempDir Path root;

  void file(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  @Test
  void oneScreensGuardDoesNotMakeASharedFragmentConditionalEverywhere() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", WEB_XML);
    file(
        "src/main/webapp/WEB-INF/struts-config.xml",
        "<struts-config><action-mappings><action path=\"/a\" type=\"s.A\" forward=\"/a.jsp\"/><action path=\"/b\" type=\"s.B\" forward=\"/b.jsp\"/></action-mappings></struts-config>");
    file(
        "src/main/webapp/a.jsp",
        "<c:if test=\"${admin}\"><jsp:include page=\"/part.jsp\"/></c:if>");
    file("src/main/webapp/b.jsp", "<jsp:include page=\"/part.jsp\"/>");
    file("src/main/webapp/part.jsp", "<button type=\"button\" onclick=\"go()\">Go</button>");
    ApplicationGraph graph = new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    GraphNode button =
        graph.nodes().stream()
            .filter(n -> n.type() == NodeType.COMPONENT && "Go".equals(n.name()))
            .findFirst()
            .orElseThrow(() -> new AssertionError(graph.nodes().toString()));
    assertEquals("false", button.attributes().get("conditional"), button.toString());
    assertTrue(
        graph.relationships().stream()
            .filter(e -> e.type() == EdgeType.CONTAINS && e.to().equals(button.id()))
            .flatMap(e -> e.evidence().stream())
            .anyMatch(e -> String.valueOf(e.detail()).contains("guard=${admin}")),
        graph.relationships().toString());
  }
}
