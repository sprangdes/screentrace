package io.screentrace.core;

import java.util.*;

/** Combines independent framework contributions without changing their stable graph identifiers. */
public final class ApplicationGraphMerger {
  private ApplicationGraphMerger() { }

  public static ApplicationGraph merge(ApplicationGraph first, ApplicationGraph second) {
    if (!Objects.equals(first.application().path(), second.application().path())) {
      throw new IllegalArgumentException("Cannot merge analysis graphs from different projects");
    }
    Map<String, ApplicationGraph.GraphNode> nodes = new TreeMap<>();
    first.nodes().forEach(node -> nodes.put(node.id(), node));
    second.nodes().forEach(node -> nodes.merge(node.id(), node, ApplicationGraphMerger::mergeNode));
    Map<String, ApplicationGraph.Relationship> relationships = new TreeMap<>();
    first.relationships().forEach(edge -> relationships.put(edge.id(), edge));
    second.relationships().forEach(edge -> relationships.merge(edge.id(), edge, ApplicationGraphMerger::mergeRelationship));
    Map<String, ApplicationGraph.Diagnostic> diagnostics = new TreeMap<>();
    first.diagnostics().forEach(item -> diagnostics.put(item.message() + item.source(), item));
    second.diagnostics().forEach(item -> diagnostics.putIfAbsent(item.message() + item.source(), item));
    Set<String> technologies = new TreeSet<>(first.application().technologies());
    technologies.addAll(second.application().technologies());
    return new ApplicationGraph(new ApplicationGraph.Application(first.application().name(), first.application().path(), List.copyOf(technologies)),
        List.copyOf(nodes.values()), List.copyOf(relationships.values()), List.copyOf(diagnostics.values()));
  }

  private static ApplicationGraph.GraphNode mergeNode(ApplicationGraph.GraphNode left, ApplicationGraph.GraphNode right) {
    List<ApplicationGraph.AnalysisEvidence> evidence = new ArrayList<>(left.evidence());
    evidence.addAll(right.evidence());
    return new ApplicationGraph.GraphNode(left.id(), left.type(), left.name(), left.attributes(), left.source(), left.confidence(), evidence);
  }

  private static ApplicationGraph.Relationship mergeRelationship(ApplicationGraph.Relationship left, ApplicationGraph.Relationship right) {
    List<ApplicationGraph.AnalysisEvidence> evidence = new ArrayList<>(left.evidence());
    evidence.addAll(right.evidence());
    return new ApplicationGraph.Relationship(left.id(), left.type(), left.from(), left.to(), left.confidence(), left.source(), evidence);
  }
}
