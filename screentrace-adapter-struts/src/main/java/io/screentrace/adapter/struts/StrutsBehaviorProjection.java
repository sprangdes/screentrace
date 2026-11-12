package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsDispatch.*;
import static io.screentrace.adapter.struts.StrutsForwards.*;
import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsProjectAnalyzer.*;
import static io.screentrace.adapter.struts.StrutsServletMappings.*;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.github.javaparser.ast.body.MethodDeclaration;
import io.screentrace.adapter.struts.StrutsModel.Mapping;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.*;
import java.util.*;

/**
 * Final projections of the enriched graph: dispatch behaviors and retained action / inline-event
 * evidence.
 */
final class StrutsBehaviorProjection {
  private StrutsBehaviorProjection() {}

  static ApplicationGraph projectDispatchBehaviors(ApplicationGraph graph, State state) {
    Map<String, GraphNode> nodes = new TreeMap<>();
    graph.nodes().forEach(n -> nodes.put(n.id(), n));
    Map<String, Relationship> edges = new TreeMap<>();
    graph.relationships().forEach(e -> edges.put(e.id(), e));
    List<Behavior> behaviors = new ArrayList<>();
    var json = new com.fasterxml.jackson.databind.ObjectMapper();
    Set<String> previousNodes = new HashSet<>(state.nodes.keySet()),
        previousEdges = new HashSet<>(state.edges.keySet());
    for (var b : graph.behaviors()) {
      if (!Set.of(BehaviorType.NAVIGATE, BehaviorType.SUBMIT_FORM).contains(b.type())) {
        behaviors.add(b);
        continue;
      }
      String raw = null;
      for (var proof : b.evidence())
        if (proof.parser().equals("AcornStaticAnalyzer"))
          try {
            var item = json.readTree(proof.detail());
            if (item.has("url") && item.get("url").isTextual()) {
              raw = item.get("url").asText();
              break;
            }
          } catch (JsonProcessingException | IllegalArgumentException notJson) {
            // Evidence detail that is not JSON names no URL.
          }
      if (raw == null && nodes.containsKey(b.triggerId()))
        raw = nodes.get(b.triggerId()).attributes().get("target");
      if (raw == null) {
        behaviors.add(b);
        continue;
      }
      GraphNode target = b.targetId() == null ? null : nodes.get(b.targetId());
      String path =
          target != null && target.type() == NodeType.ENDPOINT
              ? target.attributes().get("path")
              : raw.split("[?#]", 2)[0];
      if (path == null) {
        behaviors.add(b);
        continue;
      }
      if (!path.startsWith("/")) {
        Set<String> owners = new TreeSet<>();
        graph.relationships().stream()
            .filter(e -> e.type() == EdgeType.CONTAINS && e.to().equals(b.triggerId()))
            .forEach(e -> owners.add(e.from()));
        var bases = UrlGraphContribution.requestDirectories(graph, owners);
        if (bases.size() == 1)
          try {
            path = java.net.URI.create(bases.get(0)).resolve(path).toString();
          } catch (IllegalArgumentException invalid) {
            // A path that is not a valid URI stays unresolved.
          }
      }
      var mappings = state.routes.getOrDefault(path, List.of());
      if (mappings.size() != 1 || mappings.get(0).family().isBlank()) {
        behaviors.add(b);
        continue;
      }
      var mapping = mappings.get(0);
      String command = dispatchValue(raw, mapping.parameter());
      var type = state.types.get(mapping.type());
      var methods =
          type == null || command == null
              ? List.<MethodDeclaration>of()
              : type.declaration().getMethodsByName(command).stream()
                  .filter(StrutsDispatch::validDispatchSignature)
                  .toList();
      if (methods.size() != 1) {
        behaviors.add(b);
        continue;
      }
      var source =
          new SourceLocation(type.source().file(), methods.get(0).getBegin().orElseThrow().line);
      String
          endpoint =
              StableGraphIds.endpoint("ANY", path + "?" + mapping.parameter() + "=" + command),
          handler = ApplicationGraph.id(NodeType.HANDLER, mapping.type() + "#" + command);
      var proof = new ArrayList<>(b.evidence());
      proof.add(
          new AnalysisEvidence(
              source,
              "StrutsDispatchResolution",
              ResolutionStatus.INFERRED,
              "來源 parameter=" + mapping.parameter() + "；字面方法=" + command + "；原文=" + raw));
      nodes.put(
          handler,
          new GraphNode(
              handler,
              NodeType.HANDLER,
              mapping.type() + "." + command + "()",
              Map.of("class", mapping.type(), "method", command, "actionPath", path),
              source,
              Confidence.CONFIRMED,
              proof));
      nodes.put(
          endpoint,
          new GraphNode(
              endpoint,
              NodeType.ENDPOINT,
              "ANY " + path + "?" + mapping.parameter() + "=" + command,
              Map.of(
                  "path",
                  path,
                  "httpMethod",
                  "ANY",
                  "parameter",
                  mapping.parameter(),
                  "parameterValue",
                  command,
                  "category",
                  "ACTION",
                  "servletMappingStatus",
                  "PROVEN"),
              mapping.source(),
              Confidence.CONFIRMED,
              proof));
      String handled =
          ApplicationGraph.id(NodeType.COMPONENT, "dispatch:" + endpoint + ":" + handler);
      edges.put(
          handled,
          new Relationship(
              handled, EdgeType.HANDLED_BY, endpoint, handler, Confidence.INFERRED, source, proof));
      String invoked =
          ApplicationGraph.id(NodeType.COMPONENT, "dispatch:" + b.triggerId() + ":" + endpoint);
      edges.put(
          invoked,
          new Relationship(
              invoked,
              EdgeType.TRIGGERS,
              b.triggerId(),
              endpoint,
              Confidence.INFERRED,
              source,
              proof));
      for (var value : sourceTargets(mapping, command, state))
        forward(value.target(), handler, mapping.module(), value.source(), state);
      behaviors.add(
          new Behavior(
              b.id(),
              b.triggerId(),
              b.event(),
              b.type(),
              endpoint,
              b.guard(),
              b.parentId(),
              b.expression(),
              proof));
    }
    state.nodes.forEach(
        (id, n) -> {
          if (!previousNodes.contains(id)) nodes.putIfAbsent(id, n);
        });
    state.edges.forEach(
        (id, e) -> {
          if (!previousEdges.contains(id)) edges.putIfAbsent(id, e);
        });
    return new ApplicationGraph(
        graph.application(),
        List.copyOf(nodes.values()),
        List.copyOf(edges.values()),
        graph.diagnostics(),
        graph.apiContracts(),
        graph.schemaVersion(),
        behaviors,
        graph.validationRules());
  }

  static ApplicationGraph retainActionAndInlineEventEvidence(ApplicationGraph graph, State state) {
    Map<String, GraphNode> nodes = new TreeMap<>();
    graph.nodes().forEach(node -> nodes.put(node.id(), node));
    Map<String, Behavior> behaviors = new TreeMap<>();
    graph.behaviors().forEach(behavior -> behaviors.put(behavior.id(), behavior));
    for (Mapping mapping : state.actionMappings) {
      String publicRoute = publicPath(mapping.route(), mapping.module(), state);
      for (var entry : new ArrayList<>(behaviors.entrySet())) {
        Behavior behavior = entry.getValue();
        GraphNode target = behavior.targetId() == null ? null : nodes.get(behavior.targetId());
        if (behavior.type() != BehaviorType.SUBMIT_FORM
            || target == null
            || !publicRoute.equals(target.attributes().get("path"))) continue;
        List<AnalysisEvidence> proof = new ArrayList<>(behavior.evidence());
        proof.add(
            new AnalysisEvidence(
                mapping.source(),
                PARSER,
                ResolutionStatus.CONFIRMED,
                "Struts action mapping=" + mapping.route()));
        behaviors.put(
            entry.getKey(),
            new Behavior(
                behavior.id(),
                behavior.triggerId(),
                behavior.event(),
                behavior.type(),
                behavior.targetId(),
                behavior.guard(),
                behavior.parentId(),
                behavior.expression(),
                proof.stream().distinct().toList()));
      }
    }
    for (GraphNode component : nodes.values()) {
      String expression = component.attributes().get("event.click");
      if (component.type() != NodeType.COMPONENT
          || expression == null
          || !expression.matches("[A-Za-z_$][A-Za-z0-9_$]*\\s*\\(.*\\)")) continue;
      String id =
          StableGraphIds.behavior(component.id(), "click", BehaviorType.UNKNOWN, expression, 0);
      if (behaviors.containsKey(id)) continue;
      SourceLocation source =
          new SourceLocation(
              component.source().file(),
              Integer.parseInt(
                  component
                      .attributes()
                      .getOrDefault(
                          "eventLine.click", Integer.toString(component.source().line()))));
      behaviors.put(
          id,
          new Behavior(
              id,
              component.id(),
              "click",
              BehaviorType.UNKNOWN,
              null,
              null,
              null,
              expression,
              evidence(source, Confidence.UNRESOLVED, "保留原始事件；靜態追蹤結果不代表完整執行結果")));
    }
    return new ApplicationGraph(
        graph.application(),
        graph.nodes(),
        graph.relationships(),
        graph.diagnostics(),
        graph.apiContracts(),
        graph.schemaVersion(),
        List.copyOf(behaviors.values()),
        graph.validationRules());
  }
}
