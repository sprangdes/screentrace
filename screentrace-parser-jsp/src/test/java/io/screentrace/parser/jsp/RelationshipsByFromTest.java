package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import java.util.List;
import org.junit.jupiter.api.Test;

/** HC-004 / ADR 0139: lookups by source node match a filtered scan of every relationship. */
class RelationshipsByFromTest {
  private static Relationship edge(String id, EdgeType type, String from, String to) {
    return new Relationship(
        id, type, from, to, Confidence.INFERRED, new SourceLocation("page.jsp", 1));
  }

  @Test
  void perNodeListsKeepIdOrderAndFollowReplacedRelationships() {
    var edges = new RelationshipsByFrom();
    edges.put("m", edge("m", EdgeType.TRIGGERS, "a", "x"));
    edges.put("c", edge("c", EdgeType.TRIGGERS, "a", "y"));
    edges.put("k", edge("k", EdgeType.CONTAINS, "b", "a"));
    edges.put("e", edge("e", EdgeType.NAVIGATES_TO, "a", "z"));
    for (String from : List.of("a", "b", "missing"))
      assertEquals(
          edges.values().stream().filter(r -> r.from().equals(from)).toList(),
          List.copyOf(edges.from(from)),
          from);
    assertEquals(List.of("c", "e", "m"), edges.from("a").stream().map(Relationship::id).toList());
    // Replacing a relationship under the same ID moves it to its new source node.
    edges.put("c", edge("c", EdgeType.TRIGGERS, "b", "y"));
    assertEquals(List.of("e", "m"), edges.from("a").stream().map(Relationship::id).toList());
    assertEquals(List.of("c", "k"), edges.from("b").stream().map(Relationship::id).toList());
    edges.put("k", edge("k", EdgeType.CONTAINS, "c", "a"));
    edges.put("c", edge("c", EdgeType.TRIGGERS, "c", "y"));
    assertTrue(edges.from("b").isEmpty());
    assertTrue(edges.from(null).isEmpty());
    assertEquals(List.of("c", "e", "k", "m"), List.copyOf(edges.keySet()));
  }
}
