package io.screentrace.report;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.GraphIntegrityValidator;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FlowStateGraphAugmenterTest {
  @TempDir java.nio.file.Path output;

  @Test void addsCapturedStatesAndInferredTransitions() throws Exception {
    GraphNode booking = new GraphNode("screen:booking", NodeType.SCREEN, "預約", Map.of("route", "/reservation/new"), null, Confidence.CONFIRMED);
    ApplicationGraph graph = new ApplicationGraph(new ApplicationGraph.Application("sample", "/sample", List.of("React")), List.of(booking), List.of(), List.of());
    Files.writeString(output.resolve("flow-states.json"), """
        {"version":"1","states":[
          {"id":"screen:booking--flow-step-2","name":"預約 — 選擇日期","route":"/reservation/new#step-2","label":"步驟 2","sourceScreenId":"screen:booking","from":"screen:booking","transitionLabel":"下一步：選擇日期與時間"},
          {"id":"screen:booking--flow-step-3","name":"預約 — 確認","route":"/reservation/new#step-3","label":"步驟 3","sourceScreenId":"screen:booking","from":"screen:booking--flow-step-2","transitionLabel":"下一步：確認預約"}
        ]}
        """);

    ApplicationGraph augmented = new FlowStateGraphAugmenter().augment(graph, output);

    assertEquals(5, augmented.nodes().size());
    assertEquals(4, augmented.relationships().size());
    assertTrue(augmented.nodes().stream().anyMatch(node -> node.id().equals("screen:booking--flow-step-3") && node.confidence() == Confidence.INFERRED));
    assertTrue(augmented.relationships().stream().allMatch(edge -> edge.confidence() == Confidence.INFERRED));
    GraphIntegrityValidator.validate(augmented);
  }
}
