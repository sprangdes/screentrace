package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Path;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;

class Wp17RelativeRouteTest {
  @Test void resolvesRelativeUrlAgainstTheUniqueRouteRenderingItsJsp() throws Exception {
    Path root=Path.of("../fixtures/r3/wp17").toAbsolutePath().normalize();
    ApplicationGraph graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    var link=graph.nodes().stream().filter(n->n.type()==ApplicationGraph.NodeType.COMPONENT&&n.name().equals("Edit Owner")).findFirst().orElseThrow();
    assertEquals("/owners/{ownerId}/edit",link.attributes().get("target"),graph.nodes()+"\n"+graph.diagnostics());
    assertEquals("INFERRED",link.attributes().get("targetStatus"));
    assertTrue(graph.relationships().stream().anyMatch(e->e.from().equals(link.id())&&e.type()==ApplicationGraph.EdgeType.NAVIGATES_TO
        &&graph.nodes().stream().anyMatch(n->n.id().equals(e.to())&&n.attributes().getOrDefault("view","").endsWith("owners/edit.jsp"))));
    assertTrue(link.evidence().stream().anyMatch(e->e.parser().equals("SpringMvcRelativeJspUrl")&&e.source().file().endsWith("OwnerController.java")));
  }

  @Test void leavesRelativeUrlAmbiguousWhenMoreThanOneControllerRouteRendersTheSourceView() throws Exception {
    Path root=Files.createTempDirectory("wp17-relative-ambiguous");
    Path java=root.resolve("src/main/java/sample/OwnerController.java");
    Path detail=root.resolve("src/main/webapp/WEB-INF/jsp/owners/detail.jsp");
    Files.createDirectories(java.getParent());Files.createDirectories(detail.getParent());
    Files.writeString(java,"import org.springframework.stereotype.Controller; import org.springframework.web.bind.annotation.*; @Controller class OwnerController { @GetMapping(\"/owners/{id}\") String a(){return \"owners/detail\";} @GetMapping(\"/legacy/{id}\") String b(){return \"owners/detail\";} }");
    Files.writeString(detail,"<a href=\"edit\">Edit</a>");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    var link=graph.nodes().stream().filter(n->n.type()==ApplicationGraph.NodeType.COMPONENT&&n.name().equals("Edit")).findFirst().orElseThrow();
    assertEquals("edit",link.attributes().get("target"));
    assertEquals("AMBIGUOUS",link.attributes().get("targetStatus"));
    assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("JSP_ROUTE_AMBIGUOUS")));
  }

  @Test void leavesRelativeUrlUnresolvedWhenNoControllerRouteCanProveItsBase() throws Exception {
    Path root=Files.createTempDirectory("wp17-relative-unresolved");Path jsp=root.resolve("src/main/webapp/WEB-INF/jsp/page.jsp");
    Files.createDirectories(jsp.getParent());Files.writeString(jsp,"<a href=\"edit\">Edit</a>");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    var link=graph.nodes().stream().filter(n->n.type()==ApplicationGraph.NodeType.COMPONENT&&n.name().equals("Edit")).findFirst().orElseThrow();
    assertEquals("edit",link.attributes().get("target"));
    assertEquals("UNRESOLVED",link.attributes().get("targetStatus"));
    assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("JSP_ROUTE_UNRESOLVED")));
  }

  @Test void projectsTagFileComponentsOntoEveryScreenThatUsesTheSharedLayout() throws Exception {
    Path root=Path.of("../fixtures/r3/wp17").toAbsolutePath().normalize();
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    var screens=graph.nodes().stream().filter(n->n.type()==ApplicationGraph.NodeType.SCREEN
        &&(n.attributes().getOrDefault("view","").endsWith("tag-screen.jsp")||n.attributes().getOrDefault("view","").endsWith("tag-screen-2.jsp"))).toList();
    assertEquals(2,screens.size());
    for(var screen:screens)assertTrue(graph.relationships().stream().anyMatch(e->e.type()==ApplicationGraph.EdgeType.CONTAINS&&e.from().equals(screen.id())
        &&graph.nodes().stream().anyMatch(n->n.id().equals(e.to())&&n.type()==ApplicationGraph.NodeType.COMPONENT&&"LINK".equals(n.attributes().get("kind")))));
  }
}
