package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;

/** CR-006: handler and endpoint IDs come from file, type and method signature, never from the line a method starts on. */
class SpringHandlerIdStabilityTest {
  private interface Analyzer { ApplicationGraph analyze(ProjectScanner.ProjectInventory inventory) throws Exception; }
  private static final List<Analyzer> ANALYZERS = List.of(i -> new SpringBootAnalyzer().analyze(i), i -> new SpringMvcAnalyzer().analyze(i));
  private static final String API = "@RestController class Api {\n  @GetMapping(\"/actual\") String get() { return null; }\n"
      + "  @GetMapping(\"/items\") String find() { return null; }\n  @GetMapping(\"/items/{id}\") String find(Long id) { return null; }\n}\n";

  private static ApplicationGraph graph(Analyzer analyzer, String java) throws Exception {
    Path root = Files.createTempDirectory("st-handler-ids");
    Files.createDirectories(root.resolve("src/main/java"));
    Files.writeString(root.resolve("pom.xml"), "<project><dependency>spring-boot-starter-web</dependency></project>");
    Files.writeString(root.resolve("src/main/java/Api.java"), "import org.springframework.web.bind.annotation.*;\n" + java);
    return analyzer.analyze(new ProjectScanner().scan(root));
  }

  /** Endpoint IDs by name, and handler IDs by the endpoint they handle (overloads share a display name). */
  private static Map<String, String> ids(Analyzer analyzer, String java) throws Exception {
    var graph = graph(analyzer, java);
    var names = new TreeMap<String, String>();
    graph.nodes().forEach(node -> names.put(node.id(), node.name()));
    Map<String, String> ids = new TreeMap<>();
    for (var edge : graph.relationships())
      if (edge.type() == ApplicationGraph.EdgeType.HANDLED_BY) { ids.put("ENDPOINT " + names.get(edge.from()), edge.from()); ids.put("HANDLER of " + names.get(edge.from()), edge.to()); }
    return ids;
  }

  @Test void blankLinesAndCommentsAboveAHandlerKeepItsIds() throws Exception {
    for (Analyzer analyzer : ANALYZERS) {
      var before = ids(analyzer, API);
      var after = ids(analyzer, "\n\n// moved down by a comment\n" + API.replace("{\n  @GetMapping(\"/actual\")", "{\n\n  /** docs */\n  @GetMapping(\"/actual\")"));
      assertEquals(before, after);
      assertTrue(before.containsKey("ENDPOINT GET /actual"), before.toString());
    }
  }

  @Test void overloadedHandlersKeepDistinctIds() throws Exception {
    for (Analyzer analyzer : ANALYZERS) {
      var handlers = graph(analyzer, API).nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.HANDLER && node.name().equals("Api.find()")).map(ApplicationGraph.GraphNode::id).distinct().toList();
      assertEquals(2, handlers.size(), handlers.toString());
      var ids = ids(analyzer, API);
      assertNotEquals(ids.get("HANDLER of GET /items"), ids.get("HANDLER of GET /items/{id}"), ids.toString());
    }
  }
}
