package io.screentrace.adapter.spring;

import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Diagnostic;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.core.StableGraphIds;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/** AST-based Spring mapping parser; React screens come from the shared React AST contribution. */
public final class SpringBootAnalyzer {
  private static final String REQUEST_MAPPING = "RequestMapping";

  public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
    AnalysisState state = new AnalysisState(inventory.root(), inventory.javaFiles());
    for (String message : inventory.diagnostics())
      state.diagnostics.add(
          new Diagnostic(
              message,
              Confidence.UNRESOLVED,
              new SourceLocation(".", 1),
              "SOURCE_LIMIT",
              List.of()));
    for (Path file : inventory.javaFiles()) {
      parseController(inventory.root(), file, state);
    }
    ApplicationGraph graph =
        new ApplicationGraph(
            new ApplicationGraph.Application(
                inventory.root().getFileName().toString(),
                inventory.root().toString(),
                inventory.technologies()),
            state.nodes,
            state.edges,
            state.diagnostics,
            state.apiContracts,
            ApplicationGraph.BEHAVIOR_SCHEMA_VERSION,
            List.of(),
            List.of());
    graph = io.screentrace.parser.jsp.ReactGraphContribution.enrich(graph, inventory);
    var completed =
        SpringServerValidation.enrich(
            io.screentrace.parser.jsp.UrlGraphContribution.enrich(graph, inventory, true),
            inventory);
    completed = io.screentrace.parser.jsp.RouteTemplateInference.enrich(completed, inventory);
    return io.screentrace.core.GraphIntegrityValidator.requireAnalysis(
        SpringExternalCalls.enrich(
            SpringExternalLoginFlow.enrich(
                SpringSecurityRedirects.enrich(completed, inventory), inventory),
            inventory));
  }

  private void parseController(Path root, Path file, AnalysisState state) {
    try {
      String relative = root.relativize(file).toString().replace('\\', '/');
      for (ClassOrInterfaceDeclaration type :
          io.screentrace.parser.jsp.JavaSources.parse(
                  SafeProjectFiles.readUtf8Limited(
                      root, file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES))
              .findAll(ClassOrInterfaceDeclaration.class)) {
        parseControllerType(type, relative, state);
      }
    } catch (IOException | RuntimeException exception) {
      state.diagnostics.add(
          new Diagnostic(
              "Unable to parse Java source: " + exception.getMessage(),
              Confidence.UNRESOLVED,
              new SourceLocation(root.relativize(file).toString().replace('\\', '/'), 1)));
    }
  }

  private void parseControllerType(
      ClassOrInterfaceDeclaration type, String relative, AnalysisState state) {
    if (!SpringMappings.isController(type)) {
      return;
    }
    var declaredBases = SpringMappingPaths.of(annotation(type, REQUEST_MAPPING), type);
    SpringMappingPaths.report(
        declaredBases,
        new SourceLocation(relative, type.getBegin().map(position -> position.line).orElse(1)),
        type.getNameAsString(),
        state.diagnostics);
    List<String> bases = SpringMappingPaths.effective(declaredBases);
    for (MethodDeclaration method : type.getMethods()) {
      java.util.Optional<AnnotationExpr> mapping = SpringMappings.mapping(method);
      if (mapping.isPresent()) {
        parseMapping(
            method,
            mapping.get(),
            new ControllerContext(type.getNameAsString(), relative, bases, type),
            state);
      }
    }
  }

  private void parseMapping(
      MethodDeclaration method,
      AnnotationExpr mapping,
      ControllerContext controller,
      AnalysisState state) {
    SourceLocation source =
        new SourceLocation(
            controller.relative(), method.getBegin().map(position -> position.line).orElse(1));
    var declaredPaths = SpringMappingPaths.of(mapping, controller.declaration());
    SpringMappingPaths.report(
        declaredPaths,
        source,
        controller.typeName() + "." + method.getNameAsString() + "()",
        state.diagnostics);
    List<String> methodPaths = SpringMappingPaths.effective(declaredPaths);
    String handlerName = controller.typeName() + "." + method.getNameAsString() + "()";
    String handlerId =
        StableGraphIds.handler(
            controller.relative(),
            controller.declaration().getFullyQualifiedName().orElse(controller.typeName()),
            method.getSignature().asString());
    addNode(
        state.nodes,
        new GraphNode(
            handlerId,
            NodeType.HANDLER,
            handlerName,
            Map.of("class", controller.typeName(), "method", method.getNameAsString()),
            source,
            Confidence.CONFIRMED));

    List<String> results = returnLiterals(method);
    boolean redirect =
        !results.isEmpty() && results.stream().allMatch(value -> value.startsWith("redirect:"));
    // One endpoint per declared method, as in SpringMvcAnalyzer (RV-202).
    for (String httpMethod : SpringMvcAnalyzer.httpMethods(mapping)) {
      EndpointContext endpoint =
          new EndpointContext(
              handlerId,
              httpMethod,
              SpringMappings.respondsWithBody(controller.declaration(), method),
              redirect,
              results,
              source);
      for (String base : controller.bases()) {
        for (String child : methodPaths) {
          addEndpoint(state, SpringMappings.join(base, child), endpoint, method, mapping);
        }
      }
    }
  }

  private void addEndpoint(
      AnalysisState state,
      String path,
      EndpointContext endpoint,
      MethodDeclaration method,
      AnnotationExpr mapping) {
    String label = endpoint.httpMethod() + " " + path;
    String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, label + ":" + endpoint.handlerId());
    Map<String, String> attributes = new TreeMap<>();
    attributes.put("httpMethod", endpoint.httpMethod());
    attributes.put("path", path);
    attributes.put("category", endpoint.category());
    addNode(
        state.nodes,
        new GraphNode(
            endpointId,
            NodeType.ENDPOINT,
            label,
            attributes,
            endpoint.source(),
            Confidence.CONFIRMED));
    edge(
        state.edges,
        EdgeType.HANDLED_BY,
        endpointId,
        endpoint.handlerId(),
        Confidence.CONFIRMED,
        endpoint.source());
    if (endpoint.rest())
      state.apiContracts.add(
          state.contracts.contract(endpointId, method, mapping, endpoint.source(), List.of()));
    if (!endpoint.rest())
      for (String view : endpoint.results())
        if (!view.startsWith("redirect:") && !view.startsWith("forward:"))
          edge(
              state.edges,
              EdgeType.RENDERS,
              endpoint.handlerId(),
              screen(view, state.nodes, endpoint.source()),
              Confidence.CONFIRMED,
              endpoint.source());
  }

  private static String screen(String view, List<GraphNode> nodes, SourceLocation source) {
    String id = ApplicationGraph.id(NodeType.SCREEN, view);
    addNode(
        nodes,
        new GraphNode(
            id, NodeType.SCREEN, view, Map.of("view", view), source, Confidence.CONFIRMED));
    return id;
  }

  private static void addNode(List<GraphNode> nodes, GraphNode node) {
    if (nodes.stream().noneMatch(existing -> existing.id().equals(node.id()))) {
      var attributes = new TreeMap<>(node.attributes());
      if (node.type() == NodeType.COMPONENT && !attributes.containsKey("kind"))
        attributes.put("kind", "LINK".equals(attributes.get("componentType")) ? "LINK" : "OTHER");
      var proof =
          node.evidence().stream()
              .map(
                  item ->
                      "LEGACY".equals(item.parser())
                          ? new ApplicationGraph.AnalysisEvidence(
                              item.source(), "SpringBootAnalyzer", item.resolution(), item.detail())
                          : item)
              .toList();
      nodes.add(
          new GraphNode(
              node.id(),
              node.type(),
              node.name(),
              attributes,
              node.source(),
              node.confidence(),
              proof));
    }
  }

  private static void edge(
      List<Relationship> edges,
      EdgeType type,
      String from,
      String to,
      Confidence confidence,
      SourceLocation source) {
    String id = ApplicationGraph.id(NodeType.COMPONENT, type + ":" + from + ":" + to);
    if (edges.stream().noneMatch(existing -> existing.id().equals(id))) {
      edges.add(
          new Relationship(
              id,
              type,
              from,
              to,
              confidence,
              source,
              List.of(
                  new ApplicationGraph.AnalysisEvidence(
                      source, "SpringBootAnalyzer", confidence.resolutionStatus(), null))));
    }
  }

  private static AnnotationExpr annotation(NodeWithAnnotations<?> node, String name) {
    return node.getAnnotations().stream()
        .filter(candidate -> candidate.getNameAsString().equals(name))
        .findFirst()
        .orElse(null);
  }

  private static String named(AnnotationExpr annotation, String name) {
    if (annotation instanceof NormalAnnotationExpr normal) {
      return normal.getPairs().stream()
          .filter(pair -> pair.getNameAsString().equals(name))
          .map(pair -> pair.getValue().toString())
          .findFirst()
          .orElse(null);
    }
    return null;
  }

  /**
   * Every string literal the method itself returns, in source order: each branch's view, not only
   * the first, and never a return inside a lambda or a nested class body (RV-213).
   */
  private static List<String> returnLiterals(MethodDeclaration method) {
    return method.findAll(com.github.javaparser.ast.stmt.ReturnStmt.class).stream()
        .filter(
            returnStatement ->
                returnStatement
                    .findAncestor(
                        n ->
                            n == method
                                || n instanceof com.github.javaparser.ast.expr.LambdaExpr
                                || n instanceof com.github.javaparser.ast.expr.ObjectCreationExpr
                                || n instanceof ClassOrInterfaceDeclaration,
                        com.github.javaparser.ast.Node.class)
                    .map(n -> n == method)
                    .orElse(false))
        .map(
            returnStatement ->
                returnStatement
                    .getExpression()
                    .filter(Expression::isStringLiteralExpr)
                    .map(expression -> expression.asStringLiteralExpr().asString())
                    .orElse(null))
        .filter(Objects::nonNull)
        .distinct()
        .toList();
  }

  private static final class AnalysisState {
    private final List<GraphNode> nodes = new ArrayList<>();
    private final List<Relationship> edges = new ArrayList<>();
    private final List<Diagnostic> diagnostics = new ArrayList<>();
    private final List<ApplicationGraph.ApiContract> apiContracts = new ArrayList<>();
    private final ApiContractExtractor contracts;

    private AnalysisState(Path root, List<Path> javaFiles) {
      contracts = new ApiContractExtractor(root, javaFiles);
    }
  }

  private record ControllerContext(
      String typeName,
      String relative,
      List<String> bases,
      ClassOrInterfaceDeclaration declaration) {}

  private record EndpointContext(
      String handlerId,
      String httpMethod,
      boolean rest,
      boolean redirect,
      List<String> results,
      SourceLocation source) {
    private String category() {
      if (rest) {
        return "REST_API";
      }
      return redirect ? "REDIRECT" : "MVC_SCREEN";
    }
  }
}
