package io.screentrace.parser.jsp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.FieldAccessExpr;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.NameExpr;
import com.github.javaparser.ast.expr.ThisExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.AnalysisEvidence;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.ResolutionStatus;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

/**
 * Backend calls from each handler into the project's own classes (service, DAO), as far as the
 * source proves them (ADR 0156). Only calls through a field whose declared type is a project class
 * or interface are followed; an interface with several project implementations is AMBIGUOUS and is
 * not followed further. Framework-neutral: it reads plain Java and needs only the handler's class
 * and method attributes. Nothing is executed.
 */
public final class BackendCallChains {
  /** Calls deeper than this from the handler are not followed (the md says so). */
  public static final int MAX_DEPTH = 4;

  /** A handler with more calls than this keeps the first ones, in source order. */
  static final int MAX_CALLS = 200;

  private static final ObjectMapper JSON = new ObjectMapper();

  private record Type(ClassOrInterfaceDeclaration declaration, String file, String qualified) {
    String name() {
      return declaration.getNameAsString();
    }
  }

  private final Map<String, List<Type>> bySimple = new TreeMap<>();
  private final Map<String, Type> byQualified = new TreeMap<>();

  private BackendCallChains() {}

  /** Adds a {@code backendCalls} attribute to every handler with at least one proven call. */
  public static ApplicationGraph enrich(ApplicationGraph graph, ProjectInventory inventory) {
    var chains = new BackendCallChains();
    chains.read(inventory);
    if (chains.byQualified.isEmpty()) return graph;
    List<GraphNode> nodes = new ArrayList<>();
    boolean changed = false;
    for (var node : graph.nodes()) {
      var calls = node.type() == NodeType.HANDLER ? chains.trace(node) : List.<Call>of();
      if (calls.isEmpty()) {
        nodes.add(node);
        continue;
      }
      changed = true;
      var attributes = new TreeMap<>(node.attributes());
      List<Map<String, Object>> rows = new ArrayList<>();
      for (var call : calls) rows.add(call.json());
      try {
        attributes.put("backendCalls", JSON.writeValueAsString(rows));
      } catch (JsonProcessingException error) {
        // Only strings, numbers and maps of them are written; failing is a bug.
        throw new IllegalStateException("Cannot serialize backend calls", error);
      }
      List<AnalysisEvidence> evidence = new ArrayList<>(node.evidence());
      evidence.add(
          new AnalysisEvidence(
              calls.get(0).source(),
              "BackendCallChains",
              calls.stream().allMatch(c -> c.resolution() == ResolutionStatus.CONFIRMED)
                  ? ResolutionStatus.CONFIRMED
                  : ResolutionStatus.AMBIGUOUS,
              "後端呼叫 " + calls.size() + " 筆"));
      nodes.add(
          new GraphNode(
              node.id(),
              node.type(),
              node.name(),
              attributes,
              node.source(),
              node.confidence(),
              evidence,
              node.audience()));
    }
    if (!changed) return graph;
    return new ApplicationGraph(
        graph.application(),
        nodes,
        graph.relationships(),
        graph.diagnostics(),
        graph.apiContracts(),
        graph.schemaVersion(),
        graph.behaviors(),
        graph.validationRules());
  }

  private void read(ProjectInventory inventory) {
    for (Path file : inventory.javaFiles())
      try {
        CompilationUnit unit =
            JavaSources.parse(
                SafeProjectFiles.readUtf8Limited(
                    inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES));
        String path = inventory.root().relativize(file).toString().replace('\\', '/');
        String pkg = unit.getPackageDeclaration().map(p -> p.getNameAsString() + ".").orElse("");
        for (var declaration : unit.findAll(ClassOrInterfaceDeclaration.class)) {
          if (declaration.isLocalClassDeclaration()) continue;
          String qualified =
              declaration.getFullyQualifiedName().orElse(pkg + declaration.getNameAsString());
          var type = new Type(declaration, path, qualified);
          bySimple.computeIfAbsent(declaration.getNameAsString(), k -> new ArrayList<>()).add(type);
          byQualified.put(qualified, type);
        }
      } catch (Exception ignored) {
        // A file that cannot be read or parsed proves no call; the other analyzers report it.
      }
  }

  record Call(
      int depth,
      String from,
      String to,
      String layer,
      String layerBasis,
      ResolutionStatus resolution,
      String reason,
      SourceLocation source) {
    Map<String, Object> json() {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("depth", depth);
      row.put("from", from);
      row.put("to", to);
      row.put("layer", layer);
      if (layerBasis != null) row.put("layerBasis", layerBasis);
      row.put("resolution", resolution.name());
      if (reason != null) row.put("reason", reason);
      Map<String, Object> where = new LinkedHashMap<>();
      where.put("file", source.file());
      where.put("line", source.line());
      row.put("source", where);
      return row;
    }
  }

  /** The handler's class, by qualified name, or by simple name in the handler's own file. */
  private Optional<Type> handlerType(GraphNode handler) {
    String name =
        handler
            .attributes()
            .getOrDefault("class", handler.attributes().getOrDefault("actionType", ""));
    if (name.isBlank()) return Optional.empty();
    if (byQualified.containsKey(name)) return Optional.of(byQualified.get(name));
    var candidates = bySimple.getOrDefault(name.substring(name.lastIndexOf('.') + 1), List.of());
    if (candidates.size() == 1) return Optional.of(candidates.get(0));
    String file = handler.source() == null ? "" : handler.source().file();
    var inFile = candidates.stream().filter(t -> t.file().equals(file)).toList();
    return inFile.size() == 1 ? Optional.of(inFile.get(0)) : Optional.empty();
  }

  private List<Call> trace(GraphNode handler) {
    var type = handlerType(handler);
    if (type.isEmpty()) return List.of();
    String method =
        handler.attributes().containsKey("class")
            ? handler.attributes().getOrDefault("method", "")
            : handler.attributes().getOrDefault("method", "execute");
    if (method.isBlank()) return List.of();
    var starts = type.get().declaration().getMethodsByName(method);
    // Overloads in a handler: the one the handler points at, when its line says so.
    if (starts.size() > 1 && handler.source() != null) {
      var at =
          starts.stream()
              .filter(m -> m.getBegin().map(p -> p.line == handler.source().line()).orElse(false))
              .toList();
      if (at.size() == 1) starts = at;
    }
    List<Call> calls = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    for (var start : starts) follow(type.get(), start, 1, calls, seen, new HashSet<>());
    return calls;
  }

  /** Calls made by {@code method} (and the private helpers it calls in its own class). */
  private void follow(
      Type owner,
      MethodDeclaration method,
      int depth,
      List<Call> calls,
      Set<String> seen,
      Set<MethodDeclaration> helpers) {
    if (!helpers.add(method) || method.getBody().isEmpty()) return;
    String from = owner.name() + "#" + method.getNameAsString();
    for (var call : method.getBody().get().findAll(MethodCallExpr.class)) {
      if (calls.size() >= MAX_CALLS) return;
      // A call to the class's own method: its calls count as this method's.
      if (call.getScope().isEmpty() || call.getScope().get() instanceof ThisExpr) {
        for (var own : owner.declaration().getMethodsByName(call.getNameAsString()))
          if (own.getParameters().size() == call.getArguments().size())
            follow(owner, own, depth, calls, seen, helpers);
        continue;
      }
      var field = fieldName(call);
      if (field == null) continue;
      var declared = fieldType(owner, field);
      if (declared == null) continue;
      var targets = bySimple.getOrDefault(declared, List.of());
      if (targets.isEmpty()) continue; // a library type: not part of the project's backend
      var line = call.getBegin().map(p -> p.line).orElse(1);
      var source = new SourceLocation(owner.file(), line);
      if (targets.size() > 1) {
        add(
            calls,
            seen,
            new Call(
                depth,
                from,
                declared + "#" + call.getNameAsString(),
                "CLASS",
                null,
                ResolutionStatus.AMBIGUOUS,
                "專案中有 " + targets.size() + " 個同名類別",
                source));
        continue;
      }
      Type target = targets.get(0);
      String to = target.name() + "#" + call.getNameAsString();
      List<Type> implementations =
          target.declaration().isInterface() ? implementations(target) : List.of(target);
      String[] layer = layer(target, implementations);
      if (target.declaration().isInterface() && implementations.size() > 1) {
        add(
            calls,
            seen,
            new Call(
                depth,
                from,
                to,
                layer[0],
                layer[1],
                ResolutionStatus.AMBIGUOUS,
                implementations.size() + " 個實作",
                source));
        continue;
      }
      if (implementations.isEmpty()) {
        // An interface the framework implements (a Spring Data repository, a MyBatis mapper): the
        // call
        // is proven, there is no project code behind it to follow.
        add(
            calls,
            seen,
            new Call(
                depth, from, to, layer[0], layer[1], ResolutionStatus.CONFIRMED, null, source));
        continue;
      }
      Type body = implementations.get(0);
      var callees =
          body.declaration().getMethodsByName(call.getNameAsString()).stream()
              .filter(m -> m.getParameters().size() == call.getArguments().size())
              .toList();
      if (callees.isEmpty()) {
        add(
            calls,
            seen,
            new Call(
                depth,
                from,
                to,
                layer[0],
                layer[1],
                ResolutionStatus.UNRESOLVED,
                "找不到方法宣告(可能繼承自函式庫)",
                source));
        continue;
      }
      boolean deeper = depth >= MAX_DEPTH && callees.stream().anyMatch(m -> callsProject(body, m));
      add(
          calls,
          seen,
          new Call(
              depth,
              from,
              to,
              layer[0],
              layer[1],
              ResolutionStatus.CONFIRMED,
              deeper ? "已達深度上限,之後的呼叫未追蹤" : null,
              source));
      if (depth < MAX_DEPTH)
        for (var callee : callees) follow(body, callee, depth + 1, calls, seen, new HashSet<>());
    }
  }

  private static void add(List<Call> calls, Set<String> seen, Call call) {
    if (seen.add(call.depth() + "\u0000" + call.from() + "\u0000" + call.to())) calls.add(call);
  }

  /** {@code service.find()} or {@code this.service.find()}: the field name, otherwise null. */
  private static String fieldName(MethodCallExpr call) {
    var scope = call.getScope().get();
    if (scope instanceof NameExpr name) return name.getNameAsString();
    if (scope instanceof FieldAccessExpr access && access.getScope() instanceof ThisExpr)
      return access.getNameAsString();
    return null;
  }

  /** The simple type name of a field declared in the class (not a local variable or parameter). */
  private static String fieldType(Type owner, String field) {
    for (FieldDeclaration declaration : owner.declaration().getFields())
      for (var variable : declaration.getVariables())
        if (variable.getNameAsString().equals(field)
            && variable.getType() instanceof ClassOrInterfaceType type)
          return type.getNameAsString();
    return null;
  }

  private boolean callsProject(Type owner, MethodDeclaration method) {
    if (method.getBody().isEmpty()) return false;
    for (var call : method.getBody().get().findAll(MethodCallExpr.class)) {
      if (call.getScope().isEmpty()) continue;
      var field = fieldName(call);
      var declared = field == null ? null : fieldType(owner, field);
      if (declared != null && bySimple.containsKey(declared)) return true;
    }
    return false;
  }

  /** Project classes that implement the interface (directly). */
  private List<Type> implementations(Type type) {
    List<Type> result = new ArrayList<>();
    for (var list : bySimple.values())
      for (var candidate : list)
        if (!candidate.declaration().isInterface()
            && candidate.declaration().getImplementedTypes().stream()
                .anyMatch(t -> t.getNameAsString().equals(type.name()))) result.add(candidate);
    result.sort((a, b) -> a.qualified().compareTo(b.qualified()));
    return result;
  }

  /** The layer and what says so: an annotation, an extended framework interface, or the name. */
  private static String[] layer(Type type, List<Type> implementations) {
    List<Type> all = new ArrayList<>(List.of(type));
    all.addAll(implementations);
    for (var t : all) {
      if (annotated(t.declaration(), "Service")) return new String[] {"SERVICE", "@Service"};
      if (annotated(t.declaration(), "Repository")) return new String[] {"DAO", "@Repository"};
      if (annotated(t.declaration(), "Mapper")) return new String[] {"DAO", "@Mapper"};
    }
    if (type.declaration().getExtendedTypes().stream()
        .anyMatch(t -> t.getNameAsString().endsWith("Repository")))
      return new String[] {"DAO", "extends Repository"};
    String name = type.name();
    if (name.endsWith("Service") || name.endsWith("ServiceImpl"))
      return new String[] {"SERVICE", "名稱"};
    if (name.matches(".*(Dao|DAO|Repository|Mapper)(Impl)?$")) return new String[] {"DAO", "名稱"};
    return new String[] {"CLASS", null};
  }

  private static boolean annotated(Node declaration, String name) {
    return declaration instanceof ClassOrInterfaceDeclaration c
        && c.getAnnotations().stream().anyMatch(a -> a.getName().getIdentifier().equals(name));
  }
}
