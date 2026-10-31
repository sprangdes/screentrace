package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Mapping paths that are not plain literals must resolve through constants or stay unresolved, never become "/". */
class SpringMappingPathsTest {
  private interface Analyzer { ApplicationGraph analyze(ProjectScanner.ProjectInventory inventory) throws Exception; }
  private static final List<Analyzer> ANALYZERS = List.of(i -> new SpringBootAnalyzer().analyze(i), i -> new SpringMvcAnalyzer().analyze(i));

  private static List<ApplicationGraph> analyze(String java) throws Exception {
    Path root = Files.createTempDirectory("st-mapping-paths");
    Files.createDirectories(root.resolve("src/main/java"));
    Files.writeString(root.resolve("pom.xml"), "<project><dependency>spring-boot-starter-web</dependency></project>");
    Files.writeString(root.resolve("src/main/java/Api.java"), "import org.springframework.web.bind.annotation.*;\n" + java);
    var inventory = new ProjectScanner().scan(root);
    var graphs = new java.util.ArrayList<ApplicationGraph>();
    for (Analyzer analyzer : ANALYZERS) graphs.add(analyzer.analyze(inventory));
    return graphs;
  }

  private static List<String> endpoints(ApplicationGraph graph) {
    return graph.nodes().stream().filter(n -> n.type() == ApplicationGraph.NodeType.ENDPOINT).map(ApplicationGraph.GraphNode::name).sorted().toList();
  }

  private static List<ApplicationGraph.Diagnostic> unresolved(ApplicationGraph graph) {
    return graph.diagnostics().stream().filter(d -> SpringMappingPaths.CODE.equals(d.code())).toList();
  }

  @Test void constantPathResolvesInsteadOfBecomingRoot() throws Exception {
    for (var graph : analyze("@RestController class Api { static final String PATH = \"/actual\"; @GetMapping(PATH) String get() { return null; } }")) {
      assertEquals(List.of("GET /actual"), endpoints(graph));
      assertTrue(unresolved(graph).isEmpty(), graph.diagnostics().toString());
    }
  }

  @Test void qualifiedConstantsAndConcatenationResolve() throws Exception {
    for (var graph : analyze("@RestController @RequestMapping(Api.BASE) class Api { static final String BASE = \"/api\"; static final String ITEMS = \"/items\";\n"
        + "  @GetMapping(ITEMS + \"/{id}\") String one() { return null; } @PostMapping({ITEMS, \"/legacy\"}) String save() { return null; } }")) {
      assertEquals(List.of("GET /api/items/{id}", "POST /api/items", "POST /api/legacy"), endpoints(graph));
      assertTrue(unresolved(graph).isEmpty(), graph.diagnostics().toString());
    }
  }

  @Test void omittedPathStillMapsTheClassBase() throws Exception {
    for (var graph : analyze("@RestController @RequestMapping(\"/api\") class Api { @GetMapping String list() { return null; } }")) {
      assertEquals(List.of("GET /api"), endpoints(graph));
      assertTrue(unresolved(graph).isEmpty(), graph.diagnostics().toString());
    }
  }

  @Test void unresolvableMethodPathIsReportedAndNotMappedToRoot() throws Exception {
    for (var graph : analyze("@RestController class Api { @GetMapping(Paths.EXTERNAL) String get() { return null; } @GetMapping(\"/kept\") String kept() { return null; } }")) {
      assertEquals(List.of("GET /kept"), endpoints(graph));
      var diagnostics = unresolved(graph);
      assertEquals(1, diagnostics.size(), graph.diagnostics().toString());
      assertEquals(ApplicationGraph.Confidence.UNRESOLVED, diagnostics.get(0).confidence());
      assertTrue(diagnostics.get(0).evidence().stream().anyMatch(e -> "原始運算式=Paths.EXTERNAL".equals(e.detail())), diagnostics.toString());
    }
  }

  @Test void unresolvableClassPathDropsItsEndpointsInsteadOfGuessingTheBase() throws Exception {
    for (var graph : analyze("@RestController @RequestMapping(Paths.BASE) class Api { @GetMapping(\"/y\") String get() { return null; } }")) {
      assertEquals(List.of(), endpoints(graph));
      assertEquals(1, unresolved(graph).size(), graph.diagnostics().toString());
    }
  }
}
