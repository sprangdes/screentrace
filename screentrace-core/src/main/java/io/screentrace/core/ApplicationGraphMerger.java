package io.screentrace.core;

import java.util.*;

/** Combines independent framework contributions without changing their stable graph identifiers. */
public final class ApplicationGraphMerger {
  private ApplicationGraphMerger() { }

  public static ApplicationGraph merge(ApplicationGraph first, ApplicationGraph second) {
    // Explicit historical import: never relabel two legacy inputs as a new analysis.
    boolean historical = "2.1".equals(first.schemaVersion()) && "2.1".equals(second.schemaVersion());
    if (historical) {
      GraphIntegrityValidator.validate(first);
      GraphIntegrityValidator.validate(second);
    } else {
      GraphIntegrityValidator.requireAnalysis(first);
      GraphIntegrityValidator.requireAnalysis(second);
    }
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
    if (historical) diagnostics.put("HISTORICAL_SCHEMA", new ApplicationGraph.Diagnostic(
        "schema 2.1：歷史資料,未經 2.2 證據驗證", ApplicationGraph.Confidence.UNRESOLVED,
        new ApplicationGraph.SourceLocation(".",1), "HISTORICAL_SCHEMA", List.of()));
    Map<String, ApplicationGraph.ApiContract> apiContracts = new TreeMap<>();
    first.apiContracts().forEach(contract -> apiContracts.put(contract.endpointId(), contract));
    second.apiContracts().forEach(contract -> apiContracts.putIfAbsent(contract.endpointId(), contract));
    Set<String> technologies = new TreeSet<>(first.application().technologies());
    technologies.addAll(second.application().technologies());
    ApplicationGraph merged = new ApplicationGraph(new ApplicationGraph.Application(first.application().name(), first.application().path(), List.copyOf(technologies)),
        List.copyOf(nodes.values()), List.copyOf(relationships.values()), List.copyOf(diagnostics.values()),
        List.copyOf(apiContracts.values()),
        historical ? "2.1" : ApplicationGraph.BEHAVIOR_SCHEMA_VERSION,
        mergeBehaviors(first.behaviors(), second.behaviors()),
        mergeItems(first.validationRules(), second.validationRules(), ApplicationGraph.ValidationRule::id));
    return historical ? merged : GraphIntegrityValidator.requireAnalysis(merged);
  }

  private static List<ApplicationGraph.Behavior> mergeBehaviors(List<ApplicationGraph.Behavior> first, List<ApplicationGraph.Behavior> second) {
    Map<String, ApplicationGraph.Behavior> items = new TreeMap<>();
    first.forEach(value -> items.put(value.id(),value));
    for (var right : second) items.merge(right.id(), right, (left, next) -> {
      if (!Objects.equals(left.triggerId(),next.triggerId()) || !Objects.equals(left.event(),next.event())
          || left.type()!=next.type() || !Objects.equals(left.guard(),next.guard())
          || !Objects.equals(left.parentId(),next.parentId()) || !Objects.equals(left.expression(),next.expression()))
        throw new IllegalArgumentException("Conflicting behavior identity: " + left.id());
      List<ApplicationGraph.AnalysisEvidence> proof = new ArrayList<>(left.evidence());
      proof.addAll(next.evidence());
      String target = Objects.equals(left.targetId(),next.targetId()) ? left.targetId() : null;
      if (target == null && left.targetId()!=null && next.targetId()!=null) {
        for (String candidate : new TreeSet<>(List.of(left.targetId(),next.targetId())))
          proof.add(new ApplicationGraph.AnalysisEvidence(left.evidence().get(0).source(),"ApplicationGraphMerger",
              ApplicationGraph.ResolutionStatus.AMBIGUOUS,"候選行為結果："+candidate));
      }
      return new ApplicationGraph.Behavior(left.id(),left.triggerId(),left.event(),left.type(),target,
          left.guard(),left.parentId(),left.expression(),proof.stream().distinct().sorted().toList());
    });
    return List.copyOf(items.values());
  }

  private static <T> List<T> mergeItems(List<T> first, List<T> second, java.util.function.Function<T, String> id) {
    Map<String, T> result = new TreeMap<>();
    for (T value : first) result.put(id.apply(value), value);
    for (T value : second) {
      T existing = result.putIfAbsent(id.apply(value), value);
      if (existing != null && !existing.equals(value)) throw new IllegalArgumentException("Conflicting contribution: " + id.apply(value));
    }
    return List.copyOf(result.values());
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
