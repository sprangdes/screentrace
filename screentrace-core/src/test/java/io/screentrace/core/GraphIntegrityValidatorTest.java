package io.screentrace.core;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class GraphIntegrityValidatorTest {
  @Test void acceptsResolvedScreenNavigation() {
    GraphNode screen = new GraphNode("screen", NodeType.SCREEN, "home", Map.of("route", "/"), null, Confidence.CONFIRMED);
    GraphNode next = new GraphNode("next", NodeType.SCREEN, "login", Map.of("route", "/login"), null, Confidence.CONFIRMED);
    GraphNode button = new GraphNode("button", NodeType.COMPONENT, "Login", Map.of("target", "/login"), null, Confidence.CONFIRMED);
    var graph = new ApplicationGraph(new Application("sample", "/sample", List.of()), List.of(screen, next, button), List.of(new Relationship("contains", EdgeType.CONTAINS, "screen", "button", Confidence.CONFIRMED, null), new Relationship("navigation", EdgeType.NAVIGATES_TO, "button", "next", Confidence.CONFIRMED, null)), List.of());
    assertDoesNotThrow(() -> GraphIntegrityValidator.validate(graph));
  }

  @Test void rejectsMismatchedNavigationTarget() {
    GraphNode screen = new GraphNode("screen", NodeType.SCREEN, "home", Map.of("route", "/"), null, Confidence.CONFIRMED);
    GraphNode next = new GraphNode("next", NodeType.SCREEN, "login", Map.of("route", "/login"), null, Confidence.CONFIRMED);
    GraphNode button = new GraphNode("button", NodeType.COMPONENT, "Login", Map.of("target", "/register"), null, Confidence.CONFIRMED);
    var graph = new ApplicationGraph(new Application("sample", "/sample", List.of()), List.of(screen, next, button), List.of(new Relationship("contains", EdgeType.CONTAINS, "screen", "button", Confidence.CONFIRMED, null), new Relationship("navigation", EdgeType.NAVIGATES_TO, "button", "next", Confidence.CONFIRMED, null)), List.of());
    assertThrows(IllegalStateException.class, () -> GraphIntegrityValidator.validate(graph));
  }
}
