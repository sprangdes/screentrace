package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.*;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Resolves only the explicitly authorized same-source URL variable exception; never evaluates EL.
 */
public final class UrlVariableResolver {
  public record Resolution(
      String value,
      String originalExpression,
      List<AnalysisEvidence> definitions,
      List<ConditionalUrlTargets.Alternative> alternatives) {
    Resolution(String value, String originalExpression, List<AnalysisEvidence> definitions) {
      this(value, originalExpression, definitions, List.of());
    }
  }

  private record Definition(
      String value,
      int end,
      SourceLocation source,
      List<Integer> scopes,
      List<Integer> loops,
      boolean valid) {}

  private record Scope(String tag, int id, boolean loop, String test) {}

  private static final Pattern VARIABLE = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
  private static final String PROPERTY = "[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*";
  private static final Pattern PATH_TERNARY =
      Pattern.compile(
          "\\$\\{\\s*("
              + PROPERTY
              + ")\\s*\\?\\s*(['\"])(/[A-Za-z0-9_./-]*|)\\2"
              + "\\s*:\\s*(['\"])(/[A-Za-z0-9_./-]*|)\\4\\s*}(.*)");
  private static final Set<String> CONTROL =
      Set.of(
          "c:if",
          "c:choose",
          "c:when",
          "c:otherwise",
          "c:foreach",
          "logic:iterate",
          "logic:present",
          "logic:notpresent",
          "logic:equal",
          "logic:notequal",
          "logic:empty",
          "logic:notempty",
          "logic:greaterthan",
          "logic:lessthan");
  private final Map<String, List<Definition>> definitions = new TreeMap<>();
  private final Set<String> writes = new HashSet<>();
  private final Map<Integer, List<Integer>> scopes = new HashMap<>();
  private final Map<Integer, List<Integer>> loops = new HashMap<>();
  private final Set<Integer> closedLoops = new HashSet<>();
  private final Map<Integer, Scope> controls = new HashMap<>();
  private final Map<Integer, List<Scope>> choices = new HashMap<>();
  private final Map<Integer, Integer> closeOffsets = new HashMap<>();
  private final Map<Integer, List<ConditionalUrlTargets.Alternative>> ternaries = new HashMap<>();
  private final String path;
  private boolean unknownWrite;

  public UrlVariableResolver(String path, String text) {
    this(path, text, Set.of());
  }

  public UrlVariableResolver(String path, String text, Set<String> includedWrites) {
    this.path = path;
    writes.addAll(includedWrites);
    unknownWrite = includedWrites.contains("*");
    List<Scope> stack = new ArrayList<>();
    List<MarkupTag> tokens = MarkupTag.scan(text);
    Map<Integer, Integer> completed = completedDefinitions(tokens, text);
    for (int index = 0; index < tokens.size(); index++) {
      MarkupTag tag = tokens.get(index);
      String name = tag.name().toLowerCase(Locale.ROOT);
      if (tag.closing()) {
        for (int i = stack.size() - 1; i >= 0; i--)
          if (stack.get(i).tag().equals(name)) {
            if (i == stack.size() - 1 && stack.get(i).loop()) closedLoops.add(stack.get(i).id());
            if (i == stack.size() - 1) closeOffsets.put(stack.get(i).id(), tag.end());
            stack.subList(i, stack.size()).clear();
            break;
          }
        continue;
      }
      List<Integer> scope = stack.stream().map(Scope::id).toList();
      scopes.put(tag.end(), scope);
      List<Integer> loopScope = stack.stream().filter(Scope::loop).map(Scope::id).toList();
      loops.put(tag.end(), loopScope);
      if (Set.of("c:url", "spring:url").contains(name) && tag.attribute("var") != null) {
        String value = tag.attribute("value"), declaredScope = tag.attribute("scope");
        if (name.equals("c:url") && tag.attribute("context") == null) {
          var alternatives = pathAlternatives(value, tag.line());
          if (!alternatives.isEmpty() && Objects.equals(completed.get(tag.end()), tag.end())) {
            ternaries.put(tag.end(), alternatives);
            value = alternatives.get(0).path();
          }
          value = jstlPath(value, tokens, index, completed.get(tag.end()));
        }
        if (MarkupAnalysis.dynamic(tag.attribute("var"))) unknownWrite = true;
        // Only known loop scopes can consume a URL defined in that same iteration.
        boolean authorizedLoop =
            name.equals("spring:url")
                && stack.stream()
                    .filter(Scope::loop)
                    .allMatch(s -> s.tag().equals("c:foreach") || s.tag().equals("logic:iterate"));
        boolean valid =
            value != null
                && !MarkupAnalysis.dynamic(value)
                && (declaredScope == null || declaredScope.equals("page"))
                && (loopScope.isEmpty()
                    || authorizedLoop
                    || name.equals("c:url")
                        && stack.stream()
                            .filter(Scope::loop)
                            .allMatch(s -> s.tag().equals("c:foreach"))
                        && value.startsWith("/"))
                && tag.attribute("context") == null;
        definitions
            .computeIfAbsent(tag.attribute("var"), k -> new ArrayList<>())
            .add(
                new Definition(
                    value,
                    completed.getOrDefault(tag.end(), Integer.MAX_VALUE),
                    new SourceLocation(path, tag.line()),
                    scope,
                    loopScope,
                    valid));
      } else if (tag.attribute("var") != null || name.equals("c:remove")) {
        String variable = tag.attribute("var");
        if (variable == null || MarkupAnalysis.dynamic(variable)) unknownWrite = true;
        else writes.add(variable);
      }

      boolean selfClosing = text.charAt(tag.end() - 1) == '/';
      boolean unknownCustom =
          name.contains(":")
              && !name.startsWith("html:")
              && !name.startsWith("form:")
              && !Set.of("spring:url", "spring:param", "c:url", "c:param", "c:choose")
                  .contains(name)
              && !CONTROL.contains(name);
      if ((CONTROL.contains(name) || unknownCustom) && !selfClosing) {
        var control =
            new Scope(
                name,
                tag.end(),
                unknownCustom || name.equals("c:foreach") || name.equals("logic:iterate"),
                tag.attribute("test"));
        controls.put(control.id(), control);
        if (!stack.isEmpty() && stack.get(stack.size() - 1).tag().equals("c:choose"))
          choices
              .computeIfAbsent(stack.get(stack.size() - 1).id(), ignored -> new ArrayList<>())
              .add(control);
        stack.add(control);
      }
    }
    // Scriptlets can mutate page-scope attributes. Exclude JSP comments before checking the
    // delimiter.
    String withoutComments = text.replaceAll("(?s)<%--.*?--%>", "");
    for (int i = withoutComments.indexOf("<%"); i >= 0; i = withoutComments.indexOf("<%", i + 2))
      if (!withoutComments.startsWith("<%@", i)) unknownWrite = true;
  }

  private static String jstlPath(String value, List<MarkupTag> tokens, int index, Integer end) {
    if (value == null || end == null) return null;
    value = pathTemplate(value);
    if (value == null) return null;
    if (end == tokens.get(index).end()) return value;
    if (!value.startsWith("/") || value.startsWith("//") || value.contains("#")) return value;
    String withParams = value;
    for (int child = index + 1; child < tokens.size() && tokens.get(child).end() < end; child++) {
      var param = tokens.get(child);
      String key = param.attribute("name"), argument = param.attribute("value");
      if (param.closing()
          || !param.name().equalsIgnoreCase("c:param")
          || key == null
          || !VARIABLE.matcher(key).matches()
          || argument == null) return value + (value.contains("?") ? "&" : "?") + "{query}";
      if (!argument.matches("[A-Za-z0-9_.~-]*")) argument = "{queryValue}";
      withParams += (withParams.contains("?") ? "&" : "?") + key + "=" + argument;
    }
    return withParams;
  }

  private static String pathTemplate(String value) {
    if (value.startsWith("/") && !value.startsWith("//") && MarkupAnalysis.dynamic(value)) {
      for (String segment : value.split("/", -1))
        if (MarkupAnalysis.dynamic(segment) && !segment.matches("\\$\\{" + PROPERTY + "}"))
          return null;
      value = value.replaceAll("\\$\\{(" + PROPERTY + ")}", "{$1}");
    }
    return MarkupAnalysis.dynamic(value) ? null : value;
  }

  private static List<ConditionalUrlTargets.Alternative> pathAlternatives(String value, int line) {
    if (value == null) return List.of();
    var match = PATH_TERNARY.matcher(value);
    if (!match.matches() || !match.group(6).isEmpty() && !match.group(6).startsWith("/"))
      return List.of();
    String yes = pathTemplate(match.group(3) + match.group(6));
    String no = pathTemplate(match.group(5) + match.group(6));
    if (yes == null
        || no == null
        || !yes.startsWith("/")
        || yes.startsWith("//")
        || !no.startsWith("/")
        || no.startsWith("//")) return List.of();
    String guard = "${" + match.group(1) + "}";
    return List.of(
        new ConditionalUrlTargets.Alternative(yes, guard, line),
        new ConditionalUrlTargets.Alternative(no, "!(" + guard + ")", line));
  }

  private static Map<Integer, Integer> completedDefinitions(List<MarkupTag> tokens, String text) {
    Map<Integer, Integer> completed = new HashMap<>();
    List<MarkupTag> open = new ArrayList<>();
    for (var tag : tokens)
      if (Set.of("c:url", "spring:url").contains(tag.name().toLowerCase(Locale.ROOT))) {
        if (tag.closing()) {
          for (int i = open.size() - 1; i >= 0; i--)
            if (open.get(i).name().equalsIgnoreCase(tag.name())) {
              completed.put(open.get(i).end(), tag.end());
              open.subList(i, open.size()).clear();
              break;
            }
        } else if (text.charAt(tag.end() - 1) == '/') completed.put(tag.end(), tag.end());
        else open.add(tag);
      }
    return completed;
  }

  public Resolution resolve(String raw, MarkupTag use) {
    if (raw == null) return new Resolution(null, null, List.of());
    String expression = raw;
    if (raw.stripLeading().startsWith("<c:out")) {
      var nested = MarkupTag.scan(raw);
      if (nested.size() == 1
          && nested.get(0).name().equalsIgnoreCase("c:out")
          && !nested.get(0).closing()
          && raw.stripTrailing().endsWith("/>")
          && nested.get(0).attribute("value") != null
          && nested.get(0).attribute("default") == null
          && raw.substring(nested.get(0).end() + 1).isBlank())
        expression = nested.get(0).attribute("value").strip();
    }
    if (raw.stripLeading().startsWith("<c:url") || raw.stripLeading().startsWith("<spring:url")) {
      List<MarkupTag> nested = MarkupTag.scan(raw);
      if (nested.size() == 1
          && nested.get(0).attribute("value") != null
          && !MarkupAnalysis.dynamic(nested.get(0).attribute("value")))
        return new Resolution(
            nested.get(0).attribute("value"),
            raw,
            List.of(
                new AnalysisEvidence(
                    new SourceLocation(path, use.line()),
                    "JspUrlVariableResolver",
                    ResolutionStatus.CONFIRMED,
                    "巢狀 URL 常值定義；param 不解析")));
      if (nested.size() == 1 && nested.get(0).attribute("value") != null) {
        String value = nested.get(0).attribute("value");
        if (nested.get(0).name().equalsIgnoreCase("c:url")
            && nested.get(0).attribute("context") == null) {
          var alternatives = pathAlternatives(value, use.line());
          if (!alternatives.isEmpty()) return new Resolution(raw, raw, List.of(), alternatives);
        }
        int delimiter = value.indexOf('?');
        if (delimiter > 0
            && value.substring(0, delimiter).matches("/[A-Za-z0-9_./-]*")
            && value.substring(delimiter + 1).matches("[A-Za-z0-9_=&.$(){} -]*")
            && !value.substring(delimiter + 1).contains("#{"))
          return new Resolution(
              value.replaceAll("\\$\\{[^{}]*}", "{queryValue}"),
              raw,
              List.of(
                  new AnalysisEvidence(
                      new SourceLocation(path, use.line()),
                      "JspUrlVariableResolver",
                      ResolutionStatus.INFERRED,
                      "巢狀 URL 的路徑為字面常值；查詢參數運算式未求值；原文=" + raw)));
      }
      return new Resolution(raw, raw, List.of());
    }
    int query = raw.indexOf('?');
    if (query > 0
        && !MarkupAnalysis.dynamic(raw.substring(0, query))
        && raw.substring(query).contains("<bean:write")) {
      StringBuilder value = new StringBuilder();
      int cursor = 0;
      boolean supported = true;
      for (var token : MarkupTag.scan(raw))
        if (token.start() > query) {
          String property = token.attribute("property"), name = token.attribute("name");
          if (!token.name().equals("bean:write")
              || name == null
              || property == null
              || !name.matches("[A-Za-z_][A-Za-z0-9_]*")
              || !property.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            supported = false;
            break;
          }
          value.append(raw, cursor, token.start()).append('{').append(property).append('}');
          cursor = token.end() + 1;
        }
      if (supported && cursor > 0)
        return new Resolution(
            value.append(raw.substring(cursor)).toString(),
            raw,
            List.of(
                new AnalysisEvidence(
                    new SourceLocation(path, use.line()),
                    "JspUrlVariableResolver",
                    ResolutionStatus.INFERRED,
                    "查詢參數來自 bean:write；保留參數樣板，執行時值未知；原文=" + raw)));
    }
    if (!expression.startsWith("${") || !expression.endsWith("}"))
      return new Resolution(raw, raw, List.of());
    expression = expression.substring(2, expression.length() - 1).trim();
    if (expression.startsWith("fn:escapeXml(") && expression.endsWith(")"))
      expression = expression.substring(13, expression.length() - 1).trim();
    if (!VARIABLE.matcher(expression).matches() || unknownWrite || writes.contains(expression))
      return new Resolution(raw, raw, List.of());
    var values = definitions.getOrDefault(expression, List.of());
    var useScopes = scopes.getOrDefault(use.end(), List.of());
    if (values.size() != 1)
      return new Resolution(raw, raw, List.of(), choose(values, use, useScopes));
    Definition definition = values.get(0);
    if (!definition.valid()
        || definition.end() >= use.end()
        || useScopes.size() < definition.scopes().size()
        || !useScopes.subList(0, definition.scopes().size()).equals(definition.scopes()))
      return new Resolution(raw, raw, List.of());
    if (!definition.loops().isEmpty()
        && (!definition.loops().equals(loops.getOrDefault(use.end(), List.of()))
            || !closedLoops.containsAll(definition.loops())))
      return new Resolution(raw, raw, List.of());
    var alternatives = ternaries.get(definition.end());
    if (alternatives != null) return new Resolution(raw, raw, List.of(), alternatives);
    String rule =
        definition.loops().isEmpty() ? "同來源、使用前、單一定義且作用域可證明" : "同來源、使用前、單一定義且位於同一可證明迴圈作用域";
    return new Resolution(
        definition.value(),
        raw,
        List.of(
            new AnalysisEvidence(
                definition.source(),
                "JspUrlVariableResolver",
                definition.value().contains("{")
                    ? ResolutionStatus.INFERRED
                    : ResolutionStatus.CONFIRMED,
                rule + "；原始運算式：" + raw + "；路徑=" + definition.value())));
  }

  private List<ConditionalUrlTargets.Alternative> choose(
      List<Definition> values, MarkupTag use, List<Integer> useScopes) {
    if (values.size() < 2 || values.size() > 16) return List.of();
    var first = values.get(0).scopes();
    if (first.size() < 2) return List.of();
    int chooseIndex = first.size() - 2;
    int choose = first.get(chooseIndex);
    if (!controls.get(choose).tag().equals("c:choose")
        || closeOffsets.getOrDefault(choose, Integer.MAX_VALUE) >= use.start()
        || useScopes.size() < chooseIndex
        || !useScopes.subList(0, chooseIndex).equals(first.subList(0, chooseIndex)))
      return List.of();
    var branches = choices.getOrDefault(choose, List.of());
    if (branches.size() != values.size()) return List.of();
    List<ConditionalUrlTargets.Alternative> alternatives = new ArrayList<>();
    List<String> prior = new ArrayList<>();
    for (int i = 0; i < branches.size(); i++) {
      var branch = branches.get(i);
      var definition = values.get(i);
      boolean last = i == branches.size() - 1;
      if (!definition.valid()
          || ternaries.containsKey(definition.end())
          || !definition.loops().isEmpty()
          || !definition.value().startsWith("/")
          || definition.value().startsWith("//")
          || definition.end() >= use.start()
          || definition.scopes().size() != first.size()
          || !definition
              .scopes()
              .subList(0, chooseIndex + 1)
              .equals(first.subList(0, chooseIndex + 1))
          || definition.scopes().get(chooseIndex + 1) != branch.id()
          || !branch.tag().equals(last ? "c:otherwise" : "c:when")
          || closeOffsets.getOrDefault(branch.id(), Integer.MAX_VALUE) >= use.start()
          || (!last && branch.test() == null)) return List.of();
      List<String> guards = new ArrayList<>(prior);
      if (!last) {
        guards.add("(" + branch.test() + ")");
        prior.add("!(" + branch.test() + ")");
      }
      alternatives.add(
          new ConditionalUrlTargets.Alternative(
              definition.value(), String.join(" && ", guards), definition.source().line()));
    }
    return alternatives;
  }
}
