package io.screentrace.adapter.spring;

import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.util.*;

/** Resolves model-attribute names only from source declarations; no target classes are loaded. */
final class SpringFormBindings {
  private record Type(ClassOrInterfaceDeclaration node, String path) {}

  private record Model(
      String name,
      String type,
      SourceLocation source,
      String ownerClass,
      String method,
      int methodLine,
      boolean provider,
      boolean requestParameter) {}

  static ApplicationGraph bind(ApplicationGraph graph, ProjectInventory inventory) {
    return bind(graph, inventory, new ParsedJavaUnits(inventory.root()));
  }

  static ApplicationGraph bind(
      ApplicationGraph graph, ProjectInventory inventory, ParsedJavaUnits units) {
    Map<String, List<Type>> types = new TreeMap<>();
    List<Model> models = new ArrayList<>();
    List<Diagnostic> diagnostics = new ArrayList<>(graph.diagnostics());
    for (var file : inventory.javaFiles()) {
      String path = inventory.root().relativize(file).toString().replace('\\', '/');
      try {
        var unit = units.parse(file);
        for (var type : unit.findAll(ClassOrInterfaceDeclaration.class))
          types
              .computeIfAbsent(
                  type.getFullyQualifiedName().orElse(type.getNameAsString()),
                  k -> new ArrayList<>())
              .add(new Type(type, path));
        for (var parameter : unit.findAll(Parameter.class))
          for (var annotation : parameter.getAnnotations())
            if (isModelAttribute(annotation, unit)) {
              String name = literalName(annotation);
              if (name != null)
                models.add(
                    model(
                        name,
                        qualifiedType(unit, parameter.getType().asString()),
                        new SourceLocation(path, parameter.getBegin().map(p -> p.line).orElse(1)),
                        parameter));
            }
        for (var method : unit.findAll(MethodDeclaration.class))
          for (var annotation : method.getAnnotations())
            if (isModelAttribute(annotation, unit)) {
              String name = literalName(annotation);
              if (name != null)
                models.add(
                    model(
                        name,
                        qualifiedType(unit, method.getType().asString()),
                        new SourceLocation(path, method.getBegin().map(p -> p.line).orElse(1)),
                        method));
            }
      } catch (Exception error) {
        diagnostics.add(
            new Diagnostic(
                "表單模型來源無法解析：" + error.getMessage(),
                Confidence.UNRESOLVED,
                new SourceLocation(path, 1),
                "MODEL_SOURCE_UNRESOLVED",
                List.of(
                    new AnalysisEvidence(
                        new SourceLocation(path, 1),
                        "SpringFormBindings",
                        ResolutionStatus.UNRESOLVED,
                        null))));
      }
    }
    Index index = Index.of(graph);
    List<GraphNode> nodes = new ArrayList<>(graph.nodes());
    List<Relationship> edges = new ArrayList<>(graph.relationships());
    // Ids already present, so each form does not rescan every node and edge (RV-702).
    Set<String> nodeIds = new HashSet<>(), edgeIds = new HashSet<>();
    nodes.forEach(n -> nodeIds.add(n.id()));
    edges.forEach(e -> edgeIds.add(e.id()));
    Map<String, List<Model>> modelsByName = new HashMap<>();
    for (Model m : models)
      modelsByName.computeIfAbsent(m.name(), ignored -> new ArrayList<>()).add(m);
    for (var form : graph.nodes())
      if (form.type() == NodeType.COMPONENT && "FORM".equals(form.attributes().get("kind"))) {
        String name = form.attributes().get("model");
        if (name == null) continue;
        List<Model> candidates =
            modelsByName.getOrDefault(name, List.of()).stream()
                .filter(m -> appliesTo(m, form, index))
                .toList();
        // Several declarations are ambiguous, even if they happen to use the same class.
        if (candidates.size() != 1) continue;
        var model = candidates.get(0);
        var declarations = types.getOrDefault(model.type(), List.of());
        if (declarations.size() != 1) continue;
        var type = declarations.get(0);
        String id =
            ApplicationGraph.id(
                NodeType.FORM_MODEL,
                model.source().file() + ":" + model.type() + ":" + model.name());
        Map<String, String> attrs = new TreeMap<>();
        attrs.put("class", model.type());
        // Static fields and getters (serialVersionUID, constants) are never bound (RV-218).
        for (var field : type.node().getFields())
          if (!field.isStatic())
            for (var variable : field.getVariables())
              attrs.put(
                  "field." + variable.getNameAsString() + ".type", variable.getType().asString());
        for (var method : type.node().getMethods())
          if (method.getParameters().isEmpty()
              && !method.isStatic()
              && method.getNameAsString().startsWith("get")
              && method.getNameAsString().length() > 3) {
            String raw = method.getNameAsString().substring(3);
            attrs.put(
                "field." + java.beans.Introspector.decapitalize(raw) + ".type",
                method.getType().asString());
          }
        var proof =
            List.of(
                new AnalysisEvidence(
                    model.source(),
                    "SpringFormBindings",
                    ResolutionStatus.CONFIRMED,
                    "Spring @ModelAttribute：" + name),
                new AnalysisEvidence(
                    new SourceLocation(
                        type.path(), type.node().getBegin().map(p -> p.line).orElse(1)),
                    "SpringFormBindings",
                    ResolutionStatus.CONFIRMED,
                    "欄位宣告：" + model.type()));
        if (nodeIds.add(id))
          nodes.add(
              new GraphNode(
                  id,
                  NodeType.FORM_MODEL,
                  name,
                  attrs,
                  model.source(),
                  Confidence.CONFIRMED,
                  proof));
        String edgeId =
            ApplicationGraph.id(NodeType.COMPONENT, EdgeType.BINDS_TO + ":" + form.id() + ":" + id);
        if (edgeIds.add(edgeId))
          edges.add(
              new Relationship(
                  edgeId,
                  EdgeType.BINDS_TO,
                  form.id(),
                  id,
                  Confidence.CONFIRMED,
                  form.source(),
                  proof));
      }
    return new ApplicationGraph(
        graph.application(),
        nodes,
        edges,
        diagnostics,
        graph.apiContracts(),
        graph.schemaVersion(),
        graph.behaviors(),
        graph.validationRules());
  }

  private static Model model(
      String name, String type, SourceLocation source, com.github.javaparser.ast.Node declaration) {
    var method =
        declaration instanceof MethodDeclaration m
            ? m
            : declaration.findAncestor(MethodDeclaration.class).orElse(null);
    String owner =
        declaration
            .findAncestor(ClassOrInterfaceDeclaration.class)
            .map(ClassOrInterfaceDeclaration::getNameAsString)
            .orElse("");
    return new Model(
        name,
        type,
        source,
        owner,
        method == null ? "" : method.getNameAsString(),
        method == null ? -1 : method.getBegin().map(p -> p.line).orElse(-1),
        declaration instanceof MethodDeclaration
            && method.getAnnotations().stream()
                .noneMatch(
                    a ->
                        Set.of(
                                "RequestMapping",
                                "GetMapping",
                                "PostMapping",
                                "PutMapping",
                                "DeleteMapping",
                                "PatchMapping")
                            .contains(a.getName().getIdentifier())),
        declaration instanceof Parameter);
  }

  /** Lookups for {@link #appliesTo}, built once per graph instead of scanned per form (RV-702). */
  private record Index(
      Map<String, List<GraphNode>> handlersByClass,
      Map<String, List<Relationship>> byFrom,
      Map<String, List<String>> containersOf) {
    static Index of(ApplicationGraph graph) {
      Map<String, List<GraphNode>> handlers = new HashMap<>();
      for (var node : graph.nodes())
        if (node.type() == NodeType.HANDLER)
          handlers
              .computeIfAbsent(
                  node.source().file() + "\u0000" + node.attributes().get("class"),
                  ignored -> new ArrayList<>())
              .add(node);
      Map<String, List<Relationship>> byFrom = new HashMap<>();
      Map<String, List<String>> containers = new HashMap<>();
      for (var edge : graph.relationships()) {
        byFrom.computeIfAbsent(edge.from(), ignored -> new ArrayList<>()).add(edge);
        if (edge.type() == EdgeType.CONTAINS)
          containers.computeIfAbsent(edge.to(), ignored -> new ArrayList<>()).add(edge.from());
      }
      return new Index(handlers, byFrom, containers);
    }

    List<Relationship> from(String id) {
      return byFrom.getOrDefault(id, List.of());
    }
  }

  private static boolean appliesTo(Model model, GraphNode form, Index index) {
    Set<String> handlers = new HashSet<>();
    for (var node :
        index
            .handlersByClass()
            .getOrDefault(model.source().file() + "\u0000" + model.ownerClass(), List.of()))
      if (model.provider()
          || (model.method().equals(node.attributes().get("method"))
              && node.source().line() == model.methodLine())) handlers.add(node.id());
    if (handlers.isEmpty()) return false;
    if (model.requestParameter())
      for (var submit : index.from(form.id()))
        if (submit.type() == EdgeType.TRIGGERS && submit.confidence() == Confidence.CONFIRMED)
          for (var e : index.from(submit.to()))
            if (e.type() == EdgeType.HANDLED_BY
                && handlers.contains(e.to())
                && e.confidence() == Confidence.CONFIRMED) return true;
    Set<String> owners = new HashSet<>(index.containersOf().getOrDefault(form.id(), List.of()));
    return !owners.isEmpty()
        && owners.stream()
            .allMatch(
                owner ->
                    handlers.stream()
                        .anyMatch(
                            handler ->
                                index.from(handler).stream()
                                    .anyMatch(
                                        e ->
                                            e.type() == EdgeType.RENDERS
                                                && e.to().equals(owner)
                                                && e.confidence() == Confidence.CONFIRMED)));
  }

  private static boolean isModelAttribute(
      AnnotationExpr annotation, com.github.javaparser.ast.CompilationUnit unit) {
    String expected = "org.springframework.web.bind.annotation.ModelAttribute",
        name = annotation.getNameAsString();
    if (name.equals(expected)) return true;
    if (!name.equals("ModelAttribute")) return false;
    for (var declaration : unit.getImports())
      if (!declaration.isAsterisk() && declaration.getName().getIdentifier().equals(name))
        return declaration.getNameAsString().equals(expected);
    return unit.getImports().stream()
        .anyMatch(
            i ->
                i.isAsterisk()
                    && !i.isStatic()
                    && i.getNameAsString().equals("org.springframework.web.bind.annotation"));
  }

  private static String qualifiedType(com.github.javaparser.ast.CompilationUnit unit, String name) {
    if (name.contains(".") || name.contains("<")) return name;
    for (var declaration : unit.getImports())
      if (!declaration.isAsterisk()
          && !declaration.isStatic()
          && declaration.getName().getIdentifier().equals(name))
        return declaration.getNameAsString();
    return unit.getPackageDeclaration().map(p -> p.getNameAsString() + "." + name).orElse(name);
  }

  private static String literalName(AnnotationExpr annotation) {
    Expression value = null;
    if (annotation.isSingleMemberAnnotationExpr())
      value = annotation.asSingleMemberAnnotationExpr().getMemberValue();
    if (annotation.isNormalAnnotationExpr())
      for (var pair : annotation.asNormalAnnotationExpr().getPairs())
        if (Set.of("value", "name").contains(pair.getNameAsString())) value = pair.getValue();
    return value != null && value.isStringLiteralExpr()
        ? value.asStringLiteralExpr().asString()
        : null;
  }
}
