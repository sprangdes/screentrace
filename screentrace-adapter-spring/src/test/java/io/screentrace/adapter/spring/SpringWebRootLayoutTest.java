package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Spring MVC in a WebContent layout uses the JSP's own web root for public paths (ADR 0145). */
class SpringWebRootLayoutTest {
  @TempDir Path root;

  private void write(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  @Test
  void publicJspAliasAndRedirectResolveUnderWebContent() throws Exception {
    write("WebContent/help.jsp", "<p>Help</p>");
    write(
        "src/C.java",
        "@Controller class C { @GetMapping(\"/go\") String go(){ return \"redirect:/help.jsp\"; } }");
    var graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    GraphNode help =
        graph.nodes().stream()
            .filter(
                n ->
                    n.type() == NodeType.SCREEN
                        && "WebContent/help.jsp".equals(n.attributes().get("view")))
            .findFirst()
            .orElseThrow();
    assertEquals("/help.jsp", help.attributes().get("routeAliases"));
    assertTrue(
        graph.relationships().stream()
            .anyMatch(e -> e.type() == EdgeType.FORWARDS_TO && e.to().equals(help.id())),
        graph.relationships() + " " + graph.diagnostics());
  }
}
