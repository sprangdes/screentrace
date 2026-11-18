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

/** R94 (ADR 0169): the value a status had before a write, from the conditions around it. */
class R94PriorStateTest {
  @TempDir Path project;

  private void write(String path, String source) throws Exception {
    var file = project.resolve(path);
    Files.createDirectories(file.getParent());
    Files.writeString(file, source);
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> changes(String method) throws Exception {
    var source = new SourceLocation("src/main/java/demo/Api.java", 1);
    var handler =
        new GraphNode(
            method,
            NodeType.HANDLER,
            method,
            Map.of("class", "demo.Api", "method", method),
            source,
            Confidence.CONFIRMED,
            List.of(new AnalysisEvidence(source, "Fixture", ResolutionStatus.CONFIRMED, null)));
    var graph =
        BackendCallChains.enrich(
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
    String raw = graph.nodes().get(0).attributes().get("stateChanges");
    return raw == null ? List.of() : new ObjectMapper().readValue(raw, List.class);
  }

  @Test
  void branchesGuardsSwitchesAndBuilders() throws Exception {
    write(
        "src/main/java/demo/Status.java",
        "package demo; public enum Status { PENDING, CONFIRMED, CANCEL_REQUESTED, CANCELLED, COMPLETED }");
    write(
        "src/main/java/demo/Api.java",
        """
        package demo;
        import static demo.Status.*;
        class Api {
          void cancel(Order o, String reason) {
            if (ended(o)) { throw new IllegalStateException(); }
            Status current = o.getStatus();
            if (current == COMPLETED) {
              throw new IllegalStateException();
            } else if (current == PENDING) {
              o.setStatus(CANCELLED);
            } else if (current == CONFIRMED) {
              o.setStatus(CANCEL_REQUESTED);
            }
          }
          void decide(Order o, boolean approve) {
            if (o.getStatus() != CANCEL_REQUESTED) throw new IllegalStateException();
            if (approve) o.setStatus(CANCELLED);
            else o.setStatus(CONFIRMED);
          }
          void move(Order o, Status next) {
            if (o.getStatus() == COMPLETED || o.getStatus() == CANCELLED) return;
            o.setStatus(next);
          }
          void sweep(Order o, Order other) {
            switch (o.getStatus()) {
              case PENDING, CONFIRMED -> o.setStatus(COMPLETED);
              default -> {}
            }
            if (other.getStatus() == PENDING) o.setStatus(CONFIRMED);
          }
          Order create() { return Order.builder().status(PENDING).build(); }
        }
        """);
    var cancel = changes("cancel");
    assertEquals(List.of("PENDING"), cancel.get(0).get("from"));
    assertEquals(List.of("CONFIRMED"), cancel.get(1).get("from"));
    var decide = changes("decide");
    assertEquals(List.of("CANCEL_REQUESTED"), decide.get(0).get("from"));
    assertEquals(List.of("CANCEL_REQUESTED"), decide.get(1).get("from"));
    var move = changes("move");
    assertEquals(List.of("CANCELLED", "COMPLETED"), move.get(0).get("fromNot"));
    var sweep = changes("sweep");
    assertEquals(List.of("PENDING", "CONFIRMED"), sweep.get(0).get("from"));
    // A condition on another object says nothing about this one.
    assertNull(sweep.get(1).get("from"));
    assertNull(sweep.get(1).get("fromNot"));
    assertEquals(true, changes("create").get(0).get("fromCreated"));
  }
}
