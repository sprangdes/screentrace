package io.screentrace.core;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class ApplicationGraphMergerTest {
  @Test
  void mergesFrameworkContributionsByStableId() {
    ApplicationGraph first =
        new ApplicationGraph(
            new Application("sample", "/sample", List.of("Struts 1")),
            List.of(
                new GraphNode(
                    "screen",
                    NodeType.SCREEN,
                    "Search",
                    java.util.Map.of("route", "/search"),
                    null,
                    Confidence.CONFIRMED)),
            List.of(),
            List.of());
    ApplicationGraph second =
        new ApplicationGraph(
            new Application("sample", "/sample", List.of("Spring")),
            List.of(
                new GraphNode(
                    "screen",
                    NodeType.SCREEN,
                    "Search",
                    java.util.Map.of("route", "/search"),
                    null,
                    Confidence.CONFIRMED),
                new GraphNode(
                    "handler",
                    NodeType.HANDLER,
                    "SearchService",
                    java.util.Map.of(),
                    null,
                    Confidence.CONFIRMED)),
            List.of(),
            List.of());

    ApplicationGraph merged = ApplicationGraphMerger.merge(first, second);

    assertEquals(2, merged.nodes().size());
    assertEquals(List.of("Spring", "Struts 1"), merged.application().technologies());
  }

  @Test
  void preservesEvidenceFromBothAdaptersForTheSameNode() {
    SourceLocation struts = new SourceLocation("struts-config.xml", 12);
    SourceLocation spring = new SourceLocation("OrdersController.java", 8);
    GraphNode first =
        new GraphNode(
            "screen",
            NodeType.SCREEN,
            "Search",
            java.util.Map.of("route", "/search"),
            struts,
            Confidence.CONFIRMED,
            List.of(
                new AnalysisEvidence(
                    struts, "StrutsProjectAnalyzer", ResolutionStatus.CONFIRMED, null)));
    GraphNode second =
        new GraphNode(
            "screen",
            NodeType.SCREEN,
            "Search",
            java.util.Map.of("route", "/search"),
            spring,
            Confidence.CONFIRMED,
            List.of(
                new AnalysisEvidence(
                    spring, "SpringMvcAnalyzer", ResolutionStatus.CONFIRMED, null)));
    ApplicationGraph left =
        new ApplicationGraph(
            new Application("sample", "/sample", List.of("Struts 1")),
            List.of(first),
            List.of(),
            List.of());
    ApplicationGraph right =
        new ApplicationGraph(
            new Application("sample", "/sample", List.of("Spring MVC")),
            List.of(second),
            List.of(),
            List.of());

    ApplicationGraph merged = ApplicationGraphMerger.merge(left, right);

    assertEquals(2, merged.nodes().get(0).evidence().size());
  }

  private static ApplicationGraph graph(List<GraphNode> nodes, List<Behavior> behaviors) {
    return new ApplicationGraph(
        new Application("sample", ".", List.of()),
        nodes,
        List.of(),
        List.of(),
        List.of(),
        "2.2",
        behaviors,
        List.of());
  }

  @Test
  void mergedNodesKeepBothSidesAttributesTheStrongerConfidenceAndNoDuplicateEvidence() {
    // RV-108
    var source = new SourceLocation("a.jsp", 1);
    var proof = List.of(new AnalysisEvidence(source, "P", ResolutionStatus.CONFIRMED, null));
    var struts =
        new GraphNode(
            "s",
            NodeType.SCREEN,
            "S",
            java.util.Map.of("route", "/a.do"),
            source,
            Confidence.INFERRED,
            proof);
    var spring =
        new GraphNode(
            "s",
            NodeType.SCREEN,
            "S",
            java.util.Map.of("route", "/other", "routeAliases", "/a"),
            source,
            Confidence.CONFIRMED,
            proof);
    var merged =
        ApplicationGraphMerger.merge(
                graph(List.of(struts), List.of()), graph(List.of(spring), List.of()))
            .nodes()
            .get(0);
    assertEquals("/a.do", merged.attributes().get("route"));
    assertEquals("/a", merged.attributes().get("routeAliases"));
    assertEquals(Confidence.CONFIRMED, merged.confidence());
    assertEquals(1, merged.evidence().size());
  }

  @Test
  void aResolvedBehaviorTargetWinsOverAnUnresolvedOne() {
    // RV-107
    var source = new SourceLocation("a.jsp", 1);
    var proof = List.of(new AnalysisEvidence(source, "P", ResolutionStatus.CONFIRMED, null));
    var nodes =
        List.of(
            new GraphNode(
                "c",
                NodeType.COMPONENT,
                "c",
                java.util.Map.of("kind", "LINK"),
                source,
                Confidence.CONFIRMED,
                proof),
            new GraphNode(
                "e",
                NodeType.ENDPOINT,
                "e",
                java.util.Map.of(),
                source,
                Confidence.CONFIRMED,
                proof));
    var resolved =
        new Behavior("b", "c", "click", BehaviorType.NAVIGATE, "e", null, null, "x", proof);
    var unresolved =
        new Behavior("b", "c", "click", BehaviorType.NAVIGATE, null, null, null, "x", proof);
    assertEquals(
        "e",
        ApplicationGraphMerger.merge(
                graph(nodes, List.of(resolved)), graph(nodes, List.of(unresolved)))
            .behaviors()
            .get(0)
            .targetId());
    assertEquals(
        "e",
        ApplicationGraphMerger.merge(
                graph(nodes, List.of(unresolved)), graph(nodes, List.of(resolved)))
            .behaviors()
            .get(0)
            .targetId());
  }
}
