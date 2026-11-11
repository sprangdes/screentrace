package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsDispatch.*;
import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsScreens.*;
import static io.screentrace.adapter.struts.StrutsServletMappings.*;
import static io.screentrace.adapter.struts.StrutsTiles.*;

import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import io.screentrace.adapter.struts.StrutsModel.Mapping;
import io.screentrace.adapter.struts.StrutsModel.PendingForward;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.core.ApplicationGraph.*;
import java.util.*;
import org.w3c.dom.*;

/** Resolves action forwards declared in configuration and returned by Action source code. */
final class StrutsForwards {
  private StrutsForwards() {}

  /**
   * The name of an action's own <forward> that its Action code can never return: the class and
   * every project ancestor are parsed, every findForward uses a string literal, the ActionMapping
   * is never handed to other code, and no string literal in those classes names the forward. Null
   * whenever that cannot be shown.
   */
  static String unusedDeclaredForward(PendingForward pending, State state) {
    Mapping mapping =
        state.actionMappings.stream()
            .filter(m -> m.handlerId().equals(pending.ownerId()))
            .findFirst()
            .orElse(null);
    if (mapping == null || !mapping.family().isBlank()) return null;
    String name =
        mapping.forwardSources().entrySet().stream()
            .filter(
                e -> !e.getKey().equals(DIRECT_FORWARD) && e.getValue().equals(pending.source()))
            .map(Map.Entry::getKey)
            .findFirst()
            .orElse(null);
    if (name == null || !mapping.localForwards().containsKey(name)) return null;
    Set<String> literals = new HashSet<>();
    Set<String> seen = new HashSet<>();
    String type = mapping.type();
    boolean parsed = false;
    while (type != null && !type.isBlank() && seen.add(type)) {
      var java = state.types.get(type);
      if (java == null) {
        String simple = type.substring(type.lastIndexOf('.') + 1);
        if (type.startsWith("org.apache.struts.")
            || Set.of(
                    "Action",
                    "DispatchAction",
                    "LookupDispatchAction",
                    "MappingDispatchAction",
                    "EventDispatchAction")
                .contains(simple)) break;
        return null;
      }
      parsed = true;
      for (var method : java.declaration().getMethods()) {
        Set<String> mappings = new HashSet<>();
        method
            .getParameters()
            .forEach(
                p -> {
                  if (p.getType().asString().endsWith("ActionMapping"))
                    mappings.add(p.getNameAsString());
                });
        for (var call : method.findAll(MethodCallExpr.class)) {
          if (call.getNameAsString().equals("findForward")
              && (call.getArguments().size() != 1 || !call.getArgument(0).isStringLiteralExpr()))
            return null;
          boolean handedOn =
              call.getArguments().stream()
                  .anyMatch(
                      a -> a.isNameExpr() && mappings.contains(a.asNameExpr().getNameAsString()));
          if (handedOn
              && !(call.getNameAsString().equals("execute")
                  && call.getScope().filter(Expression::isSuperExpr).isPresent())) return null;
        }
      }
      java.declaration()
          .findAll(com.github.javaparser.ast.expr.StringLiteralExpr.class)
          .forEach(s -> literals.add(s.asString()));
      String parent = java.parent();
      if (parent != null && !parent.contains(".")) {
        String prefix = type.contains(".") ? type.substring(0, type.lastIndexOf('.') + 1) : "";
        if (state.types.containsKey(prefix + parent)) parent = prefix + parent;
      }
      type = parent;
    }
    return parsed && !literals.contains(name) ? name : null;
  }

  /** Key of the target an action mapping forwards to by itself, without running an Action class. */
  static final String DIRECT_FORWARD = "(action forward)";

  /**
   * {@code <action forward|include>} always wins over type; the built-in ForwardAction /
   * IncludeAction forward to {@code parameter}.
   */
  static String directActionForward(Element action, String type) {
    for (String attribute : List.of("forward", "include"))
      if (!action.getAttribute(attribute).isBlank()) return action.getAttribute(attribute);
    String shortName = type.substring(type.lastIndexOf('.') + 1),
        parameter = action.getAttribute("parameter");
    return Set.of("ForwardAction", "IncludeAction").contains(shortName) && !parameter.isBlank()
        ? parameter
        : null;
  }

  static void analyzeForwards(Mapping mapping, State state) {
    var declared = state.types.get(mapping.type());
    if (declared != null)
      for (var call : declared.declaration().findAll(MethodCallExpr.class))
        if (call.getNameAsString().equals("findForward")
            && call.getArguments().size() == 1
            && !call.getArgument(0).isStringLiteralExpr())
          diagnostic(
              state,
              "forward 運算式無法靜態解析：" + call.getArgument(0),
              new SourceLocation(declared.source().file(), call.getBegin().orElseThrow().line),
              "STRUTS_FORWARD_EXPRESSION");
    if (declared != null)
      for (var call : declared.declaration().findAll(MethodCallExpr.class))
        if (call.getNameAsString().equals("findForward")
            && call.getArguments().size() == 1
            && call.getArgument(0).isStringLiteralExpr()
            && !mapping
                .forwards()
                .containsKey(call.getArgument(0).asStringLiteralExpr().asString()))
          diagnostic(
              state,
              "forward 名稱沒有來源設定：" + call.getArgument(0),
              new SourceLocation(declared.source().file(), call.getBegin().orElseThrow().line),
              "STRUTS_FORWARD_UNRESOLVED");
    String direct = mapping.localForwards().get(DIRECT_FORWARD);
    if (direct != null)
      forward(
          direct,
          mapping.handlerId(),
          mapping.module(),
          mapping.forwardSources().getOrDefault(DIRECT_FORWARD, mapping.source()),
          state);
    for (var target : sourceTargets(mapping, null, state)) {
      state
          .actionForwardTargets
          .computeIfAbsent(mapping.handlerId(), ignored -> new ArrayList<>())
          .add(target);
      forward(target.target(), mapping.handlerId(), mapping.module(), target.source(), state);
    }
  }

  static List<PendingForward> sourceTargets(Mapping mapping, String wanted, State state) {
    List<PendingForward> result = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    String name = mapping.type();
    boolean own = true;
    while (name != null && seen.add(name) && seen.size() < 16) {
      var type = state.types.get(name);
      if (type == null) break;
      for (var method : type.declaration().getMethods())
        if (method.getType().asString().endsWith("ActionForward")
            && (own && (wanted == null || method.getNameAsString().equals(wanted))
                || !own && method.getNameAsString().equals("execute"))) {
          for (var call : method.findAll(MethodCallExpr.class))
            if (call.findAncestor(MethodDeclaration.class).orElse(null) == method
                && call.getNameAsString().equals("findForward")
                && call.getArguments().size() == 1
                && call.getArgument(0).isStringLiteralExpr()) {
              String target =
                  mapping.forwards().get(call.getArgument(0).asStringLiteralExpr().asString());
              if (target != null)
                result.add(
                    new PendingForward(
                        mapping.handlerId(),
                        mapping.module(),
                        target,
                        new SourceLocation(
                            type.source().file(), call.getBegin().orElseThrow().line)));
            }
          for (var ret : method.findAll(ReturnStmt.class))
            if (ret.getExpression().isPresent()
                && ret.findAncestor(MethodDeclaration.class).orElse(null) == method) {
              Expression expression = ret.getExpression().get();
              if (expression.isNameExpr()) {
                String variable = expression.asNameExpr().getNameAsString();
                var definitions =
                    method.findAll(com.github.javaparser.ast.body.VariableDeclarator.class).stream()
                        .filter(
                            v ->
                                v.getNameAsString().equals(variable)
                                    && v.getInitializer().isPresent())
                        .toList();
                if (definitions.size() != 1
                    || method.findAll(AssignExpr.class).stream()
                        .anyMatch(a -> a.getTarget().toString().equals(variable))) continue;
                expression = definitions.get(0).getInitializer().get();
              }
              if (!expression.isObjectCreationExpr()
                  || !expression
                      .asObjectCreationExpr()
                      .getType()
                      .getNameAsString()
                      .equals("ActionForward")
                  || expression.asObjectCreationExpr().getArguments().isEmpty()) continue;
              String target = forwardString(expression.asObjectCreationExpr().getArgument(0));
              if (target == null) continue;
              if (!target.startsWith("/")) {
                String path = target.split("[?#]", 2)[0];
                String query = target.substring(path.length());
                try {
                  target = java.net.URI.create(mapping.route()).resolve(path).toString() + query;
                } catch (Exception ignored) {
                  continue;
                }
              }
              var constructor = expression.asObjectCreationExpr();
              if (constructor.getArguments().size() == 2
                  && constructor.getArgument(1).isBooleanLiteralExpr())
                state
                    .forwardRedirects
                    .computeIfAbsent(target, k -> new TreeSet<>())
                    .add(constructor.getArgument(1).asBooleanLiteralExpr().getValue());
              result.add(
                  new PendingForward(
                      mapping.handlerId(),
                      mapping.module(),
                      target,
                      new SourceLocation(type.source().file(), ret.getBegin().orElseThrow().line)));
            }
        }
      own = false;
      String parent = type.parent();
      if (!parent.contains(".")) {
        String prefix = name.contains(".") ? name.substring(0, name.lastIndexOf('.') + 1) : "";
        if (state.types.containsKey(prefix + parent)) parent = prefix + parent;
      }
      name = parent;
    }
    return result.stream().distinct().toList();
  }

  static String forwardString(Expression expression) {
    List<Expression> pieces = new ArrayList<>();
    forwardPieces(expression, pieces);
    StringBuilder text = new StringBuilder();
    int slot = 0;
    for (var piece : pieces) {
      if (piece.isStringLiteralExpr()) text.append(piece.asStringLiteralExpr().asString());
      else if (text.indexOf("?") >= 0) text.append("{expression").append(++slot).append('}');
      else return null;
    }
    return text.length() < 4096 ? text.toString() : null;
  }

  static void forwardPieces(Expression value, List<Expression> pieces) {
    if (value.isBinaryExpr() && value.asBinaryExpr().getOperator() == BinaryExpr.Operator.PLUS) {
      forwardPieces(value.asBinaryExpr().getLeft(), pieces);
      forwardPieces(value.asBinaryExpr().getRight(), pieces);
    } else pieces.add(value);
  }

  static void forward(
      String target, String owner, String module, SourceLocation source, State state) {
    if (target == null || target.isBlank()) return;
    if (!StrutsSources.literal(target)) {
      diagnostic(state, "forward 無法靜態解析：" + target, source, "STRUTS_FORWARD_UNRESOLVED");
      return;
    }
    List<String> screens =
        resolveForwardScreens(target, module, state, new LinkedHashSet<>(), 0, source);
    if (screens.isEmpty()) {
      diagnostic(
          state, "forward 無法對應 JSP / Tiles 畫面：" + target, source, "STRUTS_FORWARD_UNRESOLVED");
      return;
    }
    for (String screen : screens) {
      edge(state, EdgeType.FORWARDS_TO, owner, screen, Confidence.CONFIRMED, source);
      var redirects = state.forwardRedirects.getOrDefault(target, Set.of(false));
      if (screenForView(target.split("[?#]", 2)[0], state, source) != null
          && redirects.contains(true))
        addSourceRequestPath(screen, target.split("[?#]", 2)[0], source, state);
      if (screenForView(target.split("[?#]", 2)[0], state, source) != null
          && redirects.contains(false))
        for (var mapping : state.actionMappings)
          if (mapping.handlerId().equals(owner))
            addSourceRequestPath(
                screen, publicPath(mapping.route(), mapping.module(), state), source, state);
      String view =
          state.nodes.get(screen) == null ? null : state.nodes.get(screen).attributes().get("view");
      if (view != null && !module.isBlank())
        state.jspModuleOwners.computeIfAbsent(view, key -> new TreeSet<>()).add(module);
    }
  }

  static List<String> resolveForwardScreens(
      String target,
      String module,
      State state,
      Set<String> visited,
      int depth,
      SourceLocation source) {
    if (depth >= 5) {
      diagnostic(state, "forward 鏈超過 5 層", source, "STRUTS_FORWARD_DEPTH");
      return List.of();
    }
    String named = state.globalForwards.get(module + ":" + target);
    if (named != null && !named.equals(target))
      return resolveForwardScreens(named, module, state, visited, depth + 1, source);
    String normalizedFaces = normalizeFacesPath(target, state);
    if (normalizedFaces == null) return List.of();
    final String resolvedTarget = normalizedFaces;
    if (state.tiles.containsKey(resolvedTarget)) {
      if (state.tilePageDefinitions.contains(resolvedTarget)
          || state.tileStandaloneDefinitions.contains(resolvedTarget)) {
        String screen = ensureTileScreen(resolvedTarget, state);
        return screen == null ? List.of() : List.of(screen);
      }
      Set<String> owners =
          state.tilePageOwners.entrySet().stream()
              .filter(entry -> entry.getValue().contains(resolvedTarget))
              .map(Map.Entry::getKey)
              .collect(java.util.stream.Collectors.toCollection(TreeSet::new));
      if (owners.size() == 1) {
        String screen = ensureTileScreen(owners.iterator().next(), state);
        return screen == null ? List.of() : List.of(screen);
      }
      if (owners.size() > 1) {
        diagnostic(
            state,
            "forward 目標對應多個 Tiles 頁面定義：" + resolvedTarget,
            source,
            "STRUTS_FORWARD_AMBIGUOUS");
        return List.of();
      }
      String screen = ensureTileScreen(resolvedTarget, state);
      return screen == null ? List.of() : List.of(screen);
    }
    String direct = screenForView(resolvedTarget, state, source);
    if (direct != null) return List.of(direct);
    String routePath = target.split("[?#]", 2)[0];
    String logical = logicalPath(routePath, module, state);
    if (logical == null
        && target.startsWith("/")
        && !target.startsWith("/WEB-INF/")
        && !target.contains(".jsp"))
      logical = module.isBlank() || target.startsWith(module + "/") ? target : module + target;
    if (logical == null) logical = target;
    List<Mapping> mappings = state.routes.getOrDefault(logical, List.of());
    if (mappings.isEmpty()) return List.of();
    if (mappings.size() > 1) {
      diagnostic(state, "forward 目標對應多個 action：" + target, source, "STRUTS_FORWARD_AMBIGUOUS");
      return List.of();
    }
    Mapping mapping = mappings.get(0);
    String command = dispatchValue(target, mapping.parameter());
    String visitKey = mapping.route() + "?" + Objects.toString(command, "");
    if (!visited.add(visitKey)) {
      diagnostic(state, "forward action 鏈形成循環：" + mapping.route(), source, "STRUTS_FORWARD_CYCLE");
      return List.of();
    }
    List<String> result =
        resolveMappingScreens(mapping, command, state, visited, depth + 1, source);
    visited.remove(visitKey);
    return result.stream().distinct().sorted().toList();
  }

  static List<String> resolveMappingScreens(
      Mapping mapping, State state, Set<String> visited, int depth, SourceLocation source) {
    return resolveMappingScreens(mapping, null, state, visited, depth, source);
  }

  static List<String> resolveMappingScreens(
      Mapping mapping,
      String command,
      State state,
      Set<String> visited,
      int depth,
      SourceLocation source) {
    if (depth >= 5) {
      diagnostic(state, "forward 鏈超過 5 層", source, "STRUTS_FORWARD_DEPTH");
      return List.of();
    }
    List<String> result = new ArrayList<>();
    if (command != null && !mapping.family().isBlank())
      for (var value : sourceTargets(mapping, command, state))
        result.addAll(
            resolveForwardScreens(
                value.target(), mapping.module(), state, visited, depth + 1, value.source()));
    else
      for (String value : mapping.localForwards().values())
        result.addAll(
            resolveForwardScreens(value, mapping.module(), state, visited, depth + 1, source));
    if (mapping.input() != null && !mapping.input().isBlank())
      result.addAll(
          resolveForwardScreens(
              mapping.input(), mapping.module(), state, visited, depth + 1, source));
    List<String> screens = result.stream().distinct().sorted().toList();
    String alias = publicPath(mapping.route(), mapping.module(), state);
    for (String screen : screens) addScreenRouteAlias(screen, alias, state);
    return screens;
  }
}
