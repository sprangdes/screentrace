package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsDispatch.*;
import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsProjectAnalyzer.*;

import io.screentrace.adapter.struts.StrutsModel.Mapping;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.adapter.struts.StrutsModel.WildcardMatch;
import io.screentrace.adapter.struts.StrutsModel.WildcardResolution;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.util.*;
import java.util.regex.*;

/** Wildcard action mapping matching and substitution. */
final class StrutsWildcards {
  private StrutsWildcards() {}

  static String normalizeStrutsAction(String raw, String module, State state) {
    if (raw == null || !StrutsSources.literal(raw)) return raw;
    String path = raw.split("[?#]", 2)[0];
    if (path.isBlank()) return path;
    if (!path.startsWith("/")) path = "/" + path;
    if (module != null
        && !module.isBlank()
        && !path.equals(module)
        && !path.startsWith(module + "/")) path = module + path;
    return path;
  }

  static WildcardResolution resolveWildcard(String path, String module, State state) {
    List<WildcardMatch> matches = new ArrayList<>();
    for (Mapping mapping : state.actionMappings)
      if (mapping.module().equals(Objects.toString(module, ""))) {
        WildcardMatch match = wildcardMatch(mapping.route(), path, mapping);
        if (match != null) matches.add(match);
      }
    if (matches.isEmpty()) return null;
    WildcardMatch first = matches.get(0), last = matches.get(matches.size() - 1);
    if (first.mapping().route().equals(last.mapping().route()))
      return new WildcardResolution(List.of(last), false);
    if (state.strutsVersion.isVersion13()) return new WildcardResolution(List.of(last), false);
    return new WildcardResolution(List.of(first, last), true);
  }

  static String wildcardAmbiguityDetail(WildcardResolution resolution, State state) {
    return "Struts 版本無法證明為 1.3.x；首個符合="
        + wildcardCandidateText(resolution.candidates().get(0))
        + "；最後符合="
        + wildcardCandidateText(resolution.candidates().get(resolution.candidates().size() - 1))
        + "；版本證據="
        + state.strutsVersion.description();
  }

  static String wildcardCandidateText(WildcardMatch match) {
    return match.mapping().route()
        + "（"
        + match.mapping().source().file()
        + ":"
        + match.mapping().source().line()
        + "；實際路徑="
        + match.path()
        + "）";
  }

  static String wildcardAmbiguityMessage(WildcardResolution resolution, State state) {
    return "萬用字元 action 的首末匹配 mapping 不同，且 Struts 版本無法證明為 1.3.x；候選："
        + resolution.candidates().stream().map(StrutsWildcards::wildcardCandidateText).toList()
        + "；版本證據="
        + state.strutsVersion.description();
  }

  static boolean hasWildcardSubstitution(String route, String value) {
    return route != null
        && route.contains("*")
        && value != null
        && java.util.regex.Pattern.compile("\\{[0-9]\\}").matcher(value).find();
  }

  static WildcardMatch wildcardMatch(String pattern, String path, Mapping mapping) {
    StringBuilder regex = new StringBuilder("^");
    int captures = 0;
    for (int i = 0; i < pattern.length(); i++) {
      char c = pattern.charAt(i);
      if (c == '\\' && i + 1 < pattern.length()) {
        regex.append(java.util.regex.Pattern.quote(String.valueOf(pattern.charAt(++i))));
        continue;
      }
      if (c == '*') {
        boolean recursive = i + 1 < pattern.length() && pattern.charAt(i + 1) == '*';
        if (recursive) i++;
        regex.append(recursive ? "(.*)" : "([^/]*)");
        captures++;
        continue;
      }
      regex.append(java.util.regex.Pattern.quote(String.valueOf(c)));
    }
    regex.append("$");
    var matcher = java.util.regex.Pattern.compile(regex.toString()).matcher(path);
    if (!matcher.matches()) return null;
    List<String> values = new ArrayList<>();
    for (int group = 1; group <= captures; group++) values.add(matcher.group(group));
    return new WildcardMatch(mapping, path, List.copyOf(values));
  }

  static Mapping substituteWildcardValues(Mapping mapping, WildcardMatch match, State state) {
    List<String> captures = match.captures();
    java.util.function.Function<String, String> substitute =
        value -> {
          if (value == null) return null;
          var matcher = java.util.regex.Pattern.compile("\\{([0-9])\\}").matcher(value);
          StringBuffer result = new StringBuffer();
          while (matcher.find()) {
            int index = Integer.parseInt(matcher.group(1));
            String replacement =
                index == 0
                    ? match.path()
                    : index <= captures.size() ? captures.get(index - 1) : matcher.group();
            matcher.appendReplacement(
                result, java.util.regex.Matcher.quoteReplacement(replacement));
          }
          matcher.appendTail(result);
          return result.toString();
        };
    Map<String, String> effectiveAttributes = new TreeMap<>();
    effectiveActionAttributes(mapping, state, new LinkedHashSet<>())
        .forEach((key, value) -> effectiveAttributes.put(key, substitute.apply(value)));
    Map<String, String> forwards = new TreeMap<>(), local = new TreeMap<>();
    Mapping parent = extendedMapping(mapping, state);
    if (parent != null) {
      forwards.putAll(parent.forwards());
      local.putAll(parent.localForwards());
    }
    forwards.putAll(mapping.forwards());
    local.putAll(mapping.localForwards());
    forwards.replaceAll((key, value) -> substitute.apply(value));
    local.replaceAll((key, value) -> substitute.apply(value));
    String
        effectiveType =
            Objects.toString(
                effectiveAttributes.getOrDefault("type", effectiveAttributes.get("actionType")),
                mapping.type()),
        effectiveName = effectiveAttributes.get("name");
    String formId =
        effectiveName == null || effectiveName.isBlank()
            ? mapping.formId()
            : state.forms.getOrDefault(mapping.module() + ":" + effectiveName, mapping.formId());
    String parameter = Objects.toString(effectiveAttributes.get("parameter"), mapping.parameter()),
        input = Objects.toString(effectiveAttributes.get("input"), mapping.input());
    String handlerId =
        ApplicationGraph.id(
            NodeType.HANDLER,
            mapping.handlerId()
                + ":wildcard:"
                + match.path()
                + ":"
                + effectiveType
                + ":"
                + Objects.toString(formId, ""));
    GraphNode old = state.nodes.get(mapping.handlerId());
    if (old != null) {
      Map<String, String> attrs = new TreeMap<>(old.attributes());
      attrs.putAll(effectiveAttributes);
      attrs.put("actionType", effectiveType);
      attrs.put("type", effectiveType);
      attrs.put("path", match.path());
      if (formId != null) attrs.put("name", effectiveName);
      addNode(
          state,
          handlerId,
          NodeType.HANDLER,
          effectiveType + ".execute()",
          attrs,
          mapping.source(),
          old.confidence(),
          "Struts extends 先繼承後代入萬用字元；實際路徑="
              + match.path()
              + "；name="
              + Objects.toString(effectiveName, ""));
    }
    return new Mapping(
        mapping.route(),
        effectiveType,
        handlerId,
        formId,
        parameter,
        dispatchFamily(effectiveType, state, new HashSet<>()),
        forwards,
        local,
        mapping.forwardSources(),
        input,
        mapping.module(),
        mapping.source());
  }

  static Map<String, String> effectiveActionAttributes(
      Mapping mapping, State state, Set<String> visited) {
    if (!visited.add(mapping.route())) return new TreeMap<>();
    Map<String, String> result = new TreeMap<>();
    Mapping parent = extendedMapping(mapping, state);
    if (parent != null) result.putAll(effectiveActionAttributes(parent, state, visited));
    GraphNode handler = state.nodes.get(mapping.handlerId());
    if (handler != null)
      for (var item : handler.attributes().entrySet())
        if (!Set.of("module", "actionType").contains(item.getKey()))
          result.put(item.getKey(), item.getValue());
    return result;
  }

  static Mapping extendedMapping(Mapping mapping, State state) {
    GraphNode handler = state.nodes.get(mapping.handlerId());
    String value = handler == null ? null : handler.attributes().get("extends");
    if (value == null || value.isBlank()) return null;
    String normalized = value.startsWith("//") ? value.substring(1) : value;
    return state.actionMappings.stream()
        .filter(
            candidate ->
                candidate != mapping
                    && candidate.module().equals(mapping.module())
                    && (candidate.route().equals(value)
                        || candidate.route().equals(normalized)
                        || candidate.route().equals(mapping.module() + normalized)
                        || Objects.equals(
                            state.nodes.get(candidate.handlerId()).attributes().get("name"),
                            value)))
        .findFirst()
        .orElse(null);
  }

  static void recordWildcardMatch(
      String endpoint, String path, WildcardMatch match, State state, SourceLocation source) {
    state
        .wildcardMatches
        .computeIfAbsent(match.mapping().route(), ignored -> new TreeMap<>())
        .putIfAbsent(match.path(), match);
    GraphNode old = state.nodes.get(endpoint);
    if (old == null) return;
    Map<String, String> attributes = new TreeMap<>(old.attributes());
    Set<String> paths = new TreeSet<>();
    String previous = attributes.get("matchedPaths");
    if (previous != null && !previous.isBlank())
      paths.addAll(Arrays.asList(previous.split("\\u001f")));
    paths.add(path);
    attributes.put("matchedPaths", String.join("\u001f", paths));
    List<AnalysisEvidence> proof = new ArrayList<>(old.evidence());
    proof.add(
        new AnalysisEvidence(
            source,
            PARSER,
            old.confidence().resolutionStatus(),
            "Struts 萬用字元=" + match.mapping().route() + "；實際比對路徑=" + path));
    state.nodes.put(
        endpoint,
        new GraphNode(
            old.id(),
            old.type(),
            old.name(),
            attributes,
            old.source(),
            old.confidence(),
            proof.stream().distinct().sorted().toList()));
  }
}
