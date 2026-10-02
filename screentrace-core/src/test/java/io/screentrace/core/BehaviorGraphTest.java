package io.screentrace.core;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;

class BehaviorGraphTest {
  private final SourceLocation source = new SourceLocation("views/home.jsp", 2);
  private final List<AnalysisEvidence> evidence = List.of(new AnalysisEvidence(source, "FixtureParser", ResolutionStatus.CONFIRMED, null));
  private GraphNode node(String id, NodeType type, Map<String,String> attributes) {
    return new GraphNode(id, type, id, attributes, source, Confidence.CONFIRMED, evidence);
  }
  private ApplicationGraph graph(List<GraphNode> nodes, List<Behavior> behaviors, List<ValidationRule> rules) {
    return new ApplicationGraph(new Application("sample", ".", List.of()), nodes, List.of(), List.of(), List.of(),
        ApplicationGraph.BEHAVIOR_SCHEMA_VERSION, behaviors, rules);
  }
  @Test void serializesAndRetainsBehaviorAndValidationEvidence() throws Exception {
    var rule = new ValidationRule("required", "required", List.of("name"), "必填", ValidationLayer.MARKUP, Map.of(), evidence);
    var behavior = new Behavior("submit", "button", "click", BehaviorType.VALIDATE, "required", "${allowed}", null, "validate()", evidence);
    var graph = graph(List.of(node("button", NodeType.COMPONENT, Map.of("kind", "BUTTON"))), List.of(behavior), List.of(rule));
    GraphIntegrityValidator.validate(graph);
    assertEquals(graph, new ObjectMapper().readValue(new ObjectMapper().writeValueAsString(graph), ApplicationGraph.class));
  }
  @Test void rejectsMissingKindAndEvidenceInBehaviorSchema() {
    assertThrows(IllegalStateException.class, () -> GraphIntegrityValidator.validate(graph(List.of(node("x", NodeType.COMPONENT, Map.of())), List.of(), List.of())));
    var missing = new GraphNode("x", NodeType.SCREEN, "x", Map.of(), null, Confidence.CONFIRMED);
    assertThrows(IllegalStateException.class, () -> GraphIntegrityValidator.validate(graph(List.of(missing), List.of(), List.of())));
  }
  @Test void rejectsUnknownParentTargetAndBehaviorCycles() {
    var button = node("button", NodeType.COMPONENT, Map.of("kind", "BUTTON"));
    var bad = new Behavior("b", "button", "click", BehaviorType.NAVIGATE, "missing", null, "missing", null, evidence);
    assertThrows(IllegalStateException.class, () -> GraphIntegrityValidator.validate(graph(List.of(button), List.of(bad), List.of())));
    var a = new Behavior("a", "button", "click", BehaviorType.UNKNOWN, null, null, "b", null, evidence);
    var b = new Behavior("b", "button", "click", BehaviorType.UNKNOWN, null, null, "a", null, evidence);
    assertThrows(IllegalStateException.class, () -> GraphIntegrityValidator.validate(graph(List.of(button), List.of(a,b), List.of())));
  }
  @Test void rejectsMissingBehaviorAndRuleEvidenceAndInvalidTargets() {
    var button = node("button", NodeType.COMPONENT, Map.of("kind", "BUTTON"));
    var bad = new Behavior("b", "button", "click", BehaviorType.CALL_API, "button", null, null, null, List.of());
    assertThrows(IllegalStateException.class, () -> GraphIntegrityValidator.validate(graph(List.of(button), List.of(bad), List.of())));
    var rule = new ValidationRule("r", "required", List.of("field"), null, ValidationLayer.SERVER, Map.of(), List.of());
    assertThrows(IllegalStateException.class, () -> GraphIntegrityValidator.validate(graph(List.of(button), List.of(), List.of(rule))));
  }
  @Test void idsIgnoreFileOrderAndUnrelatedChangesAndReconciliationIsSorted() {
    String a = StableGraphIds.component("a.jsp", ComponentKind.BUTTON, Map.of("id", "save"), 0);
    String b = StableGraphIds.component("b.jsp", ComponentKind.LINK, Map.of("href", "/home"), 0);
    assertEquals(a, StableGraphIds.component("a.jsp", ComponentKind.BUTTON, new TreeMap<>(Map.of("id", "save")), 0));
    assertNotEquals(a, StableGraphIds.component("a.jsp", ComponentKind.BUTTON, Map.of("id", "save"), 1));
    var result = StableGraphIds.reconcile(List.of(b, "orphan", a), List.of("new", a, b));
    assertEquals(List.of("orphan"), result.orphaned());
    assertEquals(List.of("new"), result.added());
    assertEquals(List.of(a,b).stream().sorted().toList(), result.matched());
    assertEquals(result, StableGraphIds.reconcile(List.of(a,b,"orphan"), List.of(b,"new",a)));
  }
  @Test void mergePreservesNewContributions() {
    var graph = graph(List.of(node("button", NodeType.COMPONENT, Map.of("kind","BUTTON"))),
        List.of(new Behavior("b", "button", "change", BehaviorType.UNKNOWN, null, null, null, null, evidence)), List.of());
    assertEquals(graph.behaviors(), ApplicationGraphMerger.merge(graph, graph).behaviors());
  }
  @Test void strictEdgesRequireEvidence() {
    var graph = new ApplicationGraph(new Application("sample", ".", List.of()),
        List.of(node("screen",NodeType.SCREEN,Map.of()), node("button",NodeType.COMPONENT,Map.of("kind","BUTTON"))),
        List.of(new Relationship("edge",EdgeType.CONTAINS,"screen","button",Confidence.CONFIRMED,null)), List.of(),List.of(),
        ApplicationGraph.BEHAVIOR_SCHEMA_VERSION,List.of(),List.of());
    assertThrows(IllegalStateException.class, () -> GraphIntegrityValidator.validate(graph));
  }
}
