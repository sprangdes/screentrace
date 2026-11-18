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

  @Test
  void r101APrivateStepDispatchedByAStateSwitchTakesTheCaseItRunsIn() throws Exception {
    // R101 (ADR 0176): the step methods of a conversation are called from a switch on its state.
    write(
        "src/main/java/demo/Step.java",
        "package demo; public enum Step { IDLE, CHOOSING, DATING, DONE }");
    write(
        "src/main/java/demo/Api.java",
        """
        package demo;
        class Api {
          Object handle(Chat chat, String text) {
            return switch (chat.getStep()) {
              case CHOOSING -> choose(chat, text);
              case DATING -> date(chat);
              case IDLE, DONE -> start(chat);
            };
          }
          private Object choose(Chat c, String text) { c.setStep(Step.DATING); return null; }
          private Object date(Chat c) { c.setStep(Step.DONE); return null; }
          private Object start(Chat c) { c.setStep(Step.CHOOSING); return null; }
          Object shortcut(Chat chat) { return date(chat); }
        }
        """);
    var handle = changes("handle");
    Map<Object, Object> from = new HashMap<>();
    for (var row : handle) from.put(row.get("value"), row.get("from"));
    assertEquals(List.of("CHOOSING"), from.get("DATING"));
    assertEquals(List.of("IDLE", "DONE"), from.get("CHOOSING"));
    // date() is also called outside the switch: its prior state is not known.
    assertNull(from.get("DONE"));
  }
}
