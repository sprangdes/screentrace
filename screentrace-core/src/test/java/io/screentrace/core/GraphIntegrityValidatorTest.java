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

  @Test void acceptsInferredNavigationDerivedFromAResolvedEndpoint() {
    GraphNode screen = new GraphNode("screen", NodeType.SCREEN, "owners", Map.of("route", "/owners"), null, Confidence.CONFIRMED);
    GraphNode detail = new GraphNode("detail", NodeType.SCREEN, "ownerDetails", Map.of("view", "owners/detail.jsp"), null, Confidence.CONFIRMED);
    GraphNode link = new GraphNode("link", NodeType.COMPONENT, "Owner", Map.of("target", "/owners/{ownerId}"), null, Confidence.CONFIRMED);
    var graph = new ApplicationGraph(new Application("sample", "/sample", List.of()), List.of(screen, detail, link),
        List.of(new Relationship("contains", EdgeType.CONTAINS, "screen", "link", Confidence.CONFIRMED, null),
            new Relationship("navigation", EdgeType.NAVIGATES_TO, "link", "detail", Confidence.INFERRED, null)), List.of());

    assertDoesNotThrow(() -> GraphIntegrityValidator.validate(graph));
  }

  @Test void acceptsCrossFrameworkGraphRelationships() {
    GraphNode screen = new GraphNode("screen", NodeType.SCREEN, "Search", Map.of("route", "/search"), null, Confidence.CONFIRMED);
    GraphNode form = new GraphNode("form", NodeType.COMPONENT, "searchForm", Map.of(), null, Confidence.CONFIRMED);
    GraphNode formModel = new GraphNode("formModel", NodeType.FORM_MODEL, "SearchForm", Map.of(), null, Confidence.CONFIRMED);
    GraphNode endpoint = new GraphNode("endpoint", NodeType.ENDPOINT, "POST /search", Map.of(), null, Confidence.CONFIRMED);
    GraphNode action = new GraphNode("handler", NodeType.HANDLER, "SearchAction.execute", Map.of(), null, Confidence.CONFIRMED);
    GraphNode integration = new GraphNode("integration", NodeType.INTEGRATION, "Customer SOAP", Map.of(), null, Confidence.CONFIRMED);
    GraphNode view = new GraphNode("view", NodeType.VIEW, "search-result", Map.of(), null, Confidence.CONFIRMED);
    var graph = new ApplicationGraph(new Application("sample", "/sample", List.of("Struts", "Spring")),
        List.of(screen, form, formModel, endpoint, action, integration, view),
        List.of(new Relationship("contains", EdgeType.CONTAINS, "screen", "form", Confidence.CONFIRMED, null),
            new Relationship("binds", EdgeType.BINDS_TO, "form", "formModel", Confidence.CONFIRMED, null),
            new Relationship("triggers", EdgeType.TRIGGERS, "form", "endpoint", Confidence.CONFIRMED, null),
            new Relationship("handled", EdgeType.HANDLED_BY, "endpoint", "handler", Confidence.CONFIRMED, null),
            new Relationship("calls", EdgeType.CALLS, "handler", "integration", Confidence.CONFIRMED, null),
            new Relationship("forward", EdgeType.FORWARDS_TO, "handler", "view", Confidence.CONFIRMED, null)), List.of());

    assertDoesNotThrow(() -> GraphIntegrityValidator.validate(graph));
  }

  @Test void rejectsInvalidTypedRelationship() {
    GraphNode screen = new GraphNode("screen", NodeType.SCREEN, "Search", Map.of("route", "/search"), null, Confidence.CONFIRMED);
    GraphNode integration = new GraphNode("integration", NodeType.INTEGRATION, "Customer SOAP", Map.of(), null, Confidence.CONFIRMED);
    var graph = new ApplicationGraph(new Application("sample", "/sample", List.of()), List.of(screen, integration),
        List.of(new Relationship("bad", EdgeType.HANDLED_BY, "screen", "integration", Confidence.CONFIRMED, null)), List.of());

    assertThrows(IllegalStateException.class, () -> GraphIntegrityValidator.validate(graph));
  }
}
