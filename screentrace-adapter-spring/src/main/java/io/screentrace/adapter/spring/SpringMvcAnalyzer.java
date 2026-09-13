package io.screentrace.adapter.spring;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.body.VariableDeclarator;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Diagnostic;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.parser.jsp.JspAnalysis;
import io.screentrace.parser.jsp.JspProjectParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Static analysis for annotation-based, server-rendered Spring MVC applications. */
public final class SpringMvcAnalyzer {
    private static final Set<String> MAPPINGS = Set.of("RequestMapping", "GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping");
    private static final Set<String> PATH_NAMES = Set.of("value", "path");

    public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
        State state = new State(inventory.root());
        JspAnalysis jsp = new JspProjectParser().analyze(inventory.root(), inventory.files());
        for (JspAnalysis.View view : jsp.views()) if (view.kind() == JspAnalysis.ViewKind.JSP) addJspScreen(inventory.root().resolve(view.path()), state);
        addJspFragments(jsp, state);
        addTilesDefinitions(jsp, state);
        discoverExceptionView(inventory, state);
        for (Path java : inventory.javaFiles()) parseController(java, state);
        addJspInteractions(jsp, state);
        addJspIncludes(jsp, state);
        state.diagnostics.addAll(jsp.diagnostics());
        return new ApplicationGraph(new ApplicationGraph.Application(inventory.root().getFileName().toString(), inventory.root().toString(), inventory.technologies()),
                state.nodes, state.edges, state.diagnostics);
    }

    private static void discoverExceptionView(ProjectInventory inventory, State state) {
        for (Path file : inventory.files()) {
            if (!file.toString().endsWith(".xml")) continue;
            try {
                String xml = Files.readString(file);
                if (!xml.contains("SimpleMappingExceptionResolver")) continue;
                Matcher value = Pattern.compile("<property\\s+name=[\\\"']defaultErrorView[\\\"']\\s+value=[\\\"']([^\\\"']+)").matcher(xml);
                if (value.find()) state.defaultExceptionView = value.group(1);
            } catch (IOException ignored) {
                // A missing optional MVC configuration is represented by the normal unresolved diagnostic path.
            }
        }
    }

    private static void addJspScreen(Path file, State state) {
        String relative = state.root.relativize(file).toString();
        SourceLocation source = new SourceLocation(relative, 1);
        String id = ApplicationGraph.id(NodeType.SCREEN, relative);
        Map<String, String> attributes = new TreeMap<>();
        attributes.put("view", relative);
        attributes.put("staticPreview", jspPreview(file));
        addNode(state, new GraphNode(id, NodeType.SCREEN, file.getFileName().toString().replaceFirst("\\.jsp$", ""),
                attributes, source, Confidence.CONFIRMED));
        state.screensByView.put(relative, id);
        state.screensByView.put("/" + relative, id);
        for (String prefix : List.of("src/main/webapp/WEB-INF/jsp/", "src/main/webapp/WEB-INF/views/", "WEB-INF/jsp/", "WEB-INF/views/")) {
            if (relative.startsWith(prefix)) state.screensByView.put(relative.substring(prefix.length()).replaceFirst("\\.jsp$", ""), id);
        }
    }

    private static String jspPreview(Path file) {
        try {
            String source = Files.readString(file);
            List<String> items = new ArrayList<>();
            Matcher fields = Pattern.compile("<(?:form:)?(?:input|password|textarea|select)\\b[^>]*(?:path|name)=[\\\"']([^\\\"']+)", Pattern.CASE_INSENSITIVE).matcher(source);
            while (fields.find() && items.size() < 8) items.add("FIELD:" + fields.group(1));
            Matcher buttons = Pattern.compile("<(?:button|input)\\b[^>]*(?:value=[\\\"']([^\\\"']+)|type=[\\\"']submit[\\\"'])[^>]*>([^<]*)", Pattern.CASE_INSENSITIVE).matcher(source);
            while (buttons.find() && items.size() < 12) items.add("ACTION:" + (buttons.group(1) == null ? buttons.group(2).strip() : buttons.group(1)));
            return String.join("|", items);
        } catch (IOException ignored) {
            return "";
        }
    }

    private static void parseController(Path file, State state) {
        String relative = state.root.relativize(file).toString();
        try {
            for (ClassOrInterfaceDeclaration type : StaticJavaParser.parse(file).findAll(ClassOrInterfaceDeclaration.class)) {
                AnnotationExpr controller = annotation(type, "Controller");
                if (controller == null || annotation(type, "RestController") != null) continue;
                List<String> bases = paths(annotation(type, "RequestMapping"));
                if (bases.isEmpty()) bases = List.of("");
                Map<String, String> constants = viewConstants(type);
                for (MethodDeclaration method : type.getMethods()) {
                    AnnotationExpr mapping = method.getAnnotations().stream().filter(a -> MAPPINGS.contains(a.getNameAsString())).findFirst().orElse(null);
                    if (mapping != null) addMapping(type, method, mapping, relative, bases, constants, state);
                }
            }
        } catch (IOException | RuntimeException exception) {
            state.diagnostics.add(new Diagnostic("Unable to parse Java source: " + exception.getMessage(), Confidence.UNRESOLVED, new SourceLocation(relative, 1)));
        }
    }

    private static void addMapping(ClassOrInterfaceDeclaration type, MethodDeclaration method, AnnotationExpr mapping, String relative, List<String> bases, Map<String, String> constants, State state) {
        SourceLocation source = new SourceLocation(relative, method.getBegin().map(p -> p.line).orElse(1));
        String handlerName = type.getNameAsString() + "." + method.getNameAsString() + "()";
        String handlerId = ApplicationGraph.id(NodeType.HANDLER, relative + ":" + handlerName + ":" + source.line());
        addNode(state, new GraphNode(handlerId, NodeType.HANDLER, handlerName, Map.of("class", type.getNameAsString(), "method", method.getNameAsString()), source, Confidence.CONFIRMED));
        List<String> children = paths(mapping);
        if (children.isEmpty()) children = List.of("");
        List<String> views = returnedViews(method, constants);
        for (String base : bases) for (String child : children) {
            String path = join(base, child);
            String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, httpMethod(mapping) + " " + path + ":" + handlerId);
            addNode(state, new GraphNode(endpointId, NodeType.ENDPOINT, httpMethod(mapping) + " " + path,
                    Map.of("httpMethod", httpMethod(mapping), "path", path, "category", !views.isEmpty() && views.stream().allMatch(view -> view.startsWith("redirect:")) ? "REDIRECT" : "MVC_SCREEN"), source, Confidence.CONFIRMED));
            state.endpointByPath.putIfAbsent(path, endpointId);
            edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, Confidence.CONFIRMED, source);
            for (String view : views.stream().filter(view -> !view.startsWith("redirect:")).distinct().toList()) edge(state, EdgeType.RENDERS, handlerId, screenForView(view, source, state), state.screensByView.containsKey(view) ? Confidence.CONFIRMED : Confidence.INFERRED, source);
            if (views.isEmpty() && state.defaultExceptionView != null) edge(state, EdgeType.RENDERS, handlerId, screenForView(state.defaultExceptionView, source, state), Confidence.INFERRED, source);
            if (views.isEmpty()) state.diagnostics.add(new Diagnostic("Handler return view cannot be resolved statically: " + handlerName, Confidence.UNRESOLVED, source));
        }
    }

    private static String screenForView(String view, SourceLocation source, State state) {
        String known = state.screensByView.get(view);
        if (known != null) return known;
        String id = ApplicationGraph.id(NodeType.SCREEN, view);
        addNode(state, new GraphNode(id, NodeType.SCREEN, view, Map.of("view", view), source, Confidence.INFERRED));
        state.diagnostics.add(new Diagnostic("No JSP source found for view: " + view, Confidence.UNRESOLVED, source));
        return id;
    }

    private static void addJspFragments(JspAnalysis jsp, State state) {
        for (JspAnalysis.View view : jsp.views()) {
            if (view.kind() != JspAnalysis.ViewKind.JSPF) continue;
            String id = ApplicationGraph.id(NodeType.TEMPLATE_FRAGMENT, view.path());
            addNode(state, new GraphNode(id, NodeType.TEMPLATE_FRAGMENT, Path.of(view.path()).getFileName().toString(),
                    Map.of("view", view.path()), view.source(), Confidence.CONFIRMED));
            state.fragmentsByPath.put(view.path(), id);
            webPath(view.path()).ifPresent(path -> state.fragmentsByPath.put(path, id));
        }
    }

    private static void addTilesDefinitions(JspAnalysis jsp, State state) {
        for (JspAnalysis.TilesDefinition definition : jsp.tilesDefinitions()) {
            String id = ApplicationGraph.id(NodeType.VIEW, "tiles:" + definition.name());
            addNode(state, new GraphNode(id, NodeType.VIEW, definition.name(),
                    Map.of("tilesDefinition", "true", "template", definition.template()), definition.source(), Confidence.CONFIRMED));
        }
    }

    private static void addJspInteractions(JspAnalysis jsp, State state) {
        for (JspAnalysis.Interaction interaction : jsp.interactions()) {
            String screenId = state.screensByView.get(interaction.viewPath());
            if (screenId == null) continue;
            String id = ApplicationGraph.id(NodeType.COMPONENT, interaction.viewPath() + ":" + interaction.source().line() + ":" + interaction.target());
            Map<String, String> attributes = new TreeMap<>();
            attributes.put("componentType", interaction.type().name());
            attributes.put("target", interaction.target());
            if (interaction.httpMethod() != null) attributes.put("httpMethod", interaction.httpMethod());
            addNode(state, new GraphNode(id, NodeType.COMPONENT, interaction.label(), attributes, interaction.source(), interaction.confidence()));
            edge(state, EdgeType.CONTAINS, screenId, id, Confidence.CONFIRMED, interaction.source());
            if (interaction.confidence() == Confidence.UNRESOLVED) continue;
            String endpoint = state.endpointByPath.get(interaction.target());
            if (endpoint != null) edge(state, EdgeType.TRIGGERS, id, endpoint, Confidence.CONFIRMED, interaction.source());
            String next = state.screensByView.get(interaction.target());
            if (next != null) edge(state, EdgeType.NAVIGATES_TO, id, next, Confidence.CONFIRMED, interaction.source());
        }
    }

    private static void addJspIncludes(JspAnalysis jsp, State state) {
        for (JspAnalysis.Include include : jsp.includes()) {
            String screenId = state.screensByView.get(include.sourceViewPath());
            String fragmentId = state.fragmentsByPath.get(include.targetPath());
            if (screenId != null && fragmentId != null) edge(state, EdgeType.INCLUDES, screenId, fragmentId, include.confidence(), include.source());
        }
    }

    private static java.util.Optional<String> webPath(String path) {
        int marker = path.indexOf("/WEB-INF/");
        return marker < 0 ? java.util.Optional.empty() : java.util.Optional.of(path.substring(marker));
    }
    private static AnnotationExpr annotation(ClassOrInterfaceDeclaration type, String name) { return type.getAnnotations().stream().filter(a -> a.getNameAsString().equals(name)).findFirst().orElse(null); }
    private static List<String> paths(AnnotationExpr annotation) {
        if (annotation == null) return List.of();
        List<String> values = new ArrayList<>();
        if (annotation instanceof SingleMemberAnnotationExpr single) literals(single.getMemberValue(), values);
        if (annotation instanceof NormalAnnotationExpr normal) normal.getPairs().stream().filter(p -> PATH_NAMES.contains(p.getNameAsString())).forEach(p -> literals(p.getValue(), values));
        return values;
    }
    private static void literals(Expression value, List<String> values) { if (value.isStringLiteralExpr()) values.add(value.asStringLiteralExpr().asString()); else if (value.isArrayInitializerExpr()) value.asArrayInitializerExpr().getValues().forEach(v -> literals(v, values)); }
    private static String httpMethod(AnnotationExpr mapping) {
        if (!mapping.getNameAsString().equals("RequestMapping")) return Map.of("GetMapping", "GET", "PostMapping", "POST", "PutMapping", "PUT", "DeleteMapping", "DELETE", "PatchMapping", "PATCH").getOrDefault(mapping.getNameAsString(), "ANY");
        if (mapping instanceof NormalAnnotationExpr normal) return normal.getPairs().stream().filter(p -> p.getNameAsString().equals("method")).map(p -> p.getValue().toString().replace("RequestMethod.", "")).findFirst().orElse("ANY");
        return "ANY";
    }
    private static Map<String, String> viewConstants(ClassOrInterfaceDeclaration type) {
        Map<String, String> values = new HashMap<>();
        type.getFields().forEach(field -> field.getVariables().forEach(variable -> variable.getInitializer().filter(Expression::isStringLiteralExpr)
                .ifPresent(value -> values.put(variable.getNameAsString(), value.asStringLiteralExpr().asString()))));
        return values;
    }
    private static List<String> returnedViews(MethodDeclaration method, Map<String, String> constants) {
        Map<String, String> modelAndViews = new HashMap<>();
        for (VariableDeclarator variable : method.findAll(VariableDeclarator.class)) {
            variable.getInitializer().filter(Expression::isObjectCreationExpr).map(Expression::asObjectCreationExpr).filter(creation -> creation.getType().getNameAsString().equals("ModelAndView"))
                    .filter(creation -> !creation.getArguments().isEmpty() && creation.getArgument(0).isStringLiteralExpr())
                    .ifPresent(creation -> modelAndViews.put(variable.getNameAsString(), creation.getArgument(0).asStringLiteralExpr().asString()));
        }
        List<String> views = new ArrayList<>();
        for (Expression expression : method.findAll(com.github.javaparser.ast.stmt.ReturnStmt.class).stream().flatMap(r -> r.getExpression().stream()).toList()) {
            if (expression.isStringLiteralExpr()) views.add(expression.asStringLiteralExpr().asString());
            else if (expression.isNameExpr()) {
                String name = expression.asNameExpr().getNameAsString();
                if (constants.containsKey(name)) views.add(constants.get(name));
                if (modelAndViews.containsKey(name)) views.add(modelAndViews.get(name));
            } else if (expression.isObjectCreationExpr()) {
                ObjectCreationExpr creation = expression.asObjectCreationExpr();
                if (creation.getType().getNameAsString().equals("ModelAndView") && !creation.getArguments().isEmpty() && creation.getArgument(0).isStringLiteralExpr()) views.add(creation.getArgument(0).asStringLiteralExpr().asString());
            }
        }
        return views;
    }
    private static String join(String base, String child) { String path = (base + "/" + child).replaceAll("/{2,}", "/"); return path.isEmpty() ? "/" : path.startsWith("/") ? path : "/" + path; }
    private static void addNode(State state, GraphNode node) { if (state.nodes.stream().noneMatch(n -> n.id().equals(node.id()))) state.nodes.add(node); }
    private static void edge(State state, EdgeType type, String from, String to, Confidence confidence, SourceLocation source) { String id = ApplicationGraph.id(NodeType.COMPONENT, type + ":" + from + ":" + to); if (state.edges.stream().noneMatch(e -> e.id().equals(id))) state.edges.add(new Relationship(id, type, from, to, confidence, source)); }
    private static final class State {
        private final Path root; private final List<GraphNode> nodes = new ArrayList<>(); private final List<Relationship> edges = new ArrayList<>(); private final List<Diagnostic> diagnostics = new ArrayList<>();
        private final Map<String, String> endpointByPath = new HashMap<>(); private final Map<String, String> screensByView = new HashMap<>();
        private final Map<String, String> fragmentsByPath = new HashMap<>(); private String defaultExceptionView;
        private State(Path root) { this.root = root; }
    }
}
