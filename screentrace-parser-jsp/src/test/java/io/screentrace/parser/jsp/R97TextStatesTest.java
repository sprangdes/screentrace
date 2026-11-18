package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R97 (ADR 0172): states kept as text or numbers, and writes past the listed call depth. */
class R97TextStatesTest {
  @TempDir Path project;

  private void write(String path, String source) throws Exception {
    var file = project.resolve(path);
    Files.createDirectories(file.getParent());
    Files.writeString(file, source);
  }

  @SuppressWarnings("unchecked")
  private ApplicationGraph enrich(String type, String method) throws Exception {
    var source = new SourceLocation("src/main/java/demo/" + type + ".java", 1);
    var handler =
        new GraphNode(
            "h",
            NodeType.HANDLER,
            "h",
            Map.of("class", "demo." + type, "method", method),
            source,
            Confidence.CONFIRMED,
            List.of(new AnalysisEvidence(source, "Fixture", ResolutionStatus.CONFIRMED, null)));
    return BackendCallChains.enrich(
        new ApplicationGraph(
            new Application("demo", ".", List.of()),
            List.of(handler),
            List.of(),
            List.of(),
            List.of(),
            "2.2",
            List.of(),
            List.of()),
        new ProjectScanner().scan(project));
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> rows(ApplicationGraph graph, String attribute)
      throws Exception {
    String raw = graph.nodes().get(0).attributes().get(attribute);
    return raw == null ? List.of() : new ObjectMapper().readValue(raw, List.class);
  }

  @Test
  void textAndNumberStatesWithTheirPriorValues() throws Exception {
    write(
        "src/main/java/demo/Api.java",
        """
        package demo;
        class Api {
          static final String PAID = "PAID";
          void pay(Order order) {
            if (!"NEW".equals(order.getStatus())) throw new IllegalStateException();
            order.setStatus(PAID);
            order.setName("x");
            order.setLevel(2);
          }
          void ship(Order order) { order.setOrderState(Codes.SHIPPED); }
        }
        class Codes { static final int SHIPPED = 3; }
        """);
    var pay = rows(enrich("Api", "pay"), "stateChanges");
    assertEquals(1, pay.size(), pay.toString());
    assertEquals("Order.status", pay.get(0).get("enum"));
    assertEquals("PAID", pay.get(0).get("value"));
    assertEquals("TEXT", pay.get(0).get("kind"));
    assertEquals(List.of("NEW"), pay.get(0).get("from"));
    var ship = rows(enrich("Api", "ship"), "stateChanges");
    assertEquals("Order.orderState", ship.get(0).get("enum"));
    assertEquals("3", ship.get(0).get("value"));
  }

  @Test
  void writesPastTheListedDepthAreStillFound() throws Exception {
    StringBuilder chain = new StringBuilder("package demo;\nenum Status { DONE }\n");
    // Api → S1 → S2 → … → S6, the write is in S6: six calls deep.
    chain.append("class Api { private final S1 s; void go(Order o) { s.go(o); } }\n");
    for (int i = 1; i <= 5; i++)
      chain.append(
          "class S" + i + " { private final S" + (i + 1) + " s; void go(Order o) { s.go(o); } }\n");
    chain.append("class S6 { void go(Order o) { o.setStatus(Status.DONE); } }\n");
    write("src/main/java/demo/Api.java", chain.toString());
    var graph = enrich("Api", "go");
    var changes = rows(graph, "stateChanges");
    assertEquals(1, changes.size());
    assertEquals("S6#go", changes.get(0).get("in"));
    assertEquals(6, changes.get(0).get("depth"));
    // The call list still stops at the listed depth.
    assertTrue(
        rows(graph, "backendCalls").stream()
            .allMatch(c -> (Integer) c.get("depth") <= BackendCallChains.MAX_DEPTH));
  }
}
