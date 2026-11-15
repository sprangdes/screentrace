package io.screentrace.adapter.struts;

import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.BiFunction;

/**
 * Graph nodes by ID, like a {@link TreeMap}, that also remembers which SCREEN nodes had a view with
 * a given file name. A lookup of the screens whose view ends with "/…/name" then checks a few
 * candidates instead of every node (RV-702). Candidates are re-checked against the live map, so an
 * entry left behind by a replaced or removed node is never returned.
 */
final class NodesByViewName extends TreeMap<String, GraphNode> {
  private final Map<String, Set<String>> screensByFileName = new HashMap<>();

  @Override
  public GraphNode put(String id, GraphNode node) {
    index(node);
    return super.put(id, node);
  }

  @Override
  public void putAll(Map<? extends String, ? extends GraphNode> nodes) {
    nodes.forEach(this::put);
  }

  @Override
  public GraphNode merge(
      String id,
      GraphNode node,
      BiFunction<? super GraphNode, ? super GraphNode, ? extends GraphNode> remapping) {
    GraphNode result = super.merge(id, node, remapping);
    index(result);
    return result;
  }

  private void index(GraphNode node) {
    if (node == null || node.type() != NodeType.SCREEN) return;
    String view = node.attributes().get("view");
    if (view != null && !view.isEmpty())
      screensByFileName.computeIfAbsent(fileName(view), k -> new TreeSet<>()).add(node.id());
  }

  private static String fileName(String path) {
    return path.substring(path.lastIndexOf('/') + 1);
  }

  /**
   * IDs of the SCREEN nodes whose view ends with {@code path}, in ID order. {@code path} must start
   * with '/', so a matching view's file name equals the path's last segment.
   */
  List<String> screensWithViewEndingIn(String path) {
    return screensByFileName.getOrDefault(fileName(path), Set.of()).stream()
        .filter(
            id -> {
              GraphNode node = get(id);
              return node != null
                  && node.type() == NodeType.SCREEN
                  && node.attributes().getOrDefault("view", "").endsWith(path);
            })
        .toList();
  }
}
