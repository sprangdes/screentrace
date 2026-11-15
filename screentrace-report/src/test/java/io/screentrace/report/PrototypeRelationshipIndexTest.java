package io.screentrace.report;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.Application;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** HC-004 / ADR 0139: the index keeps the first relationship a scan in graph order would find. */
class PrototypeRelationshipIndexTest {
  private static final SourceLocation SOURCE = new SourceLocation("page.jsp", 1);

  @Test
  void indexFindsTheSameFirstRelationshipAsAScanInGraphOrder() {
    List<Relationship> relationships = new ArrayList<>();
    String[] froms = {"a", "b", "c"};
    EdgeType[] types = {EdgeType.NAVIGATES_TO, EdgeType.TRIGGERS, EdgeType.CONTAINS};
    for (int i = 0; i < 30; i++)
      relationships.add(
          new Relationship(
              "edge-" + (char) ('z' - i % 26) + i,
              types[i % types.length],
              froms[i * 7 % froms.length],
              "to-" + i,
              Confidence.INFERRED,
              SOURCE));
    var graph =
        new ApplicationGraph(
            new Application("fixture", ".", List.of()),
            List.of(),
            relationships,
            List.of(),
            List.of(),
            "2.2",
            List.of(),
            List.of());
    var index = PrototypeModelGenerator.firstRelationshipFrom(graph);
    for (EdgeType type : EdgeType.values())
      for (String from : List.of("a", "b", "c", "missing")) {
        Relationship scanned =
            graph.relationships().stream()
                .filter(r -> r.type() == type && r.from().equals(from))
                .findFirst()
                .orElse(null);
        Relationship indexed = index.getOrDefault(type, java.util.Map.of()).get(from);
        assertEquals(scanned, indexed, type + " from " + from);
      }
    assertNull(index.getOrDefault(EdgeType.RENDERS, java.util.Map.of()).get("a"));
  }

  @Test
  void componentsArePlacedPerScreenInColumnsAndSharedOnesGetOneIdPerScreen() {
    // RV-111: the 7th component overlapped the 1st; RV-112: a shared component got duplicate IDs.
    List<ApplicationGraph.GraphNode> nodes = new ArrayList<>();
    List<Relationship> relationships = new ArrayList<>();
    for (String screen : List.of("s1", "s2"))
      nodes.add(
          new ApplicationGraph.GraphNode(
              screen,
              ApplicationGraph.NodeType.SCREEN,
              screen,
              java.util.Map.of(),
              SOURCE,
              Confidence.CONFIRMED,
              List.of()));
    for (int i = 0; i < 8; i++) {
      nodes.add(
          new ApplicationGraph.GraphNode(
              "c" + i,
              ApplicationGraph.NodeType.COMPONENT,
              "c" + i,
              java.util.Map.of(),
              SOURCE,
              Confidence.CONFIRMED,
              List.of()));
      relationships.add(
          new Relationship(
              "e" + i, EdgeType.CONTAINS, "s1", "c" + i, Confidence.CONFIRMED, SOURCE));
    }
    relationships.add(
        new Relationship("shared", EdgeType.CONTAINS, "s2", "c0", Confidence.CONFIRMED, SOURCE));
    var graph =
        new ApplicationGraph(
            new Application("fixture", ".", List.of()),
            nodes,
            relationships,
            List.of(),
            List.of(),
            "2.2",
            List.of(),
            List.of());
    var components = new PrototypeModelGenerator().generate(graph).components();
    var bounds = components.stream().map(c -> c.bounds().x() + "," + c.bounds().y()).toList();
    assertEquals(
        bounds.size(), new java.util.HashSet<>(bounds.subList(0, 8)).size() + 1, bounds.toString());
    var ids =
        components.stream().map(io.screentrace.core.PrototypeModel.PrototypeComponent::id).toList();
    assertEquals(ids.size(), new java.util.HashSet<>(ids).size(), ids.toString());
    var onS2 =
        components.stream()
            .filter(c -> c.screenId().equals("prototype:s2"))
            .findFirst()
            .orElseThrow();
    assertEquals(80, onS2.bounds().y());
  }
}
