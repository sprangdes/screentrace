package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R82 (ADR 0160): which handler writes which enum value, with the frontend's own words. */
class R82StateChangesTest {
  @TempDir Path project;

  private void write(String path, String source) throws Exception {
    var file = project.resolve(path);
    Files.createDirectories(file.getParent());
    Files.writeString(file, source);
  }

  private static GraphNode handler(String id, String type, String method) {
    var source = new SourceLocation("src/main/java/demo/" + type + ".java", 1);
    return new GraphNode(
        id,
        NodeType.HANDLER,
        id,
        Map.of("class", "demo." + type, "method", method),
        source,
        Confidence.CONFIRMED,
        List.of(new AnalysisEvidence(source, "Fixture", ResolutionStatus.CONFIRMED, null)));
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> changes(ApplicationGraph graph, String id)
      throws Exception {
    var node = graph.nodes().stream().filter(n -> n.id().equals(id)).findFirst().orElseThrow();
    String raw = node.attributes().get("stateChanges");
    return raw == null ? List.of() : new ObjectMapper().readValue(raw, List.class);
  }

  private ApplicationGraph analyze(GraphNode... handlers) throws Exception {
    var graph =
        new ApplicationGraph(
            new Application("demo", ".", List.of()),
            List.of(handlers),
            List.of(),
            List.of(),
            List.of(),
            "2.2",
            List.of(),
            List.of());
    return BackendCallChains.enrich(graph, new ProjectScanner().scan(project));
  }

  private void project() throws Exception {
    write(
        "src/main/java/demo/Status.java",
        "package demo; public enum Status { PENDING, CONFIRMED, CANCEL_REQUESTED, CANCELLED }");
    write(
        "src/main/java/demo/Api.java",
        """
        package demo;
        import static demo.Status.*;
        @RestController class Api {
          private final Orders orders;
          void cancel(boolean approve, Order o) { orders.cancel(o, approve); }
          void create() { orders.create(); }
          void query() { orders.find(CONFIRMED); }
        }
        """);
    write(
        "src/main/java/demo/Orders.java",
        """
        package demo;
        import static demo.Status.CANCELLED;
        @Service class Orders {
          void cancel(Order o, boolean approve) {
            if (approve) o.setStatus(CANCELLED);
            else o.setStatus(Status.CANCEL_REQUESTED);
            o.flag = approve ? Status.CONFIRMED : Status.PENDING;
          }
          Order create() { return Order.builder().status(Status.PENDING).build(); }
          void move(Order o, Status next) { o.setStatus(next); }
          void find(Status s) {}
        }
        """);
  }

  @Test
  void settersBuildersAssignmentsAndConditionalsAlongTheChain() throws Exception {
    project();
    var graph =
        analyze(
            handler("cancel", "Api", "cancel"),
            handler("create", "Api", "create"),
            handler("query", "Api", "query"));
    var cancel = changes(graph, "cancel");
    assertEquals(4, cancel.size(), cancel.toString());
    var first = cancel.get(0);
    assertEquals("Status", first.get("enum"));
    assertEquals("status", first.get("field"));
    assertEquals("CANCELLED", first.get("value"));
    assertEquals("Orders#cancel", first.get("in"));
    assertEquals(1, first.get("depth"));
    assertEquals("CONFIRMED", first.get("resolution"));
    assertEquals(
        List.of("PENDING", "CONFIRMED", "CANCEL_REQUESTED", "CANCELLED"), first.get("values"));
    assertEquals(Map.of("file", "src/main/java/demo/Orders.java", "line", 5), first.get("source"));
    assertEquals("CANCEL_REQUESTED", cancel.get(1).get("value"));
    // A conditional between two constants: both, INFERRED, with the condition.
    assertEquals("flag", cancel.get(2).get("field"));
    assertEquals("INFERRED", cancel.get(2).get("resolution"));
    assertEquals(
        Set.of("CONFIRMED", "PENDING"),
        Set.of(cancel.get(2).get("value"), cancel.get(3).get("value")));
    var create = changes(graph, "create");
    assertEquals(1, create.size());
    assertEquals("PENDING", create.get(0).get("value"));
    // Passing a constant to a query is not a write.
    assertTrue(changes(graph, "query").isEmpty());
    GraphIntegrityValidator.validate(graph);
  }

  @Test
  void aValueFromAVariableIsUnresolved() throws Exception {
    project();
    write(
        "src/main/java/demo/Mover.java",
        "package demo; @RestController class Mover { private final Orders orders;"
            + " void move(Order o, Status next) { orders.move(o, next); } }");
    var move = changes(analyze(handler("move", "Mover", "move")), "move");
    assertEquals(1, move.size());
    assertNull(move.get(0).get("value"));
    assertEquals("UNRESOLVED", move.get(0).get("resolution"));
    assertEquals("值由變數 next 決定", move.get(0).get("reason"));
  }

  @Test
  void frontendWordsAreUsedOnlyWhereEveryGroupAgrees() throws Exception {
    project();
    write(
        "frontend/src/status.ts",
        "export const S = { PENDING: { label: '待確認' }, CONFIRMED: { label: '已確認' },"
            + " CANCELLED: { label: '已取消' }, UNKNOWN: { label: '未知' } };\n");
    write(
        "frontend/src/Filter.tsx",
        "export const F = () => <select><option value=\"PENDING\">等待店家確認</option>"
            + "<option value=\"CONFIRMED\">已確認</option></select>;\n");
    write("frontend/package.json", "{\"dependencies\":{\"react\":\"18.3.1\"}}");
    var cancel = changes(analyze(handler("cancel", "Api", "cancel")), "cancel");
    var cancelled = cancel.get(0);
    assertEquals("已取消", cancelled.get("label"));
    assertEquals(Map.of("file", "frontend/src/status.ts", "line", 1), cancelled.get("labelSource"));
    @SuppressWarnings("unchecked")
    var words = (Map<String, String>) cancelled.get("labels");
    // PENDING disagrees between the two groups, CANCEL_REQUESTED has no word: both stay names.
    assertEquals(Map.of("CONFIRMED", "已確認", "CANCELLED", "已取消"), words);
    assertNull(cancel.get(1).get("label"));
  }

  @Test
  void aGroupThatFitsTwoEnumsNamesNeither() {
    var groups =
        new ObjectMapper()
            .valueToTree(
                List.of(
                    Map.of(
                        "source", Map.of("file", "a.ts", "line", 3),
                        "entries", Map.of("NEW", "新", "DONE", "完成"))));
    var enums =
        Map.of(
            "A", new BackendCallChains.EnumType("A", "x.A", List.of("NEW", "DONE")),
            "B", new BackendCallChains.EnumType("B", "x.B", List.of("NEW", "DONE", "LATE")));
    assertNull(
        StateLabels.fromGroups((com.fasterxml.jackson.databind.JsonNode) groups, enums)
            .label("A", "NEW"));
  }
}
