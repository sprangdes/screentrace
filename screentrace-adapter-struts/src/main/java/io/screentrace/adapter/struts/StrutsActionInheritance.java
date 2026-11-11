package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsDispatch.*;
import static io.screentrace.adapter.struts.StrutsForwards.*;
import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsProjectAnalyzer.*;
import static io.screentrace.adapter.struts.StrutsServletMappings.*;
import static io.screentrace.adapter.struts.StrutsWildcards.*;

import com.github.javaparser.ast.body.MethodDeclaration;
import io.screentrace.adapter.struts.StrutsModel.ActionMatch;
import io.screentrace.adapter.struts.StrutsModel.InheritanceTarget;
import io.screentrace.adapter.struts.StrutsModel.Mapping;
import io.screentrace.adapter.struts.StrutsModel.PendingForward;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.adapter.struts.StrutsModel.WildcardMatch;
import io.screentrace.adapter.struts.StrutsModel.WildcardResolution;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.util.*;

/** Propagates callers through action-to-action forwards and marks inherited action templates. */
final class StrutsActionInheritance {
  private StrutsActionInheritance() {}

  static void inheritActionCallers(State state) {
    for (Mapping base : state.actionMappings) {
      String sourceEndpoint = state.endpointIds.get(base.route());
      if (sourceEndpoint == null) continue;
      for (Mapping origin : mappingVariants(base, sourceEndpoint, state)) {
        List<InheritanceTarget> starts = inheritanceTargets(origin, state);
        for (InheritanceTarget start : starts)
          walkActionForward(
              origin,
              sourceEndpoint,
              start.target(),
              start.source(),
              List.of(origin),
              new LinkedHashSet<>(List.of(origin.route())),
              1,
              state);
        for (PendingForward exception : state.exceptionForwards)
          if (exception.module().equals(origin.module()))
            walkActionForward(
                origin,
                sourceEndpoint,
                exception.target(),
                exception.source(),
                List.of(origin),
                new LinkedHashSet<>(List.of(origin.route())),
                1,
                state);
      }
    }
  }

  static List<InheritanceTarget> inheritanceTargets(Mapping mapping, State state) {
    List<InheritanceTarget> result = new ArrayList<>();
    mapping
        .localForwards()
        .forEach(
            (name, target) ->
                result.add(
                    new InheritanceTarget(
                        target, mapping.forwardSources().getOrDefault(name, mapping.source()))));
    if (mapping.input() != null && !mapping.input().isBlank())
      result.add(new InheritanceTarget(mapping.input(), mapping.source()));
    result.addAll(
        state.actionForwardTargets.getOrDefault(mapping.handlerId(), List.of()).stream()
            .map(item -> new InheritanceTarget(item.target(), item.source()))
            .toList());
    return result.stream().distinct().toList();
  }

  static void walkActionForward(
      Mapping origin,
      String sourceEndpoint,
      String rawTarget,
      SourceLocation targetSource,
      List<Mapping> chain,
      Set<String> visited,
      int depth,
      State state) {
    if (depth > 5) {
      diagnostic(
          state, "Struts forward 繼承超過 5 跳，停止繼承", targetSource, "STRUTS_REDIRECT_DEPTH_LIMIT");
      return;
    }
    if (rawTarget == null || rawTarget.isBlank() || !StrutsSources.literal(rawTarget)) return;
    String target = normalizeStrutsAction(rawTarget, origin.module(), state);
    if (target == null) return;
    target = target.split("[?#]", 2)[0];
    List<ActionMatch> destinations = resolveActionMappings(target, origin.module(), state);
    if (destinations.size() > 1) {
      if (destinations.stream().allMatch(item -> item.wildcard() != null))
        diagnostic(
            state,
            "萬用字元 action 的首末匹配 mapping 不同，且 Struts 版本無法證明為 1.3.x；候選="
                + destinations.stream().map(item -> wildcardCandidateText(item.wildcard())).toList()
                + "；版本證據="
                + state.strutsVersion.description(),
            targetSource,
            "STRUTS_WILDCARD_VERSION_UNRESOLVED");
      diagnostic(
          state,
          "Struts forward 目的 action 有多個候選，未繼承呼叫來源："
              + rawTarget
              + "；候選="
              + destinations.stream()
                  .map(
                      item ->
                          item.mapping().route()
                              + "（"
                              + item.mapping().source().file()
                              + ":"
                              + item.mapping().source().line()
                              + "）")
                  .toList(),
          targetSource,
          "STRUTS_REDIRECT_AMBIGUOUS");
      return;
    }
    ActionMatch actionMatch = destinations.isEmpty() ? null : destinations.get(0);
    Mapping destination = actionMatch == null ? null : actionMatch.mapping();
    if (destination == null) {
      String unresolvedPath = Objects.toString(logicalPath(target, origin.module(), state), target);
      boolean potential = target.endsWith(".do") || target.contains("/do/");
      if (!potential)
        for (Mapping mapping : state.actionMappings)
          if (wildcardMatch(mapping.route(), unresolvedPath, mapping) != null) {
            potential = true;
            break;
          }
      if (potential)
        diagnostic(
            state,
            "Struts forward 目的 action 無法唯一解析，未繼承呼叫來源：" + rawTarget,
            targetSource,
            "STRUTS_REDIRECT_UNRESOLVED");
      return;
    }
    if (visited.contains(destination.route())) {
      reportForwardCycle(chain, destination, targetSource, state);
      return;
    }
    String endpoint = state.endpointIds.get(destination.route());
    if (endpoint == null) return;
    if (actionMatch.wildcard() != null) {
      recordWildcardMatch(endpoint, target, actionMatch.wildcard(), state, targetSource);
      destination = wildcardMappingForCaller(destination, actionMatch.wildcard(), endpoint, state);
    }
    List<Mapping> nextChain = new ArrayList<>(chain);
    nextChain.add(destination);
    String detail =
        "轉址鏈："
            + nextChain.stream()
                .map(
                    mapping -> {
                      String id = state.endpointIds.get(mapping.route());
                      GraphNode endpointNode = id == null ? null : state.nodes.get(id);
                      String url =
                          endpointNode == null
                              ? publicPath(mapping.route(), mapping.module(), state)
                              : endpointNode.attributes().getOrDefault("path", endpointNode.name());
                      return mapping.route()
                          + "（公開網址="
                          + url
                          + "；處理器="
                          + mapping.type()
                          + "；來源="
                          + mapping.source().file()
                          + ":"
                          + mapping.source().line()
                          + "）";
                    })
                .collect(java.util.stream.Collectors.joining(" → "))
            + "；forward="
            + rawTarget
            + "（"
            + targetSource.file()
            + ":"
            + targetSource.line()
            + "）";
    List<AnalysisEvidence> proof = new ArrayList<>();
    for (Mapping item : nextChain) {
      proof.addAll(state.nodes.get(item.handlerId()).evidence());
      String mappedEndpoint = state.endpointIds.get(item.route());
      if (mappedEndpoint != null && state.nodes.containsKey(mappedEndpoint))
        proof.addAll(state.nodes.get(mappedEndpoint).evidence());
    }
    proof.add(
        new AnalysisEvidence(
            targetSource, "RedirectInheritance", ResolutionStatus.INFERRED, detail));
    String dispatch = dispatchValue(rawTarget, destination.parameter());
    if (dispatch != null && !destination.family().isBlank()) {
      var java = state.types.get(destination.type());
      var methods =
          java == null
              ? List.<MethodDeclaration>of()
              : java.declaration().getMethodsByName(dispatch).stream()
                  .filter(StrutsDispatch::validDispatchSignature)
                  .toList();
      if (methods.size() != 1) return;
      String publicRoute = publicPath(destination.route(), destination.module(), state),
          specific =
              StableGraphIds.endpoint(
                  "ANY", publicRoute + "?" + destination.parameter() + "=" + dispatch),
          handler = ApplicationGraph.id(NodeType.HANDLER, destination.type() + "#" + dispatch);
      addNode(
          state,
          specific,
          NodeType.ENDPOINT,
          "ANY " + publicRoute + "?" + destination.parameter() + "=" + dispatch,
          Map.of(
              "path",
              publicRoute,
              "httpMethod",
              "ANY",
              "category",
              "ACTION",
              "parameter",
              destination.parameter(),
              "parameterValue",
              dispatch,
              "servletMappingStatus",
              "PROVEN"),
          targetSource,
          Confidence.CONFIRMED);
      addNode(
          state,
          handler,
          NodeType.HANDLER,
          destination.type() + "." + dispatch + "()",
          Map.of("class", destination.type(), "method", dispatch),
          new SourceLocation(java.source().file(), methods.get(0).getBegin().orElseThrow().line),
          Confidence.CONFIRMED);
      edge(state, EdgeType.HANDLED_BY, specific, handler, Confidence.INFERRED, targetSource);
      for (var value : sourceTargets(destination, dispatch, state))
        forward(value.target(), handler, destination.module(), value.source(), state);
      endpoint = specific;
    }
    String relationId =
        ApplicationGraph.id(
            NodeType.HANDLER,
            "STRUTS_REDIRECT_INHERITANCE:"
                + sourceEndpoint
                + ":"
                + origin.handlerId()
                + ":"
                + endpoint
                + ":"
                + targetSource.file()
                + ":"
                + targetSource.line());
    state.edges.putIfAbsent(
        relationId,
        new Relationship(
            relationId,
            EdgeType.CALLS,
            origin.handlerId(),
            endpoint,
            Confidence.INFERRED,
            targetSource,
            proof.stream().distinct().sorted().toList()));
    Set<String> nextVisited = new LinkedHashSet<>(visited);
    nextVisited.add(destination.route());
    for (InheritanceTarget child :
        dispatch != null && !destination.family().isBlank()
            ? sourceTargets(destination, dispatch, state).stream()
                .map(item -> new InheritanceTarget(item.target(), item.source()))
                .toList()
            : inheritanceTargets(destination, state))
      walkActionForward(
          origin,
          sourceEndpoint,
          child.target(),
          child.source(),
          nextChain,
          nextVisited,
          depth + 1,
          state);
  }

  /**
   * Each cycle is reported once, as the loop itself in a canonical rotation. Every path that walks
   * into it would otherwise add its own message: 73,970 of them on chrisekelley/zeprs.
   */
  static void reportForwardCycle(
      List<Mapping> chain, Mapping destination, SourceLocation source, State state) {
    List<String> routes = chain.stream().map(Mapping::route).toList();
    int entry = routes.indexOf(destination.route());
    List<String> loop = new ArrayList<>(routes.subList(Math.max(entry, 0), routes.size()));
    int first = loop.indexOf(loop.stream().min(Comparator.naturalOrder()).orElseThrow());
    List<String> canonical = new ArrayList<>(loop.subList(first, loop.size()));
    canonical.addAll(loop.subList(0, first));
    String cycle = String.join(" → ", canonical) + " → " + canonical.get(0);
    if (state.reportedForwardCycles.add(cycle))
      diagnostic(state, "Struts forward 繼承鏈偵測到循環：" + cycle, source, "STRUTS_REDIRECT_CYCLE");
  }

  static List<ActionMatch> resolveActionMappings(String target, String module, State state) {
    String logical = logicalPath(target, module, state);
    String candidate = logical == null ? target : logical;
    List<Mapping> exact = state.routes.get(candidate);
    if (exact != null && !exact.isEmpty())
      return exact.stream().distinct().map(mapping -> new ActionMatch(mapping, null)).toList();
    WildcardResolution wildcard = resolveWildcard(candidate, module, state);
    return wildcard == null
        ? List.of()
        : wildcard.candidates().stream()
            .map(match -> new ActionMatch(match.mapping(), match))
            .toList();
  }

  static List<Mapping> mappingVariants(Mapping mapping, String endpoint, State state) {
    Map<String, WildcardMatch> matches = state.wildcardMatches.get(mapping.route());
    if (matches == null || matches.isEmpty()) return List.of(mapping);
    return matches.values().stream()
        .map(match -> wildcardMappingForCaller(mapping, match, endpoint, state))
        .toList();
  }

  static Mapping wildcardMappingForCaller(
      Mapping mapping, WildcardMatch match, String endpoint, State state) {
    Mapping effective = substituteWildcardValues(mapping, match, state);
    GraphNode base = state.nodes.get(mapping.handlerId());
    if (base == null) return effective;
    edge(
        state,
        EdgeType.HANDLED_BY,
        endpoint,
        effective.handlerId(),
        base.confidence(),
        mapping.source(),
        "萬用字元屬性替換；實際路徑=" + match.path());
    return effective;
  }

  static void markInheritedActionTemplates(State state) {
    Set<String> extendsTargets = new TreeSet<>();
    for (Mapping mapping : state.actionMappings) {
      GraphNode handler = state.nodes.get(mapping.handlerId());
      if (handler == null) continue;
      String value = handler.attributes().get("extends");
      if (value == null || value.isBlank()) continue;
      String normalized = value.startsWith("//") ? value.substring(1) : value;
      for (Mapping candidate : state.actionMappings)
        if (candidate.module().equals(mapping.module())
            && (candidate.route().equals(value)
                || candidate.route().equals(normalized)
                || candidate.route().equals(mapping.module() + normalized)
                || Objects.equals(
                    state.nodes.get(candidate.handlerId()).attributes().get("name"), value)))
          extendsTargets.add(candidate.route());
    }
    for (Mapping mapping : state.actionMappings)
      if (extendsTargets.contains(mapping.route())) {
        String endpoint = state.endpointIds.get(mapping.route());
        GraphNode node = endpoint == null ? null : state.nodes.get(endpoint);
        if (node == null) continue;
        boolean hasCaller =
            state.edges.values().stream()
                .anyMatch(
                    edge ->
                        edge.to().equals(endpoint)
                            && Set.of(EdgeType.TRIGGERS, EdgeType.CALLS).contains(edge.type()));
        if (hasCaller) continue;
        Map<String, String> attributes = new TreeMap<>(node.attributes());
        attributes.put("inheritedTemplate", "true");
        attributes.put("templateAction", mapping.route());
        List<AnalysisEvidence> proof = new ArrayList<>(node.evidence());
        for (Mapping child : state.actionMappings) {
          GraphNode handler = state.nodes.get(child.handlerId());
          if (handler == null) continue;
          String value = handler.attributes().get("extends");
          if (value != null
              && (value.equals(mapping.route())
                  || value.equals(mapping.route().replaceFirst("^/", "//"))
                  || value.startsWith("//") && value.substring(1).equals(mapping.route())))
            proof.add(
                new AnalysisEvidence(
                    handler.source(),
                    PARSER,
                    ResolutionStatus.CONFIRMED,
                    "extends=" + value + " 由=" + child.route() + " 引用樣板=" + mapping.route()));
        }
        state.nodes.put(
            endpoint,
            new GraphNode(
                node.id(),
                node.type(),
                node.name(),
                attributes,
                node.source(),
                node.confidence(),
                proof.stream().distinct().sorted().toList()));
      }
  }
}
