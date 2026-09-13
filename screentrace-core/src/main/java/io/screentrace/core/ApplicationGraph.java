package io.screentrace.core;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.*;

/** Framework-neutral, deterministic contract between analysis and report consumers. */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApplicationGraph(Application application, List<GraphNode> nodes, List<Relationship> relationships,
                               List<Diagnostic> diagnostics) {
  public ApplicationGraph { nodes = sorted(nodes); relationships = sorted(relationships); diagnostics = sorted(diagnostics); }
  private static <T extends Comparable<T>> List<T> sorted(List<T> items) { var copy = new ArrayList<>(items == null ? List.<T>of() : items); Collections.sort(copy); return List.copyOf(copy); }
  public static String id(NodeType type, String key) { return type.name().toLowerCase(Locale.ROOT) + ":" + UUID.nameUUIDFromBytes(key.getBytes()).toString(); }
  public record Application(String name, String path, List<String> technologies) { public Application { technologies = (technologies == null ? List.<String>of() : technologies).stream().sorted().toList(); } }
  public record GraphNode(String id, NodeType type, String name, Map<String,String> attributes, SourceLocation source, Confidence confidence) implements Comparable<GraphNode> { public GraphNode { attributes = attributes == null ? Map.of() : Map.copyOf(new TreeMap<>(attributes)); } public int compareTo(GraphNode other) { return id.compareTo(other.id); } }
  public record Relationship(String id, EdgeType type, String from, String to, Confidence confidence, SourceLocation source) implements Comparable<Relationship> { public int compareTo(Relationship other) { return id.compareTo(other.id); } }
  public record SourceLocation(String file, int line) { }
  public record Diagnostic(String message, Confidence confidence, SourceLocation source) implements Comparable<Diagnostic> { public int compareTo(Diagnostic other) { return message.compareTo(other.message); } }
  public enum NodeType { SCREEN, ENDPOINT, HANDLER, COMPONENT, VIEW }
  public enum EdgeType { HANDLED_BY, RENDERS, CONTAINS, TRIGGERS, NAVIGATES_TO }
  public enum Confidence { CONFIRMED, INFERRED, UNRESOLVED }
}
