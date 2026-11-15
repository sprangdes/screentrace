package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph.*;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** RV-702: the view index returns what a scan of every node returns. */
class NodesByViewNameTest {
  private static GraphNode node(String id, NodeType type, String view) {
    return new GraphNode(
        id,
        type,
        id,
        view == null ? Map.of() : Map.of("view", view),
        new SourceLocation("x", 1),
        Confidence.CONFIRMED,
        List.of());
  }

  private static List<String> scan(NodesByViewName nodes, String path) {
    return nodes.values().stream()
        .filter(
            n ->
                n.type() == NodeType.SCREEN
                    && n.attributes().getOrDefault("view", "").endsWith(path))
        .map(GraphNode::id)
        .toList();
  }

  @Test
  void lookupsMatchAFullScanThroughPutMergeAndReplacement() {
    var nodes = new NodesByViewName();
    nodes.put("s1", node("s1", NodeType.SCREEN, "src/main/webapp/a/list.jsp"));
    nodes.put("s2", node("s2", NodeType.SCREEN, "WebContent/b/list.jsp"));
    nodes.put("s3", node("s3", NodeType.SCREEN, "src/main/webapp/mylist.jsp"));
    nodes.put("v1", node("v1", NodeType.VIEW, "src/main/webapp/a/list.jsp"));
    nodes.merge("s4", node("s4", NodeType.SCREEN, "x/list.jsp"), (a, b) -> b);
    for (String path :
        List.of("/list.jsp", "/a/list.jsp", "/b/list.jsp", "/mylist.jsp", "/none.jsp", "/"))
      assertEquals(scan(nodes, path), nodes.screensWithViewEndingIn(path), path);
    // Replacing a node with another view moves it; removing it drops it.
    nodes.put("s1", node("s1", NodeType.SCREEN, "src/main/webapp/a/other.jsp"));
    nodes.remove("s2");
    for (String path : List.of("/list.jsp", "/other.jsp", "/a/other.jsp"))
      assertEquals(scan(nodes, path), nodes.screensWithViewEndingIn(path), path);
  }
}
