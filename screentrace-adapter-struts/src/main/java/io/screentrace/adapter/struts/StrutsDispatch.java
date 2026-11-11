package io.screentrace.adapter.struts;

import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import io.screentrace.adapter.struts.StrutsModel.Mapping;
import io.screentrace.adapter.struts.StrutsModel.State;
import java.util.*;

/** DispatchAction family detection and dispatch method resolution. */
final class StrutsDispatch {
  private StrutsDispatch() {}

  static String dispatchFamily(String type, State state, Set<String> seen) {
    String shortName = type.substring(type.lastIndexOf('.') + 1);
    if (Set.of(
            "DispatchAction",
            "LookupDispatchAction",
            "MappingDispatchAction",
            "EventDispatchAction")
        .contains(shortName)) return shortName;
    if (!seen.add(type)) return "";
    var java = state.types.get(type);
    if (java == null) return "";
    // An execute(mapping, form, request, response) that never calls super.execute, in a class with
    // no other dispatch
    // methods, bypasses the dispatch machinery (SpringStrutsHibernate's actions). With dispatch
    // methods present it stays dispatch.
    if (overridesExecuteWithoutDispatch(java)) return "";
    String parent = java.parent();
    String direct = dispatchFamily(parent, state, seen);
    if (!direct.isBlank()) return direct;
    String prefix = type.contains(".") ? type.substring(0, type.lastIndexOf('.') + 1) : "";
    return dispatchFamily(prefix + parent, state, seen);
  }

  static boolean overridesExecuteWithoutDispatch(StrutsSources.JavaType java) {
    if (java.declaration().getMethods().stream()
        .anyMatch(m -> !m.getNameAsString().equals("execute") && validDispatchSignature(m)))
      return false;
    for (var method : java.declaration().getMethodsByName("execute"))
      if (method.getParameters().size() == 4
          && method.getType().asString().endsWith("ActionForward")
          && method.getBody().isPresent()
          && method.findAll(MethodCallExpr.class).stream()
              .noneMatch(
                  call ->
                      call.getNameAsString().equals("execute")
                          && call.getScope().filter(Expression::isSuperExpr).isPresent()))
        return true;
    return false;
  }

  static String dispatchValue(String target, String parameter) {
    if (parameter == null || parameter.isBlank() || !target.contains("?")) return null;
    String found = null;
    for (String pair : target.substring(target.indexOf('?') + 1).split("&")) {
      String[] parts = pair.split("=", 2);
      if (parts.length == 2 && parts[0].equals(parameter)) {
        if (found != null || !parts[1].matches("[A-Za-z_][A-Za-z0-9_]*")) return null;
        found = parts[1];
      }
    }
    return found;
  }

  static String dispatchMethodStatus(Mapping mapping, String value, State state) {
    String method = resolveMethod(mapping, value, state);
    if (method == null) return "找不到此方法";
    return typeWithMethod(mapping.type(), method, state, new HashSet<>()) == null
        ? "類別中找不到此方法"
        : "方法存在";
  }

  static boolean validDispatchSignature(MethodDeclaration method) {
    if (!method.isPublic() || method.getParameters().size() != 4) return false;
    List<String> expected =
        List.of("ActionMapping", "ActionForm", "HttpServletRequest", "HttpServletResponse");
    for (int i = 0; i < 4; i++) {
      String type = method.getParameter(i).getType().asString();
      if (!type.equals(expected.get(i)) && !type.endsWith("." + expected.get(i))) return false;
    }
    return method.getType().asString().equals("ActionForward")
        || method.getType().asString().endsWith(".ActionForward");
  }

  static StrutsSources.JavaType typeWithMethod(
      String name, String method, State state, Set<String> seen) {
    if (!seen.add(name)) return null;
    var type = state.types.get(name);
    if (type == null) return null;
    var methods =
        type.declaration().getMethodsByName(method).stream()
            .filter(m -> method.equals("getKeyMethodMap") || validDispatchSignature(m))
            .toList();
    if (methods.size() == 1) return type;
    if (methods.size() > 1) return null;
    String parent = type.parent();
    if (parent.isBlank()) return null;
    String qualified =
        parent.contains(".")
            ? parent
            : (name.contains(".") ? name.substring(0, name.lastIndexOf('.') + 1) : "") + parent;
    return typeWithMethod(qualified, method, state, seen);
  }

  static String resolveMethod(Mapping mapping, String value, State state) {
    if (value == null || !StrutsSources.literal(value)) return null;
    if (!mapping.family().equals("LookupDispatchAction")) return value;
    var type = typeWithMethod(mapping.type(), "getKeyMethodMap", state, new HashSet<>());
    if (type == null) return null;
    Set<String> methods = new TreeSet<>();
    for (var declaration : type.declaration().getMethodsByName("getKeyMethodMap"))
      for (MethodCallExpr call : declaration.findAll(MethodCallExpr.class))
        if (call.getNameAsString().equals("put")
            && call.getArguments().size() == 2
            && call.getArgument(0).isStringLiteralExpr()
            && call.getArgument(1).isStringLiteralExpr()) {
          String key = call.getArgument(0).asStringLiteralExpr().asString();
          if (!call.findAncestor(IfStmt.class).isPresent()
              && !call.findAncestor(SwitchStmt.class).isPresent()
              && state.messages.getOrDefault(key, Set.of()).size() == 1
              && state.messages.getOrDefault(key, Set.of()).contains(value))
            methods.add(call.getArgument(1).asStringLiteralExpr().asString());
        }
    return methods.size() == 1 ? methods.iterator().next() : null;
  }
}
