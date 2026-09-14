package io.screentrace.core;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class ApplicationGraphMergerTest {
  @Test void mergesFrameworkContributionsByStableId() {
    ApplicationGraph first = new ApplicationGraph(new Application("sample", "/sample", List.of("Struts 1")),
        List.of(new GraphNode("screen", NodeType.SCREEN, "Search", java.util.Map.of("route", "/search"), null, Confidence.CONFIRMED)), List.of(), List.of());
    ApplicationGraph second = new ApplicationGraph(new Application("sample", "/sample", List.of("Spring")),
        List.of(new GraphNode("screen", NodeType.SCREEN, "Search", java.util.Map.of("route", "/search"), null, Confidence.CONFIRMED),
            new GraphNode("handler", NodeType.HANDLER, "SearchService", java.util.Map.of(), null, Confidence.CONFIRMED)), List.of(), List.of());

    ApplicationGraph merged = ApplicationGraphMerger.merge(first, second);

    assertEquals(2, merged.nodes().size());
    assertEquals(List.of("Spring", "Struts 1"), merged.application().technologies());
  }

  @Test void preservesEvidenceFromBothAdaptersForTheSameNode() {
    SourceLocation struts = new SourceLocation("struts-config.xml", 12);
    SourceLocation spring = new SourceLocation("OrdersController.java", 8);
    GraphNode first = new GraphNode("screen", NodeType.SCREEN, "Search", java.util.Map.of("route", "/search"), struts,
        Confidence.CONFIRMED, List.of(new AnalysisEvidence(struts, "StrutsProjectAnalyzer", ResolutionStatus.CONFIRMED, null)));
    GraphNode second = new GraphNode("screen", NodeType.SCREEN, "Search", java.util.Map.of("route", "/search"), spring,
        Confidence.CONFIRMED, List.of(new AnalysisEvidence(spring, "SpringMvcAnalyzer", ResolutionStatus.CONFIRMED, null)));
    ApplicationGraph left = new ApplicationGraph(new Application("sample", "/sample", List.of("Struts 1")), List.of(first), List.of(), List.of());
    ApplicationGraph right = new ApplicationGraph(new Application("sample", "/sample", List.of("Spring MVC")), List.of(second), List.of(), List.of());

    ApplicationGraph merged = ApplicationGraphMerger.merge(left, right);

    assertEquals(2, merged.nodes().get(0).evidence().size());
  }
}
