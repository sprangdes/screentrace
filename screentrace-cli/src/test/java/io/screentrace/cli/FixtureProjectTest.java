package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertTrue;

import io.screentrace.adapter.spring.SpringProjectAnalyzer;
import io.screentrace.adapter.struts.StrutsProjectAnalyzer;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class FixtureProjectTest {
  private final ProjectScanner scanner = new ProjectScanner();

  @Test void analyzesStrutsFixture() throws Exception {
    ApplicationGraph graph = new StrutsProjectAnalyzer().analyze(scanner.scan(fixture("struts")));

    assertTrue(graph.application().technologies().contains("Struts 1"));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("ANY /orders/search.do")));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.FORWARDS_TO));
  }

  @Test void analyzesStrutsSpringFixture() throws Exception {
    ApplicationGraph graph = new StrutsProjectAnalyzer().analyze(scanner.scan(fixture("struts-spring")));

    assertTrue(graph.application().technologies().contains("Spring"));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("fixture.AccountFindAction.execute()")));
  }

  @Test void analyzesSpringMvcJspFixture() throws Exception {
    ApplicationGraph graph = new SpringProjectAnalyzer().analyze(scanner.scan(fixture("spring-mvc-jsp")));

    assertTrue(graph.application().technologies().contains("Spring MVC"));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("POST /orders/search")));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.TRIGGERS));
  }

  @Test void analyzesSpringBootJspFixture() throws Exception {
    ApplicationGraph graph = new SpringProjectAnalyzer().analyze(scanner.scan(fixture("spring-boot-jsp")));

    assertTrue(graph.application().technologies().contains("Spring Boot"));
    assertTrue(graph.application().technologies().contains("JSP"));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("GET /")));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("home")));
  }

  private static Path fixture(String name) {
    Path directory = Path.of("").toAbsolutePath();
    while (directory != null) {
      Path candidate = directory.resolve("fixtures").resolve(name);
      if (Files.isDirectory(candidate)) return candidate;
      directory = directory.getParent();
    }
    throw new IllegalStateException("Fixture not found: " + name);
  }
}
