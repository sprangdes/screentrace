package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.assertTrue;

import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.util.HashMap;
import org.junit.jupiter.api.Test;

/** CR-005: a GET form's POST submitter must reach the POST handler and the screen that handler renders. */
class SubmitterMethodRoutingTest {
  @Test void postSubmitterInsideGetFormReachesThePostHandler() throws Exception {
    var root = Files.createTempDirectory("submitter-method");
    var page = root.resolve("src/main/webapp/WEB-INF/jsp/page.jsp");
    Files.createDirectories(page.getParent());
    Files.writeString(page, "<form method=\"get\" action=\"/page\"><button type=\"submit\" formaction=\"/save\" formmethod=\"post\">Save</button></form>");
    Files.writeString(root.resolve("src/main/webapp/WEB-INF/jsp/done.jsp"), "<p>done</p>");
    Files.writeString(root.resolve("C.java"), "@Controller class C { @GetMapping(\"/page\") String page(){return \"page\";} @PostMapping(\"/save\") String save(){return \"done\";} }");
    var graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    var names = new HashMap<String, String>();
    graph.nodes().forEach(node -> names.put(node.id(), node.type() + ":" + node.name()));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == EdgeType.TRIGGERS
        && "COMPONENT:Save".equals(names.get(edge.from())) && "ENDPOINT:POST /save".equals(names.get(edge.to()))), graph.relationships().toString());
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == EdgeType.NAVIGATES_TO
        && "COMPONENT:Save".equals(names.get(edge.from())) && (NodeType.SCREEN + ":done").equals(names.get(edge.to()))), graph.relationships().toString());
  }
}
