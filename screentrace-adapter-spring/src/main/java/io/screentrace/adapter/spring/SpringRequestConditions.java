package io.screentrace.adapter.spring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.AssignExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.stmt.BlockStmt;
import com.github.javaparser.ast.stmt.ReturnStmt;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.util.*;
import org.w3c.dom.Element;

/** Request facts that can select a branch without executing a controller. */
final class SpringRequestConditions {
  private static final ObjectMapper JSON = new ObjectMapper();

  record Condition(
      String servletPrefix,
      String parameter,
      String value,
      String defaultValue,
      boolean negated,
      String modelAttribute) {
    boolean accepts(String route) {
      if (servletPrefix == null) return true;
      int dynamic = route.length();
      for (char marker : new char[] {'{', '*'}) {
        int index = route.indexOf(marker);
        if (index >= 0) dynamic = Math.min(dynamic, index);
      }
      if (dynamic < route.length()
          && dynamic < servletPrefix.length()
          && servletPrefix.startsWith(route.substring(0, dynamic))) return true;
      return route.startsWith(servletPrefix) != negated;
    }

    AnalysisEvidence evidence(SourceLocation source, String endpoint) {
      var details = new TreeMap<String, String>();
      if (servletPrefix != null) {
        if (endpoint != null) details.put("endpointId", endpoint);
        details.put("servletPrefix", servletPrefix);
        if (modelAttribute != null) details.put("modelAttribute", modelAttribute);
      } else {
        details.put("parameter", parameter);
        details.put("value", value);
        if (defaultValue != null) details.put("defaultValue", defaultValue);
      }
      details.put("negated", Boolean.toString(negated));
      try {
        return new AnalysisEvidence(
            source,
            "SpringRequestCondition",
            ResolutionStatus.INFERRED,
            JSON.writeValueAsString(details));
      } catch (IOException error) {
        throw new IllegalStateException(error);
      }
    }
  }

  static Condition forTarget(
      MethodDeclaration method, SpringControllerReturns.Target target, boolean rootDispatcher) {
    String branch = target.branch();
    if (!branch.startsWith(":then") && !branch.startsWith(":else")) return null;
    var returns =
        method.getBody().stream()
            .flatMap(body -> body.getStatements().stream())
            .filter(ReturnStmt.class::isInstance)
            .map(ReturnStmt.class::cast)
            .filter(r -> r.getBegin().filter(p -> p.line == target.source().line()).isPresent())
            .toList();
    if (returns.size() != 1) return null;
    var condition =
        returns
            .get(0)
            .getExpression()
            .map(e -> SpringControllerReturns.conditionalView(e, method, returns.get(0)))
            .filter(Expression::isConditionalExpr)
            .map(e -> e.asConditionalExpr().getCondition())
            .map(SpringRequestConditions::unwrap)
            .orElse(null);
    if (condition == null) return null;
    boolean negated = branch.startsWith(":else");
    if (rootDispatcher) {
      String prefix = servletPrefix(condition, method, returns.get(0));
      if (prefix != null)
        return new Condition(
            prefix, null, null, null, negated, modelAttribute(method, condition, returns.get(0)));
    }
    if (!(condition instanceof MethodCallExpr call)
        || !call.getNameAsString().equals("equals")
        || call.getArguments().size() != 1
        || call.getScope().filter(Expression::isStringLiteralExpr).isEmpty()
        || !call.getArgument(0).isNameExpr()) return null;
    String name = call.getArgument(0).asNameExpr().getNameAsString();
    if (assigned(method, name)) return null;
    for (Parameter p : method.getParameters()) {
      if (!p.getNameAsString().equals(name) || !p.getTypeAsString().equals("String")) continue;
      var annotation =
          p.getAnnotations().stream()
              .filter(a -> a.getName().getIdentifier().equals("RequestParam"))
              .findFirst();
      if (annotation.isEmpty()) return null;
      var a = annotation.get();
      String key = null, fallback = null;
      if (a.isSingleMemberAnnotationExpr()
          && a.asSingleMemberAnnotationExpr().getMemberValue().isStringLiteralExpr())
        key = a.asSingleMemberAnnotationExpr().getMemberValue().asStringLiteralExpr().asString();
      if (a.isNormalAnnotationExpr())
        for (var pair : a.asNormalAnnotationExpr().getPairs())
          if (pair.getValue().isStringLiteralExpr()) {
            String text = pair.getValue().asStringLiteralExpr().asString();
            if (Set.of("name", "value").contains(pair.getNameAsString())) key = text;
            if (pair.getNameAsString().equals("defaultValue")) fallback = text;
          }
      if (key != null && !key.isBlank())
        return new Condition(
            null,
            key,
            call.getScope().orElseThrow().asStringLiteralExpr().asString(),
            fallback,
            negated,
            null);
    }
    return null;
  }

  private static String modelAttribute(
      MethodDeclaration method, Expression condition, ReturnStmt use) {
    if (!condition.isNameExpr()) return null;
    var models =
        new HashSet<>(
            method.getParameters().stream()
                .filter(p -> Set.of("Model", "ModelMap").contains(p.getTypeAsString()))
                .map(Parameter::getNameAsString)
                .filter(n -> !assigned(method, n))
                .toList());
    use.getExpression()
        .filter(Expression::isNameExpr)
        .map(e -> e.asNameExpr().getNameAsString())
        .ifPresent(models::add);
    var matching =
        method.findAll(MethodCallExpr.class).stream()
            .filter(
                c ->
                    Set.of("addAttribute", "addObject").contains(c.getNameAsString())
                        && c.getArguments().size() == 2)
            .filter(
                c ->
                    c.getScope()
                        .filter(Expression::isNameExpr)
                        .map(e -> models.contains(e.asNameExpr().getNameAsString()))
                        .orElse(false))
            .filter(c -> c.getArgument(0).isStringLiteralExpr())
            .toList();
    var bound =
        matching.stream()
            .filter(
                c ->
                    c.getArgument(1).equals(condition)
                        && c.getParentNode().flatMap(p -> p.getParentNode()).orElse(null)
                            == method.getBody().orElse(null)
                        && c.getEnd().orElseThrow().isBefore(use.getBegin().orElseThrow()))
            .toList();
    if (bound.size() != 1) return null;
    String key = bound.get(0).getArgument(0).asStringLiteralExpr().asString();
    return key.matches("[A-Za-z_][A-Za-z0-9_]*")
            && matching.stream()
                    .filter(c -> c.getArgument(0).asStringLiteralExpr().asString().equals(key))
                    .count()
                == 1
        ? key
        : null;
  }

  static boolean permits(Relationship render, String endpoint, List<String> requests) {
    for (var proof : render.evidence()) {
      if (!proof.parser().equals("SpringRequestCondition")) continue;
      try {
        var data = JSON.readTree(proof.detail());
        if (data.has("endpointId") && !data.path("endpointId").asText().equals(endpoint))
          return false;
        if (data.has("parameter")
            && !requests.isEmpty()
            && requests.stream().noneMatch(raw -> matchesQuery(raw, data))) return false;
      } catch (IOException error) {
        // An unreadable observation never excludes a possible outcome.
      }
    }
    return true;
  }

  private static boolean matchesQuery(String raw, com.fasterxml.jackson.databind.JsonNode data) {
    String[] parts = raw.split("#", 2)[0].split("\\?", 2);
    String key = data.path("parameter").asText();
    String resolved = null;
    if (parts.length == 2)
      for (String param : parts[1].split("&")) {
        String[] pair = param.split("=", 2);
        if (pair[0].contains("{") || pair[0].contains("%") || pair[0].contains("+")) return true;
        if (!pair[0].equals(key)) continue;
        if (resolved != null) return true;
        resolved = pair.length == 2 ? pair[1] : "";
      }
    if (resolved == null || resolved.isEmpty()) resolved = data.path("defaultValue").asText(null);
    if (resolved == null || !resolved.matches("[A-Za-z0-9_.~-]*")) return true;
    return resolved.equals(data.path("value").asText()) != data.path("negated").asBoolean(false);
  }

  static List<String> requestPaths(Relationship request, GraphNode trigger) {
    String prefix = request.to() + " ";
    var alternatives =
        request.evidence().stream()
            .filter(e -> e.parser().equals("JspRequestPath") && e.detail().startsWith(prefix))
            .map(e -> e.detail().substring(prefix.length()))
            .distinct()
            .toList();
    if (!alternatives.isEmpty()) return alternatives;
    String target = trigger.attributes().get("target");
    return target != null
            && target.startsWith("/")
            && !target.startsWith("//")
            && "GET".equalsIgnoreCase(trigger.attributes().getOrDefault("httpMethod", "GET"))
        ? List.of(target)
        : List.of();
  }

  private static String servletPrefix(
      Expression condition, MethodDeclaration method, ReturnStmt use) {
    if (condition.isNameExpr()) {
      String name = condition.asNameExpr().getNameAsString();
      var definitions =
          method.findAll(VariableDeclarator.class).stream()
              .filter(v -> v.getNameAsString().equals(name))
              .toList();
      if (definitions.size() != 1 || assigned(method, name)) return null;
      var variable = definitions.get(0);
      if (variable.findAncestor(BlockStmt.class).orElse(null) != method.getBody().orElse(null)
          || !variable.getEnd().orElseThrow().isBefore(use.getBegin().orElseThrow())) return null;
      condition = variable.getInitializer().map(SpringRequestConditions::unwrap).orElse(null);
    }
    if (!(condition instanceof MethodCallExpr prefix)
        || !prefix.getNameAsString().equals("startsWith")
        || prefix.getArguments().size() != 1
        || !prefix.getArgument(0).isStringLiteralExpr()
        || !(prefix.getScope().orElse(null) instanceof MethodCallExpr servlet)
        || !servlet.getNameAsString().equals("getServletPath")
        || !servlet.getArguments().isEmpty()
        || servlet.getScope().filter(Expression::isNameExpr).isEmpty()) return null;
    String request = servlet.getScope().orElseThrow().asNameExpr().getNameAsString();
    boolean servletRequest =
        method.getParameters().stream()
            .anyMatch(
                p ->
                    p.getNameAsString().equals(request)
                        && Set.of(
                                "HttpServletRequest",
                                "javax.servlet.http.HttpServletRequest",
                                "jakarta.servlet.http.HttpServletRequest")
                            .contains(p.getTypeAsString()));
    String value = prefix.getArgument(0).asStringLiteralExpr().asString();
    return servletRequest && !assigned(method, request) && value.matches("/[A-Za-z0-9_./-]*/")
        ? value
        : null;
  }

  private static boolean assigned(MethodDeclaration method, String name) {
    return method.findAll(AssignExpr.class).stream()
        .anyMatch(
            a ->
                a.getTarget().isNameExpr()
                    && a.getTarget().asNameExpr().getNameAsString().equals(name));
  }

  private static Expression unwrap(Expression expression) {
    while (expression.isEnclosedExpr()) expression = expression.asEnclosedExpr().getInner();
    return expression;
  }

  static boolean rootDispatcher(ProjectInventory inventory) {
    var files =
        inventory.files().stream()
            .filter(p -> p.toString().replace('\\', '/').endsWith("/WEB-INF/web.xml"))
            .toList();
    if (files.size() != 1) return false;
    try {
      var document =
          SafeProjectFiles.parseXml(
              SafeProjectFiles.readUtf8Limited(
                  inventory.root(), files.get(0), SafeProjectFiles.MAX_XML_FILE_BYTES),
              false);
      Set<String> dispatchers = new HashSet<>();
      var servlets = document.getElementsByTagName("servlet");
      for (int i = 0; i < servlets.getLength(); i++) {
        var servlet = (Element) servlets.item(i);
        if (text(servlet, "servlet-class")
            .equals("org.springframework.web.servlet.DispatcherServlet"))
          dispatchers.add(text(servlet, "servlet-name"));
      }
      var mappings = document.getElementsByTagName("servlet-mapping");
      int count = 0;
      for (int i = 0; i < mappings.getLength(); i++) {
        var mapping = (Element) mappings.item(i);
        if (dispatchers.contains(text(mapping, "servlet-name"))) {
          var patterns = mapping.getElementsByTagName("url-pattern");
          if (patterns.getLength() != 1 || !text(mapping, "url-pattern").equals("/")) return false;
          count++;
        }
      }
      return dispatchers.size() == 1 && count == 1;
    } catch (IOException error) {
      return false;
    }
  }

  private static String text(Element element, String tag) {
    var nodes = element.getElementsByTagName(tag);
    return nodes.getLength() == 1 ? nodes.item(0).getTextContent().strip() : "";
  }
}
