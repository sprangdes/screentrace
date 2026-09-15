package io.screentrace.core;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ApplicationGraphTest {
  @Test void stableIdAndJsonContract() throws Exception {
    String id = ApplicationGraph.id(ApplicationGraph.NodeType.SCREEN, "a");
    assertEquals(id, ApplicationGraph.id(ApplicationGraph.NodeType.SCREEN, "a"));
    var graph = new ApplicationGraph(new ApplicationGraph.Application("sample", "/sample", List.of("Java")), List.of(new ApplicationGraph.GraphNode(id, ApplicationGraph.NodeType.SCREEN, "a", Map.of(), null, ApplicationGraph.Confidence.CONFIRMED)), List.of(), List.of());
    String serialized = new ObjectMapper().writeValueAsString(graph);
    assertTrue(serialized.contains("CONFIRMED"));
    assertTrue(serialized.contains("\"schemaVersion\":\"2.1\""));
  }

  @Test void deserializesAnEmptyGraphWhoseEmptyListsWereOmitted() {
    ObjectMapper json = new ObjectMapper();
    var graph = new ApplicationGraph(new ApplicationGraph.Application("sample", "/sample", List.of()), List.of(), List.of(), List.of());
    assertDoesNotThrow(() -> json.readValue(json.writeValueAsString(graph), ApplicationGraph.class));
  }

  @Test void upgradesSchemaOneJsonWithoutLosingLegacyTraceability() throws Exception {
    String schemaOne = """
        {"application":{"name":"sample","path":"/sample","technologies":["Spring MVC"]},
         "nodes":[{"id":"screen:login","type":"SCREEN","name":"Login",
                   "attributes":{"route":"/login"},"source":{"file":"login.jsp","line":4},
                   "confidence":"CONFIRMED"}],"relationships":[],"diagnostics":[]}
        """;

    ApplicationGraph graph = new ObjectMapper().readValue(schemaOne, ApplicationGraph.class);

    assertEquals(ApplicationGraph.CURRENT_SCHEMA_VERSION, graph.schemaVersion());
    assertEquals(1, graph.nodes().get(0).evidence().size());
    assertEquals("LEGACY", graph.nodes().get(0).evidence().get(0).parser());
    assertDoesNotThrow(() -> GraphIntegrityValidator.validate(graph));
  }

  @Test void retainsExplicitSchemaOneCompatibilityVersion() throws Exception {
    String schemaOne = """
        {"schemaVersion":"1.0","application":{"name":"sample","path":"/sample","technologies":[]},
         "nodes":[],"relationships":[],"diagnostics":[]}
        """;

    ApplicationGraph graph = new ObjectMapper().readValue(schemaOne, ApplicationGraph.class);

    assertEquals("1.0", graph.schemaVersion());
  }
}
