package io.screentrace.parser.jsp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.EnumDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.AssignExpr;
import com.github.javaparser.ast.expr.ConditionalExpr;
import com.github.javaparser.ast.expr.Expression;
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

  /** A project enum: its constants in declaration order (ADR 0160). */
  record EnumType(String name, String qualified, List<String> constants) {}

  private final Map<String, List<EnumType>> enums = new TreeMap<>();

  /** A proven write of an enum value to a field (setter, builder or assignment), ADR 0160. */
  record StateChange(
      int depth,
      String in,
      String enumName,
      String field,
      String value,
      ResolutionStatus resolution,
      String reason,
      SourceLocation source,
      Prior prior) {}

  /**
   * What the value was before the write, read from the conditions around it (ADR 0169): only these
   * values, or none of those, or a new object built by a builder. Always INFERRED.
   */
  record Prior(List<String> only, List<String> not, boolean created, List<Integer> lines) {
    static final Prior NONE = new Prior(null, List.of(), false, List.of());

    boolean known() {
      return created || only != null || !not.isEmpty();
    }
  }

  private BackendCallChains() {}

  /** Adds a {@code backendCalls} attribute to every handler with at least one proven call. */
  public static ApplicationGraph enrich(ApplicationGraph graph, ProjectInventory inventory) {
    var chains = new BackendCallChains();
    chains.read(inventory);
    if (chains.byQualified.isEmpty()) return graph;
    List<GraphNode> nodes = new ArrayList<>();
    boolean changed = false;
    Map<String, List<Call>> callsOf = new TreeMap<>();
    Map<String, List<StateChange>> changesOf = new TreeMap<>();
    for (var node : graph.nodes())
      if (node.type() == NodeType.HANDLER) {
        List<StateChange> changes = new ArrayList<>();
        callsOf.put(node.id(), chains.trace(node, changes));
        changesOf.put(node.id(), changes);
      }
    var labels =
        changesOf.values().stream().anyMatch(list -> !list.isEmpty())
            ? StateLabels.read(inventory, chains.changedEnums(changesOf))
            : StateLabels.NONE;
    for (var node : graph.nodes()) {
      var calls = callsOf.getOrDefault(node.id(), List.of());
      var changes = changesOf.getOrDefault(node.id(), List.of());
      if (calls.isEmpty() && changes.isEmpty()) {
        nodes.add(node);
        continue;
      }
      changed = true;
      var attributes = new TreeMap<>(node.attributes());
      List<AnalysisEvidence> evidence = new ArrayList<>(node.evidence());
      if (!calls.isEmpty()) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (var call : calls) rows.add(call.json());
        attributes.put("backendCalls", json(rows));
        evidence.add(
            new AnalysisEvidence(
                calls.get(0).source(),
                "BackendCallChains",
                calls.stream().allMatch(c -> c.resolution() == ResolutionStatus.CONFIRMED)
                    ? ResolutionStatus.CONFIRMED
                    : ResolutionStatus.AMBIGUOUS,
                "後端呼叫 " + calls.size() + " 筆"));
      }
      if (!changes.isEmpty()) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (var change : changes) rows.add(chains.json(change, labels));
        attributes.put("stateChanges", json(rows));
        evidence.add(
            new AnalysisEvidence(
                changes.get(0).source(),
                "StateChanges",
                changes.stream().allMatch(c -> c.resolution() == ResolutionStatus.CONFIRMED)
                    ? ResolutionStatus.CONFIRMED
                    : ResolutionStatus.UNRESOLVED,
                "狀態寫入 " + changes.size() + " 筆"));
      }
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

  private static String json(Object value) {
    try {
      return JSON.writeValueAsString(value);
    } catch (JsonProcessingException error) {
      // Only strings, numbers and maps of them are written; failing is a bug.
      throw new IllegalStateException("Cannot serialize backend calls", error);
    }
  }

  /** Enums some handler writes, by simple name. */
  private Map<String, EnumType> changedEnums(Map<String, List<StateChange>> changes) {
    Map<String, EnumType> out = new TreeMap<>();
    for (var list : changes.values())
      for (var change : list) {
        var candidates = enums.getOrDefault(change.enumName(), List.of());
        if (candidates.size() == 1) out.put(change.enumName(), candidates.get(0));
      }
    return out;
  }

  private Map<String, Object> json(StateChange change, StateLabels labels) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("depth", change.depth());
    row.put("in", change.in());
    row.put("enum", change.enumName());
    var type = enums.getOrDefault(change.enumName(), List.of());
    if (type.size() == 1) row.put("values", type.get(0).constants());
    row.put("field", change.field());
    if (change.value() != null) row.put("value", change.value());
    if (change.value() != null) {
      var label = labels.label(change.enumName(), change.value());
      if (label != null) {
        row.put("label", label.text());
        row.put(
            "labelSource", Map.of("file", label.source().file(), "line", label.source().line()));
        // The frontend calls this value by several words: every one, with where it is written.
        if (label.words().size() > 1)
          row.put(
              "labelWords",
              label.words().stream()
                  .map(
                      w ->
                          Map.of(
                              "text",
                              w.text(),
                              "source",
                              Map.of("file", w.source().file(), "line", w.source().line())))
                  .toList());
      }
    }
    if (type.size() == 1) {
      Map<String, Object> words = new LinkedHashMap<>();
      for (String constant : type.get(0).constants()) {
        var label = labels.label(change.enumName(), constant);
        if (label != null) words.put(constant, label.text());
      }
      if (!words.isEmpty()) row.put("labels", words);
    }
    var prior = change.prior();
    if (prior != null && prior.known()) {
      if (prior.created()) row.put("fromCreated", true);
      if (prior.only() != null) row.put("from", prior.only());
      else if (!prior.not().isEmpty()) row.put("fromNot", prior.not());
      if (!prior.lines().isEmpty()) row.put("fromLines", prior.lines());
    }
    row.put("resolution", change.resolution().name());
    if (change.reason() != null) row.put("reason", change.reason());
    row.put("source", Map.of("file", change.source().file(), "line", change.source().line()));
    return row;
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
        for (var declaration : unit.findAll(EnumDeclaration.class)) {
          String qualified =
              declaration.getFullyQualifiedName().orElse(pkg + declaration.getNameAsString());
          enums
              .computeIfAbsent(declaration.getNameAsString(), k -> new ArrayList<>())
              .add(
                  new EnumType(
                      declaration.getNameAsString(),
                      qualified,
                      declaration.getEntries().stream().map(e -> e.getNameAsString()).toList()));
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

  private List<Call> trace(GraphNode handler, List<StateChange> changes) {
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
    Set<String> seen = new HashSet<>(), written = new HashSet<>();
    for (var start : starts)
      follow(type.get(), start, 1, calls, seen, new HashSet<>(), changes, written);
    return calls;
  }

  /** Calls made by {@code method} (and the private helpers it calls in its own class). */
  private void follow(
      Type owner,
      MethodDeclaration method,
      int depth,
      List<Call> calls,
      Set<String> seen,
      Set<MethodDeclaration> helpers,
      List<StateChange> changes,
      Set<String> written) {
    if (!helpers.add(method) || method.getBody().isEmpty()) return;
    String from = owner.name() + "#" + method.getNameAsString();
    stateChanges(owner, method, depth - 1, from, changes, written);
    for (var call : method.getBody().get().findAll(MethodCallExpr.class)) {
      if (calls.size() >= MAX_CALLS) return;
      // A call to the class's own method: its calls count as this method's.
      if (call.getScope().isEmpty() || call.getScope().get() instanceof ThisExpr) {
        for (var own : owner.declaration().getMethodsByName(call.getNameAsString()))
          if (own.getParameters().size() == call.getArguments().size())
            follow(owner, own, depth, calls, seen, helpers, changes, written);
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
        for (var callee : callees)
          follow(body, callee, depth + 1, calls, seen, new HashSet<>(), changes, written);
    }
  }

  /**
   * Enum values the method writes to a field: {@code x.setStatus(Status.DONE)}, a builder's {@code
   * .status(DONE)}, or {@code x.status = DONE}. A value held in a variable of an enum type is
   * recorded as UNRESOLVED; a conditional between two constants records both as INFERRED.
   */
  private void stateChanges(
      Type owner,
      MethodDeclaration method,
      int depth,
      String in,
      List<StateChange> changes,
      Set<String> written) {
    var unit = owner.declaration().findCompilationUnit().orElse(null);
    for (var node : method.getBody().get().findAll(Node.class)) {
      String field = null;
      Expression value = null;
      if (node instanceof MethodCallExpr call && call.getArguments().size() == 1) {
        String name = call.getNameAsString();
        if (name.length() > 3 && name.startsWith("set") && Character.isUpperCase(name.charAt(3)))
          field = Character.toLowerCase(name.charAt(3)) + name.substring(4);
        else if (builderChain(call)) field = name;
        value = call.getArgument(0);
      } else if (node instanceof AssignExpr assign
          && assign.getOperator() == AssignExpr.Operator.ASSIGN) {
        if (assign.getTarget() instanceof FieldAccessExpr target) field = target.getNameAsString();
        value = assign.getValue();
      }
      if (field == null || value == null) continue;
      int line = node.getBegin().map(p -> p.line).orElse(1);
      var source = new SourceLocation(owner.file(), line);
      List<String[]> found = new ArrayList<>();
      ResolutionStatus status = ResolutionStatus.CONFIRMED;
      String reason = null;
      if (value instanceof ConditionalExpr conditional) {
        var a = constant(conditional.getThenExpr(), unit);
        var b = constant(conditional.getElseExpr(), unit);
        if (a != null && b != null && a[0].equals(b[0])) {
          found.add(a);
          found.add(b);
          status = ResolutionStatus.INFERRED;
          reason = "依條件 " + conditional.getCondition() + " 二選一";
        }
      } else {
        var c = constant(value, unit);
        if (c != null) found.add(c);
        else if (value instanceof NameExpr variable) {
          String type = variableType(method, variable.getNameAsString());
          if (type != null && enums.getOrDefault(type, List.of()).size() == 1) {
            found.add(new String[] {type, null});
            status = ResolutionStatus.UNRESOLVED;
            reason = "值由變數 " + variable.getNameAsString() + " 決定";
          }
        }
      }
      Prior prior = Prior.NONE;
      if (!found.isEmpty()) {
        var type = enums.getOrDefault(found.get(0)[0], List.of());
        if (node instanceof MethodCallExpr call && builderChain(call))
          prior = new Prior(null, List.of(), true, List.of());
        else if (type.size() == 1) {
          Expression target =
              node instanceof MethodCallExpr call
                  ? call.getScope().orElse(null)
                  : ((FieldAccessExpr) ((AssignExpr) node).getTarget()).getScope();
          if (target != null)
            prior = prior(node, method, target.toString(), field, type.get(0), unit);
        }
      }
      for (var item : found)
        if (written.add(in + "\u0000" + field + "\u0000" + item[1] + "\u0000" + line))
          changes.add(
              new StateChange(depth, in, item[0], field, item[1], status, reason, source, prior));
    }
  }

  /**
   * The values the field can hold where the write runs, from status comparisons on the same object
   * (ADR 0169): an enclosing {@code if}'s branch, an earlier {@code if (...) throw/return} guard in
   * an enclosing block, or a {@code switch} on the status. Conditions on anything else are ignored.
   */
  private Prior prior(
      Node write,
      MethodDeclaration method,
      String scope,
      String field,
      EnumType type,
      CompilationUnit unit) {
    Set<String> only = null, not = new java.util.TreeSet<>();
    java.util.TreeSet<Integer> lines = new java.util.TreeSet<>();
    Node current = write;
    while (current != null && current != method) {
      Node parent = current.getParentNode().orElse(null);
      if (parent == null || parent instanceof com.github.javaparser.ast.expr.LambdaExpr) break;
      if (parent instanceof com.github.javaparser.ast.stmt.IfStmt branch
          && branch.getCondition() != current) {
        var test = comparison(branch.getCondition(), method, scope, field, type, unit);
        if (test != null) {
          boolean positive = branch.getThenStmt() == current ? test.equal() : !test.equal();
          if (positive) only = intersect(only, test.values());
          else not.addAll(test.values());
          lines.add(branch.getBegin().map(p -> p.line).orElse(1));
        }
      }
      if (parent instanceof com.github.javaparser.ast.stmt.SwitchEntry entry
          && entry.getParentNode().orElse(null)
              instanceof com.github.javaparser.ast.stmt.SwitchStmt sw
          && read(sw.getSelector(), method, scope, field)
          && !entry.getLabels().isEmpty()) {
        Set<String> labels = new java.util.TreeSet<>();
        for (var label : entry.getLabels()) {
          String constant =
              label instanceof NameExpr n
                  ? n.getNameAsString()
                  : label instanceof FieldAccessExpr f ? f.getNameAsString() : null;
          if (constant != null && type.constants().contains(constant)) labels.add(constant);
        }
        if (!labels.isEmpty()) {
          only = intersect(only, labels);
          lines.add(sw.getBegin().map(p -> p.line).orElse(1));
        }
      }
      if (parent instanceof com.github.javaparser.ast.stmt.BlockStmt block)
        for (var statement : block.getStatements()) {
          if (statement == current) break;
          if (statement instanceof com.github.javaparser.ast.stmt.IfStmt guard
              && guard.getElseStmt().isEmpty()
              && exits(guard.getThenStmt())) {
            var test = comparison(guard.getCondition(), method, scope, field, type, unit);
            if (test == null) continue;
            // Past `if (status == X) throw`, the status is not X; past `!=`, it is X.
            if (test.equal()) not.addAll(test.values());
            else only = intersect(only, test.values());
            lines.add(guard.getBegin().map(p -> p.line).orElse(1));
          }
        }
      current = parent;
    }
    if (only != null) only.removeAll(not);
    List<String> ordered =
        only == null ? null : type.constants().stream().filter(only::contains).toList();
    List<String> excluded =
        only != null ? List.of() : type.constants().stream().filter(not::contains).toList();
    if (ordered == null && excluded.isEmpty()) return Prior.NONE;
    return new Prior(ordered, excluded, false, List.copyOf(lines));
  }

  private record Test(Set<String> values, boolean equal) {}

  private static Set<String> intersect(Set<String> current, Set<String> values) {
    if (current == null) return new java.util.TreeSet<>(values);
    current.retainAll(values);
    return current;
  }

  /** A block that always leaves: a throw or return, alone or as its last statement. */
  private static boolean exits(com.github.javaparser.ast.stmt.Statement statement) {
    if (statement instanceof com.github.javaparser.ast.stmt.BlockStmt block)
      return !block.getStatements().isEmpty() && exits(block.getStatements().getLast().get());
    return statement instanceof com.github.javaparser.ast.stmt.ThrowStmt
        || statement instanceof com.github.javaparser.ast.stmt.ReturnStmt;
  }

  /**
   * {@code status == X}, {@code status != X}, {@code status.equals(X)}, and `||` / `&&` of them.
   */
  private Test comparison(
      Expression test,
      MethodDeclaration method,
      String scope,
      String field,
      EnumType type,
      CompilationUnit unit) {
    if (test instanceof com.github.javaparser.ast.expr.EnclosedExpr enclosed)
      return comparison(enclosed.getInner(), method, scope, field, type, unit);
    if (test instanceof com.github.javaparser.ast.expr.UnaryExpr unary
        && unary.getOperator()
            == com.github.javaparser.ast.expr.UnaryExpr.Operator.LOGICAL_COMPLEMENT) {
      var inner = comparison(unary.getExpression(), method, scope, field, type, unit);
      return inner == null ? null : new Test(inner.values(), !inner.equal());
    }
    if (test instanceof com.github.javaparser.ast.expr.BinaryExpr binary) {
      var op = binary.getOperator();
      if (op == com.github.javaparser.ast.expr.BinaryExpr.Operator.EQUALS
          || op == com.github.javaparser.ast.expr.BinaryExpr.Operator.NOT_EQUALS) {
        Expression other =
            read(binary.getLeft(), method, scope, field)
                ? binary.getRight()
                : read(binary.getRight(), method, scope, field) ? binary.getLeft() : null;
        var c = other == null ? null : constant(other, unit);
        if (c == null || !c[0].equals(type.name())) return null;
        return new Test(
            Set.of(c[1]), op == com.github.javaparser.ast.expr.BinaryExpr.Operator.EQUALS);
      }
      boolean or = op == com.github.javaparser.ast.expr.BinaryExpr.Operator.OR,
          and = op == com.github.javaparser.ast.expr.BinaryExpr.Operator.AND;
      if (or || and) {
        var a = comparison(binary.getLeft(), method, scope, field, type, unit);
        var b = comparison(binary.getRight(), method, scope, field, type, unit);
        // a == X || a == Y is "one of"; a != X && a != Y is "none of"; mixed shapes say nothing.
        if (a == null || b == null || a.equal() != b.equal() || a.equal() != or) return null;
        Set<String> values = new java.util.TreeSet<>(a.values());
        values.addAll(b.values());
        return new Test(values, a.equal());
      }
    }
    if (test instanceof MethodCallExpr call
        && call.getNameAsString().equals("equals")
        && call.getArguments().size() == 1
        && call.getScope().isPresent()) {
      Expression other =
          read(call.getScope().get(), method, scope, field)
              ? call.getArgument(0)
              : read(call.getArgument(0), method, scope, field) ? call.getScope().get() : null;
      var c = other == null ? null : constant(other, unit);
      if (c == null || !c[0].equals(type.name())) return null;
      return new Test(Set.of(c[1]), true);
    }
    return null;
  }

  /** {@code x.getStatus()}, {@code x.status}, or a local assigned once from one of them. */
  private static boolean read(
      Expression expression, MethodDeclaration method, String scope, String field) {
    String getter = "get" + Character.toUpperCase(field.charAt(0)) + field.substring(1);
    if (expression instanceof MethodCallExpr call)
      return call.getArguments().isEmpty()
          && call.getNameAsString().equals(getter)
          && call.getScope().map(s -> s.toString().equals(scope)).orElse(false);
    if (expression instanceof FieldAccessExpr access)
      return access.getNameAsString().equals(field) && access.getScope().toString().equals(scope);
    if (expression instanceof NameExpr name) {
      var declarations =
          method.findAll(VariableDeclarator.class).stream()
              .filter(v -> v.getNameAsString().equals(name.getNameAsString()))
              .toList();
      boolean reassigned =
          method.findAll(AssignExpr.class).stream()
              .anyMatch(
                  a ->
                      a.getTarget() instanceof NameExpr t
                          && t.getNameAsString().equals(name.getNameAsString()));
      return declarations.size() == 1
          && !reassigned
          && declarations
              .get(0)
              .getInitializer()
              .map(i -> read(i, method, scope, field))
              .orElse(false);
    }
    return false;
  }

  /** {@code Type.builder()...name(x)}: the call is part of a builder chain. */
  private static boolean builderChain(MethodCallExpr call) {
    var scope = call.getScope().orElse(null);
    while (scope instanceof MethodCallExpr inner) {
      if (inner.getNameAsString().equals("builder") || inner.getNameAsString().equals("toBuilder"))
        return true;
      scope = inner.getScope().orElse(null);
    }
    return false;
  }

  /** {@code Status.DONE} or a statically imported {@code DONE}: [enum, constant], else null. */
  private String[] constant(Expression expression, CompilationUnit unit) {
    if (expression instanceof FieldAccessExpr access) {
      String type = access.getScope().toString();
      type = type.substring(type.lastIndexOf('.') + 1);
      var candidates = enums.getOrDefault(type, List.of());
      if (candidates.size() == 1
          && candidates.get(0).constants().contains(access.getNameAsString()))
        return new String[] {type, access.getNameAsString()};
      return null;
    }
    if (!(expression instanceof NameExpr name) || unit == null) return null;
    String constant = name.getNameAsString();
    for (var imported : unit.getImports()) {
      if (!imported.isStatic()) continue;
      String target = imported.getNameAsString();
      String type =
          imported.isAsterisk()
              ? target.substring(target.lastIndexOf('.') + 1)
              : target.endsWith("." + constant)
                  ? target.substring(0, target.length() - constant.length() - 1)
                  : null;
      if (type == null) continue;
      type = type.substring(type.lastIndexOf('.') + 1);
      var candidates = enums.getOrDefault(type, List.of());
      if (candidates.size() == 1 && candidates.get(0).constants().contains(constant))
        return new String[] {type, constant};
    }
    return null;
  }

  /** The declared simple type of a parameter or local variable of the method, else null. */
  private static String variableType(MethodDeclaration method, String name) {
    for (var parameter : method.getParameters())
      if (parameter.getNameAsString().equals(name)
          && parameter.getType() instanceof ClassOrInterfaceType type)
        return type.getNameAsString();
    for (var variable : method.findAll(VariableDeclarator.class))
      if (variable.getNameAsString().equals(name)
          && variable.getType() instanceof ClassOrInterfaceType type) return type.getNameAsString();
    return null;
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
