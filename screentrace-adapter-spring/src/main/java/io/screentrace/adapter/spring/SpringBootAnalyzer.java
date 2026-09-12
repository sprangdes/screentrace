package io.screentrace.adapter.spring;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Diagnostic;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** AST-based Spring mapping parser; React extraction is deliberately limited to declared route/link/API literals. */
public final class SpringBootAnalyzer {
    private static final Set<String> MAPPINGS = Set.of("RequestMapping", "GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping");
    private static final Set<String> PATH_NAMES = Set.of("value", "path");
    private static final String NAVIGATION = "NAVIGATION";
    private static final String REQUEST = "REQUEST";
    private static final Pattern ROUTE_PATTERN = Pattern.compile("<Route\\s+path\\s*=\\s*[\\\"'](/[^\\\"']*)[\\\"'][^>]*?\\belement\\s*=\\s*\\{([^}]*)}");
    private static final Pattern VIEW_PATTERN = Pattern.compile("<([A-Z]\\w*)");
    private static final Pattern LINK_PATTERN = Pattern.compile("<(?:Link|NavLink)\\b[^>]*\\bto\\s*=\\s*(?:\\{)?[\\\"'](/[^\\\"'}]+)");
    private static final Pattern NAVIGATE_PATTERN = Pattern.compile("\\bnavigate\\s*\\(\\s*[\\\"'](/[^\\\"')]+)");
    private static final Pattern API_PATTERN = Pattern.compile("[\\\"'](/api/[^\\\"'?` }]+)");
    private static final Pattern IMPORT_PATTERN = Pattern.compile("import\\s+(?:\\{\\s*)?([A-Z]\\w*).*?from\\s+[\\\"']([^\\\"']+)[\\\"']");
    private static final List<String> IMPORT_SUFFIXES = List.of(".tsx", ".jsx", ".ts", ".js", "/index.tsx");

    public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
        AnalysisState state = new AnalysisState();
        for (Path file : inventory.javaFiles()) {
            parseController(inventory.root(), file, state);
        }
        for (Path file : inventory.reactFiles()) {
            parseReact(inventory.root(), file, state);
        }
        connectReactGraph(state);
        return new ApplicationGraph(
                new ApplicationGraph.Application(inventory.root().getFileName().toString(), inventory.root().toString(), inventory.technologies()),
                state.nodes, state.edges, state.diagnostics);
    }

    private void parseController(Path root, Path file, AnalysisState state) {
        try {
            String relative = root.relativize(file).toString();
            for (ClassOrInterfaceDeclaration type : StaticJavaParser.parse(file).findAll(ClassOrInterfaceDeclaration.class)) {
                parseControllerType(root, type, relative, state);
            }
        } catch (IOException | RuntimeException exception) {
            state.diagnostics.add(new Diagnostic("Unable to parse Java source: " + exception.getMessage(), Confidence.UNRESOLVED,
                    new SourceLocation(root.relativize(file).toString(), 1)));
        }
    }

    private void parseControllerType(Path root, ClassOrInterfaceDeclaration type, String relative, AnalysisState state) {
        if (!isController(type)) {
            return;
        }
        boolean rest = annotation(type, "RestController") != null;
        List<String> bases = paths(annotation(type, "RequestMapping"));
        if (bases.isEmpty()) {
            bases = List.of("");
        }
        for (MethodDeclaration method : type.getMethods()) {
            java.util.Optional<AnnotationExpr> mapping = mapping(method);
            if (mapping.isPresent()) {
                parseMapping(root, type, method, relative, bases, rest, mapping.get(), state);
            }
        }
    }

    private void parseMapping(Path root, ClassOrInterfaceDeclaration type, MethodDeclaration method, String relative,
            List<String> bases, boolean rest, AnnotationExpr mapping, AnalysisState state) {
        String httpMethod = httpMethod(mapping);
        List<String> methodPaths = paths(mapping);
        if (methodPaths.isEmpty()) {
            methodPaths = List.of("");
        }
        SourceLocation source = new SourceLocation(relative, method.getBegin().map(position -> position.line).orElse(1));
        String handlerName = type.getNameAsString() + "." + method.getNameAsString() + "()";
        String handlerId = ApplicationGraph.id(NodeType.HANDLER, relative + ":" + handlerName + ":" + source.line());
        addNode(state.nodes, new GraphNode(handlerId, NodeType.HANDLER, handlerName,
                Map.of("class", type.getNameAsString(), "method", method.getNameAsString()), source, Confidence.CONFIRMED));

        String result = returnLiteral(method);
        boolean redirect = result != null && result.startsWith("redirect:");
        for (String base : bases) {
            for (String child : methodPaths) {
                addEndpoint(root, state, handlerId, httpMethod, join(base, child), rest, redirect, result, source);
            }
        }
    }

    private void addEndpoint(Path root, AnalysisState state, String handlerId, String httpMethod, String path,
            boolean rest, boolean redirect, String result, SourceLocation source) {
        String label = httpMethod + " " + path;
        String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, label + ":" + handlerId);
        Map<String, String> attributes = new TreeMap<>();
        attributes.put("httpMethod", httpMethod);
        attributes.put("path", path);
        attributes.put("category", rest ? "REST_API" : redirect ? "REDIRECT" : "MVC_SCREEN");
        addNode(state.nodes, new GraphNode(endpointId, NodeType.ENDPOINT, label, attributes, source, Confidence.CONFIRMED));
        state.endpointByRoute.putIfAbsent(path, endpointId);
        edge(state.edges, EdgeType.HANDLED_BY, endpointId, handlerId, Confidence.CONFIRMED, source);
        if (!rest && result != null && !redirect) {
            edge(state.edges, EdgeType.RENDERS, handlerId, screen(result, state.nodes, source), Confidence.CONFIRMED, source);
        }
    }

    private void parseReact(Path root, Path file, AnalysisState state) throws IOException {
        String text = Files.readString(file);
        String relative = root.relativize(file).toString();
        Map<String, String> imports = imports(root, file, text);
        addRoutes(root, text, relative, imports, state);
        addComponents(text, relative, state);
    }

    private void addRoutes(Path root, String text, String relative, Map<String, String> imports, AnalysisState state) {
        Matcher routes = ROUTE_PATTERN.matcher(text);
        while (routes.find()) {
            String route = routes.group(1);
            String view = lastView(routes.group(2));
            String name = route.equals("/") ? "Home" : route.substring(1);
            SourceLocation source = new SourceLocation(relative, line(text, routes.start()));
            Map<String, String> attributes = new TreeMap<>();
            String viewSource = sourceForView(text, view, imports, relative);
            attributes.put("route", route);
            attributes.put("view", view);
            attributes.put("viewSource", viewSource);
            attributes.put("viewSources", String.join("|", sourceClosure(root, viewSource, new LinkedHashSet<>())));
            String id = ApplicationGraph.id(NodeType.SCREEN, relative + ":" + route);
            addNode(state.nodes, new GraphNode(id, NodeType.SCREEN, name, attributes, source, Confidence.CONFIRMED));
        }
    }

    private void addComponents(String text, String relative, AnalysisState state) {
        addComponents(text, relative, LINK_PATTERN, "LINK", NAVIGATION, null, state);
        addComponents(text, relative, NAVIGATE_PATTERN, "BUTTON", NAVIGATION, null, state);
        addComponents(text, relative, API_PATTERN, "API_CALL", REQUEST, "endpoint", state);
    }

    private void addComponents(String text, String relative, Pattern pattern, String type, String action,
            String endpointGroup, AnalysisState state) {
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            String target = matcher.group(1);
            String endpoint = endpointGroup == null ? null : target;
            addComponent(relative, text, matcher.start(), type, action, target, endpoint, state);
        }
    }

    private void addComponent(String relative, String text, int offset, String type, String action, String target,
            String endpoint, AnalysisState state) {
        SourceLocation source = new SourceLocation(relative, line(text, offset));
        String id = ApplicationGraph.id(NodeType.COMPONENT, relative + ":" + source.line() + ":" + target);
        addNode(state.nodes, new GraphNode(id, NodeType.COMPONENT, target,
                Map.of("componentType", type, "action", action, "target", target), source, Confidence.CONFIRMED));
        if (endpoint != null) {
            String endpointId = state.endpointByRoute.get(endpoint);
            if (endpointId != null) {
                edge(state.edges, EdgeType.TRIGGERS, id, endpointId, Confidence.CONFIRMED, source);
            }
        }
    }

    private static Map<String, String> imports(Path root, Path file, String text) {
        Map<String, String> result = new HashMap<>();
        Matcher matcher = IMPORT_PATTERN.matcher(text);
        while (matcher.find()) {
            Path base = file.getParent().resolve(matcher.group(2));
            for (String suffix : IMPORT_SUFFIXES) {
                Path candidate = Path.of(base + suffix);
                if (Files.exists(candidate)) {
                    result.put(matcher.group(1), root.relativize(candidate).toString());
                    break;
                }
            }
        }
        return result;
    }

    private static String sourceForView(String text, String view, Map<String, String> imports, String fallback) {
        String direct = imports.get(view);
        if (direct != null) {
            return direct;
        }
        String function = functionBody(text, view);
        if (function != null) {
            String renderedSource = importedRenderedView(function, imports);
            if (renderedSource != null) {
                return renderedSource;
            }
        }
        return fallback;
    }

    private static String functionBody(String text, String view) {
        int start = text.indexOf("function " + view);
        if (start < 0) {
            return null;
        }
        int nextFunction = text.indexOf("\nfunction ", start + 1);
        int nextExport = text.indexOf("\nexport ", start + 1);
        int end = firstPositive(nextFunction, nextExport, text.length());
        return text.substring(start, end);
    }

    private static int firstPositive(int first, int second, int fallback) {
        if (first < 0) {
            return second < 0 ? fallback : second;
        }
        return second < 0 ? first : Math.min(first, second);
    }

    private static String importedRenderedView(String source, Map<String, String> imports) {
        Matcher rendered = VIEW_PATTERN.matcher(source);
        while (rendered.find()) {
            String importedSource = imports.get(rendered.group(1));
            if (importedSource != null) {
                return importedSource;
            }
        }
        return null;
    }

    private static Set<String> sourceClosure(Path root, String relative, Set<String> visited) {
        if (!visited.add(relative)) {
            return visited;
        }
        Path file = root.resolve(relative);
        if (!Files.isRegularFile(file)) {
            return visited;
        }
        try {
            String text = Files.readString(file);
            Map<String, String> children = imports(root, file, text);
            Matcher rendered = VIEW_PATTERN.matcher(text);
            while (rendered.find()) {
                String child = children.get(rendered.group(1));
                if (child != null) {
                    sourceClosure(root, child, visited);
                }
            }
        } catch (IOException ignored) {
            // An unreadable imported view is represented by the source already recorded above.
        }
        return visited;
    }

    private static void connectReactGraph(AnalysisState state) {
        Map<String, GraphNode> screensByRoute = new HashMap<>();
        for (GraphNode node : state.nodes) {
            if (node.type() == NodeType.SCREEN && node.attributes().containsKey("route")) {
                screensByRoute.put(node.attributes().get("route"), node);
            }
        }
        for (GraphNode screen : state.nodes.stream().filter(node -> node.type() == NodeType.SCREEN).toList()) {
            connectScreenComponents(screen, state, screensByRoute);
        }
    }

    private static void connectScreenComponents(GraphNode screen, AnalysisState state, Map<String, GraphNode> screensByRoute) {
        String value = screen.attributes().get("viewSources");
        if (value == null) {
            return;
        }
        Set<String> sources = Set.of(value.split("\\|"));
        for (GraphNode component : state.nodes.stream().filter(node -> isNavigationComponent(node, sources)).toList()) {
            edge(state.edges, EdgeType.CONTAINS, screen.id(), component.id(), Confidence.CONFIRMED, component.source());
            GraphNode next = screensByRoute.get(component.attributes().get("target"));
            if (next != null) {
                edge(state.edges, EdgeType.NAVIGATES_TO, component.id(), next.id(), Confidence.CONFIRMED, component.source());
            }
        }
    }

    private static boolean isNavigationComponent(GraphNode node, Set<String> sources) {
        return node.type() == NodeType.COMPONENT && node.source() != null && sources.contains(node.source().file())
                && NAVIGATION.equals(node.attributes().get("action"));
    }

    private static boolean isController(ClassOrInterfaceDeclaration type) {
        return annotation(type, "Controller") != null || annotation(type, "RestController") != null;
    }

    private static java.util.Optional<AnnotationExpr> mapping(MethodDeclaration method) {
        return method.getAnnotations().stream().filter(annotation -> MAPPINGS.contains(annotation.getNameAsString())).findFirst();
    }

    private static String lastView(String text) {
        String view = "Route";
        Matcher matcher = VIEW_PATTERN.matcher(text);
        while (matcher.find()) {
            view = matcher.group(1);
        }
        return view;
    }

    private static String screen(String view, List<GraphNode> nodes, SourceLocation source) {
        String id = ApplicationGraph.id(NodeType.SCREEN, view);
        addNode(nodes, new GraphNode(id, NodeType.SCREEN, view, Map.of("view", view), source, Confidence.CONFIRMED));
        return id;
    }

    private static void addNode(List<GraphNode> nodes, GraphNode node) {
        if (nodes.stream().noneMatch(existing -> existing.id().equals(node.id()))) {
            nodes.add(node);
        }
    }

    private static void edge(List<Relationship> edges, EdgeType type, String from, String to, Confidence confidence, SourceLocation source) {
        String id = ApplicationGraph.id(NodeType.COMPONENT, type + ":" + from + ":" + to);
        if (edges.stream().noneMatch(existing -> existing.id().equals(id))) {
            edges.add(new Relationship(id, type, from, to, confidence, source));
        }
    }

    private static AnnotationExpr annotation(NodeWithAnnotations<?> node, String name) {
        return node.getAnnotations().stream().filter(candidate -> candidate.getNameAsString().equals(name)).findFirst().orElse(null);
    }

    private static List<String> paths(AnnotationExpr annotation) {
        if (annotation == null) {
            return List.of();
        }
        List<String> paths = new ArrayList<>();
        if (annotation instanceof SingleMemberAnnotationExpr single) {
            literals(single.getMemberValue(), paths);
        } else if (annotation instanceof NormalAnnotationExpr normal) {
            normal.getPairs().stream().filter(pair -> PATH_NAMES.contains(pair.getNameAsString())).forEach(pair -> literals(pair.getValue(), paths));
        }
        return paths;
    }

    private static void literals(Expression expression, List<String> values) {
        if (expression.isStringLiteralExpr()) {
            values.add(expression.asStringLiteralExpr().asString());
        } else if (expression.isArrayInitializerExpr()) {
            expression.asArrayInitializerExpr().getValues().forEach(value -> literals(value, values));
        }
    }

    private static String httpMethod(AnnotationExpr mapping) {
        if (!"RequestMapping".equals(mapping.getNameAsString())) {
            return Map.of("GetMapping", "GET", "PostMapping", "POST", "PutMapping", "PUT", "DeleteMapping", "DELETE", "PatchMapping", "PATCH")
                    .getOrDefault(mapping.getNameAsString(), "ANY");
        }
        String configured = named(mapping, "method");
        return configured == null ? "ANY" : configured.replace("RequestMethod.", "");
    }

    private static String named(AnnotationExpr annotation, String name) {
        if (annotation instanceof NormalAnnotationExpr normal) {
            return normal.getPairs().stream().filter(pair -> pair.getNameAsString().equals(name)).map(pair -> pair.getValue().toString()).findFirst().orElse(null);
        }
        return null;
    }

    private static String join(String base, String child) {
        String path = (base + "/" + child).replaceAll("/{2,}", "/");
        return path.isEmpty() ? "/" : path.startsWith("/") ? path : "/" + path;
    }

    private static String returnLiteral(MethodDeclaration method) {
        return method.findAll(com.github.javaparser.ast.stmt.ReturnStmt.class).stream()
                .map(returnStatement -> returnStatement.getExpression().filter(Expression::isStringLiteralExpr)
                        .map(expression -> expression.asStringLiteralExpr().asString()).orElse(null))
                .filter(Objects::nonNull).findFirst().orElse(null);
    }

    private static int line(String text, int offset) {
        return 1 + (int) text.substring(0, offset).chars().filter(character -> character == '\n').count();
    }

    private static final class AnalysisState {
        private final List<GraphNode> nodes = new ArrayList<>();
        private final List<Relationship> edges = new ArrayList<>();
        private final Map<String, String> endpointByRoute = new HashMap<>();
        private final List<Diagnostic> diagnostics = new ArrayList<>();
    }
}
