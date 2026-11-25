package io.screentrace.adapter.spring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.ReturnStmt;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * One JSP page used in two modes, told apart by whether a model property is empty (for example a
 * new application versus a renewal that carries {@code previousId}). The emptiness is proven per
 * render from the model object's origin: a {@code new T()} keeps T's literal field initializer, and
 * a project method that builds {@code new T()} and calls {@code setP(id)} with the request's path
 * variable makes P non-empty. Each mode becomes its own screen (ADR 0186); renders whose origin is
 * not proven reach both and keep the mode chosen earlier in the journey in the report.
 */
final class SpringRequestVariants {
  private static final ObjectMapper JSON = new ObjectMapper();
  static final String PARSER = "SpringModelFacts";
  private static final Pattern EMPTY_TEST =
      Pattern.compile("empty\\s+([A-Za-z_]\\w*)\\.([A-Za-z_]\\w*)");
  private static final Pattern HEADING = Pattern.compile("(?is)<h1\\b[^>]*>(.*?)</h1>");
  private static final Pattern TERNARY =
      Pattern.compile("\\$\\{\\s*([^'\"{}?:]+?)\\s*\\?\\s*'([^'{}]*)'\\s*:\\s*'([^'{}]*)'\\s*}");

  private SpringRequestVariants() {}

  /** A proven emptiness of one model property on one render. */
  private record Fact(String model, String property, boolean empty) {}

  static ApplicationGraph enrich(
      ApplicationGraph graph, ProjectInventory inventory, ParsedJavaUnits units) {
    Map<String, GraphNode> nodes = new LinkedHashMap<>();
    graph.nodes().forEach(n -> nodes.put(n.id(), n));
    Map<String, Relationship> edges = new LinkedHashMap<>();
    graph.relationships().forEach(e -> edges.put(e.id(), e));
    // Proven emptiness per render edge.
    Map<String, List<Fact>> proven = new HashMap<>();
    for (var edge : graph.relationships())
      if (edge.type() == EdgeType.RENDERS
          && nodes.get(edge.from()) != null
          && nodes.get(edge.from()).type() == NodeType.HANDLER) {
        var facts = facts(nodes.get(edge.from()), edge, inventory, units);
        if (!facts.isEmpty()) proven.put(edge.id(), facts);
      }
    // A property is a mode when some page is rendered with it empty on one path and set on another.
    Map<String, Set<Boolean>> seen = new TreeMap<>();
    for (var facts : proven.values())
      for (var fact : facts)
        seen.computeIfAbsent(fact.property(), k -> new TreeSet<>()).add(fact.empty());
    Set<String> modes = new TreeSet<>();
    seen.forEach(
        (property, values) -> {
          if (values.size() == 2) modes.add(property);
        });
    if (modes.isEmpty()) return graph;
    boolean changed = false;
    for (GraphNode screen : graph.nodes()) {
      if (screen.type() != NodeType.SCREEN || screen.attributes().containsKey("stateVariant"))
        continue;
      String body = body(screen, inventory);
      if (body == null) continue;
      Matcher test = EMPTY_TEST.matcher(body);
      String model = null, property = null;
      while (test.find())
        if (modes.contains(test.group(2))) {
          if (model != null && !(model.equals(test.group(1)) && property.equals(test.group(2)))) {
            model = null;
            break;
          }
          model = test.group(1);
          property = test.group(2);
        }
      if (model == null) continue;
      List<Relationship> renders =
          graph.relationships().stream()
              .filter(e -> e.type() == EdgeType.RENDERS && e.to().equals(screen.id()))
              .toList();
      if (renders.isEmpty()) continue;
      String key = model + "." + property;
      String variantId =
          ApplicationGraph.id(NodeType.SCREEN, screen.id() + ":request:" + key + "=set");
      for (boolean empty : List.of(true, false)) {
        String id = empty ? screen.id() : variantId;
        var attributes = new TreeMap<>(screen.attributes());
        attributes.put("stateVariant", key + (empty ? " 為空" : " 有值"));
        attributes.put("requestProperty", property);
        attributes.put("requestFacts", json(Map.of(key, Map.of("empty", empty))));
        attributes.put("jspStateOrder", empty ? "0" : "1");
        String label = heading(body, key, empty);
        if (label != null) attributes.put("jspStateLabel", label);
        if (!empty) attributes.put("stateVariantOf", screen.id());
        var evidence = new ArrayList<>(screen.evidence());
        evidence.add(
            new AnalysisEvidence(
                screen.source(),
                PARSER,
                ResolutionStatus.INFERRED,
                json(Map.of("model", model, "property", property, "empty", empty))));
        nodes.put(
            id,
            new GraphNode(
                id,
                screen.type(),
                screen.name(),
                attributes,
                screen.source(),
                empty ? screen.confidence() : Confidence.INFERRED,
                evidence,
                screen.audience()));
      }
      for (var edge : graph.relationships()) {
        if (edge.from().equals(screen.id())
            && Set.of(EdgeType.CONTAINS, EdgeType.INCLUDES, EdgeType.DECLARED_BY)
                .contains(edge.type())) {
          String id = ApplicationGraph.id(NodeType.COMPONENT, "REQUEST-VARIANT:" + edge.id());
          edges.put(
              id,
              new Relationship(
                  id,
                  edge.type(),
                  variantId,
                  edge.to(),
                  edge.confidence(),
                  edge.source(),
                  edge.evidence()));
        }
      }
      for (var render : renders) {
        Boolean empty = null;
        for (var fact : proven.getOrDefault(render.id(), List.of()))
          if (fact.model().equals(model) && fact.property().equals(property)) empty = fact.empty();
        var proof = new ArrayList<>(render.evidence());
        proof.add(
            new AnalysisEvidence(
                render.source(),
                PARSER,
                empty == null ? ResolutionStatus.AMBIGUOUS : ResolutionStatus.INFERRED,
                json(
                    empty == null
                        ? Map.of("facts", Map.of())
                        : Map.of("facts", Map.of(key, Map.of("empty", empty))))));
        if (Boolean.FALSE.equals(empty)) {
          edges.put(render.id(), retarget(render, render.id(), variantId, proof));
        } else {
          edges.put(render.id(), retarget(render, render.id(), render.to(), proof));
          if (empty == null) {
            String id = ApplicationGraph.id(NodeType.HANDLER, "REQUEST-VARIANT:" + render.id());
            edges.put(id, retarget(render, id, variantId, proof));
          }
        }
      }
      // A link whose every endpoint now renders only the set mode opens that mode.
      for (var edge : graph.relationships()) {
        if (edge.type() != EdgeType.NAVIGATES_TO || !edge.to().equals(screen.id())) continue;
        Set<String> handlers = new HashSet<>();
        for (var proof : edge.evidence()) {
          String detail = Objects.toString(proof.detail(), "");
          if (detail.startsWith("對應端點="))
            for (var handled : graph.relationships())
              if (handled.type() == EdgeType.HANDLED_BY
                  && handled.from().equals(detail.substring("對應端點=".length())))
                handlers.add(handled.to());
        }
        if (handlers.isEmpty()) continue;
        boolean onlySet =
            renders.stream()
                .filter(r -> handlers.contains(r.from()))
                .allMatch(r -> edges.get(r.id()).to().equals(variantId));
        boolean any = renders.stream().anyMatch(r -> handlers.contains(r.from()));
        if (any && onlySet)
          edges.put(edge.id(), retarget(edge, edge.id(), variantId, edge.evidence()));
      }
      changed = true;
    }
    if (!changed) return graph;
    return new ApplicationGraph(
        graph.application(),
        List.copyOf(nodes.values()),
        List.copyOf(edges.values()),
        graph.diagnostics(),
        graph.apiContracts(),
        graph.schemaVersion(),
        graph.behaviors(),
        graph.validationRules());
  }

  private static Relationship retarget(
      Relationship edge, String id, String to, List<AnalysisEvidence> evidence) {
    return new Relationship(
        id, edge.type(), edge.from(), to, edge.confidence(), edge.source(), evidence);
  }

  /** The page heading in one mode, with conditional text on the mode's property resolved. */
  static String heading(String body, String key, boolean empty) {
    Matcher h1 = HEADING.matcher(body);
    if (!h1.find()) return null;
    Matcher choice = TERNARY.matcher(h1.group(1));
    StringBuilder out = new StringBuilder();
    boolean decided = false;
    while (choice.find()) {
      String condition = choice.group(1).strip();
      Boolean value =
          condition.equals("empty " + key)
              ? Boolean.valueOf(empty)
              : condition.equals("not empty " + key) ? Boolean.valueOf(!empty) : null;
      if (value == null) return null;
      decided = true;
      choice.appendReplacement(
          out, Matcher.quoteReplacement(value ? choice.group(2) : choice.group(3)));
    }
    choice.appendTail(out);
    String text = out.toString().replaceAll("<[^>]*>", "").replaceAll("\\s+", " ").strip();
    return decided && !text.isEmpty() && !text.contains("${") ? text : null;
  }

  /** The JSP a screen's page is written in (its Tiles body, else its view). */
  static String bodyText(GraphNode screen, ProjectInventory inventory) {
    return body(screen, inventory);
  }

  private static String body(GraphNode screen, ProjectInventory inventory) {
    String path = null;
    String tiles = screen.attributes().get("tilesAttributes");
    if (tiles != null)
      try {
        path = JSON.readTree(tiles).path("attributes").path("body").path("path").asText(null);
      } catch (IOException ignored) {
        // Not a Tiles page body.
      }
    if (path == null) path = screen.attributes().get("view");
    if (path == null || !path.endsWith(".jsp")) return null;
    try {
      return SafeProjectFiles.readUtf8Limited(
          inventory.root(), inventory.root().resolve(path), SafeProjectFiles.MAX_JSP_FILE_BYTES);
    } catch (IOException | RuntimeException unreadable) {
      return null;
    }
  }

  /** Emptiness facts every return of this handler that renders the screen agrees on. */
  private static List<Fact> facts(
      GraphNode handler, Relationship render, ProjectInventory inventory, ParsedJavaUnits units) {
    String className = handler.attributes().get("class"),
        methodName = handler.attributes().get("method");
    if (className == null || methodName == null || handler.source() == null) return List.of();
    CompilationUnit unit;
    try {
      unit = units.parse(inventory.root().resolve(handler.source().file()));
    } catch (IOException | RuntimeException unreadable) {
      return List.of();
    }
    var owner = unit.getClassByName(className).orElse(null);
    if (owner == null) return List.of();
    List<Fact> agreed = null;
    for (var proof : render.evidence()) {
      if (!proof.parser().equals("SpringControllerReturns")
          || !Objects.toString(proof.detail(), "")
              .contains("；方法=" + className + "." + methodName + "；")
          || proof.source() == null) continue;
      int line = proof.source().line();
      for (var method : owner.getMethodsByName(methodName)) {
        var returns =
            method.findAll(ReturnStmt.class).stream()
                .filter(r -> r.getBegin().map(p -> p.line == line).orElse(false))
                .toList();
        if (returns.size() != 1) continue;
        String target = Objects.toString(proof.detail(), "").replaceAll("^.*；目標=([^；]*)；.*$", "$1");
        var facts = facts(owner, method, returns.get(0), target, inventory, units);
        if (agreed == null) agreed = facts;
        else agreed.retainAll(facts);
      }
    }
    return agreed == null ? List.of() : agreed;
  }

  private static List<Fact> facts(
      ClassOrInterfaceDeclaration owner,
      MethodDeclaration method,
      ReturnStmt use,
      String view,
      ProjectInventory inventory,
      ParsedJavaUnits units) {
    var expression = use.getExpression().orElse(null);
    if (expression == null) return List.of();
    // The model is filled either here or in one private helper that returns this view.
    MethodDeclaration scope = method;
    Map<String, Expression> binding = new HashMap<>();
    List<MethodCallExpr> calls = new ArrayList<>();
    if (expression.isMethodCallExpr()) calls.add(expression.asMethodCallExpr());
    calls.addAll(expression.findAll(MethodCallExpr.class));
    List<MethodCallExpr> helpers = new ArrayList<>();
    for (var call : new LinkedHashSet<>(calls)) {
      if (call.getScope().isPresent()) continue;
      for (var helper : owner.getMethodsByName(call.getNameAsString()))
        if (helper.isPrivate()
            && helper.getParameters().size() == call.getArguments().size()
            && helper.findAll(ReturnStmt.class).stream()
                .anyMatch(
                    r ->
                        r.getExpression()
                            .filter(Expression::isStringLiteralExpr)
                            .map(e -> e.asStringLiteralExpr().asString().equals(view))
                            .orElse(false))) helpers.add(call);
    }
    if (helpers.size() > 1) return List.of();
    if (helpers.size() == 1) {
      var call = helpers.get(0);
      scope =
          owner.getMethodsByName(call.getNameAsString()).stream()
              .filter(m -> m.getParameters().size() == call.getArguments().size())
              .findFirst()
              .orElse(null);
      if (scope == null) return List.of();
      for (int i = 0; i < call.getArguments().size(); i++)
        binding.put(scope.getParameter(i).getNameAsString(), call.getArgument(i));
    }
    List<Fact> facts = new ArrayList<>();
    for (var add : scope.findAll(MethodCallExpr.class)) {
      if (!add.getNameAsString().equals("addAttribute")
          || add.getArguments().size() != 2
          || !add.getArgument(0).isStringLiteralExpr()
          || !add.getArgument(1).isNameExpr()) continue;
      String model = add.getArgument(0).asStringLiteralExpr().asString();
      Expression source = add.getArgument(1);
      String name = source.asNameExpr().getNameAsString();
      if (scope != method) {
        source = binding.get(name);
        if (source == null || !source.isNameExpr()) continue;
        name = source.asNameExpr().getNameAsString();
      }
      for (var entry : origin(method, name, inventory, units).entrySet())
        facts.add(new Fact(model, entry.getKey(), entry.getValue()));
    }
    return facts;
  }

  /** Emptiness of String properties of a local object, from where it was made. */
  private static Map<String, Boolean> origin(
      MethodDeclaration method, String name, ProjectInventory inventory, ParsedJavaUnits units) {
    var declarations =
        method.findAll(VariableDeclarator.class).stream()
            .filter(v -> v.getNameAsString().equals(name))
            .toList();
    if (declarations.size() != 1 || declarations.get(0).getInitializer().isEmpty()) return Map.of();
    if (method.findAll(AssignExpr.class).stream()
        .anyMatch(a -> a.getTarget().toString().equals(name))) return Map.of();
    var init = declarations.get(0).getInitializer().get();
    String type = declarations.get(0).getTypeAsString();
    Map<String, Boolean> result;
    if (init.isObjectCreationExpr() && init.asObjectCreationExpr().getArguments().isEmpty()) {
      result = initializers(init.asObjectCreationExpr().getTypeAsString(), inventory, units);
    } else if (init.isMethodCallExpr() && init.asMethodCallExpr().getScope().isPresent()) {
      result = built(init.asMethodCallExpr(), type, method, inventory, units);
    } else return Map.of();
    // Setters on the local in this method override or unsettle what its origin proved.
    for (var call : method.findAll(MethodCallExpr.class))
      if (call.getScope().filter(s -> s.toString().equals(name)).isPresent()
          && call.getNameAsString().startsWith("set")
          && call.getArguments().size() == 1) {
        String property = property(call.getNameAsString());
        var value = call.getArgument(0);
        if (value.isStringLiteralExpr())
          result.put(property, value.asStringLiteralExpr().asString().isEmpty());
        else result.remove(property);
      }
    return result;
  }

  /** A project method that builds a fresh object, sets some properties and returns it. */
  private static Map<String, Boolean> built(
      MethodCallExpr call,
      String type,
      MethodDeclaration caller,
      ProjectInventory inventory,
      ParsedJavaUnits units) {
    MethodDeclaration found = null;
    for (Path file : inventory.javaFiles())
      try {
        for (var m : units.parse(file).findAll(MethodDeclaration.class))
          if (m.getNameAsString().equals(call.getNameAsString())
              && m.getParameters().size() == call.getArguments().size()
              && m.getTypeAsString().equals(type)) {
            if (found != null) return new HashMap<>();
            found = m;
          }
      } catch (IOException | RuntimeException unreadable) {
        // Another file may still hold the method.
      }
    if (found == null) return new HashMap<>();
    var returns = found.findAll(ReturnStmt.class);
    if (returns.size() != 1
        || returns.get(0).getExpression().filter(Expression::isNameExpr).isEmpty())
      return new HashMap<>();
    String local = returns.get(0).getExpression().get().asNameExpr().getNameAsString();
    var declarations =
        found.findAll(VariableDeclarator.class).stream()
            .filter(v -> v.getNameAsString().equals(local))
            .toList();
    if (declarations.size() != 1
        || declarations.get(0).getInitializer().filter(Expression::isObjectCreationExpr).isEmpty())
      return new HashMap<>();
    var result =
        initializers(
            declarations.get(0).getInitializer().get().asObjectCreationExpr().getTypeAsString(),
            inventory,
            units);
    for (var setter : found.findAll(MethodCallExpr.class)) {
      if (setter.getScope().filter(s -> s.toString().equals(local)).isEmpty()
          || !setter.getNameAsString().startsWith("set")
          || setter.getArguments().size() != 1) continue;
      String property = property(setter.getNameAsString());
      var value = setter.getArgument(0);
      Boolean empty = null;
      if (value.isStringLiteralExpr()) empty = value.asStringLiteralExpr().asString().isEmpty();
      else if (value.isNameExpr()) {
        int index = parameterIndex(found, value.asNameExpr().getNameAsString());
        if (index >= 0 && pathVariable(caller, call.getArgument(index))) empty = false;
      }
      if (empty == null) result.remove(property);
      else result.put(property, empty);
    }
    return result;
  }

  private static int parameterIndex(MethodDeclaration method, String name) {
    for (int i = 0; i < method.getParameters().size(); i++)
      if (method.getParameter(i).getNameAsString().equals(name)) return i;
    return -1;
  }

  /** A path variable is never empty: an empty path segment does not match the mapping. */
  private static boolean pathVariable(MethodDeclaration caller, Expression argument) {
    if (!argument.isNameExpr()) return false;
    String name = argument.asNameExpr().getNameAsString();
    if (caller.findAll(AssignExpr.class).stream()
        .anyMatch(a -> a.getTarget().toString().equals(name))) return false;
    for (Parameter p : caller.getParameters())
      if (p.getNameAsString().equals(name)
          && p.getAnnotations().stream()
              .anyMatch(a -> a.getName().getIdentifier().equals("PathVariable"))) return true;
    return false;
  }

  /** Literal String field initializers of a project class: true where the literal is empty. */
  private static Map<String, Boolean> initializers(
      String type, ProjectInventory inventory, ParsedJavaUnits units) {
    String simple = type.substring(type.lastIndexOf('.') + 1);
    for (Path file : inventory.javaFiles()) {
      if (!file.getFileName().toString().equals(simple + ".java")) continue;
      try {
        var owner = units.parse(file).getClassByName(simple).orElse(null);
        if (owner == null) continue;
        Map<String, Boolean> result = new HashMap<>();
        for (FieldDeclaration field : owner.getFields())
          if (!field.isStatic())
            for (var variable : field.getVariables())
              variable
                  .getInitializer()
                  .filter(Expression::isStringLiteralExpr)
                  .ifPresent(
                      v ->
                          result.put(
                              variable.getNameAsString(),
                              v.asStringLiteralExpr().asString().isEmpty()));
        return result;
      } catch (IOException | RuntimeException unreadable) {
        return new HashMap<>();
      }
    }
    return new HashMap<>();
  }

  private static String property(String setter) {
    String name = setter.substring(3);
    return name.isEmpty() ? name : Character.toLowerCase(name.charAt(0)) + name.substring(1);
  }

  private static String json(Object value) {
    try {
      return JSON.writeValueAsString(value);
    } catch (IOException error) {
      throw new IllegalStateException(error);
    }
  }
}
