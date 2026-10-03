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
import io.screentrace.scanner.SafeProjectFiles;
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
    private static final String REQUEST_MAPPING = "RequestMapping";
    private static final String ROUTE = "route";
    private static final String ROUTE_SEPARATOR = "/";
    private static final Set<String> MAPPINGS = Set.of(REQUEST_MAPPING, "GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping");
    private static final Set<String> PATH_NAMES = Set.of("value", "path");
    private static final String NAVIGATION = "NAVIGATION";
    private static final String REQUEST = "REQUEST";
    private static final Pattern ROUTE_PATTERN = Pattern.compile("<Route\\s+path\\s*=\\s*[\\\"'](/[^\\\"']*)[\\\"'][^>]*?\\belement\\s*=\\s*\\{([^}]*)}");
    private static final Pattern VIEW_PATTERN = Pattern.compile("<([A-Z]\\w*)");
    private static final Pattern LINK_PATTERN = Pattern.compile("<(?:Link|NavLink)\\b[^>]*\\bto\\s*=\\s*(?:\\{)?[\\\"'](/[^\\\"'}]+)");
    private static final Pattern NAVIGATE_PATTERN = Pattern.compile("\\bnavigate\\s*\\(\\s*[\\\"'](/[^\\\"')]+)");
    private static final Pattern API_PATTERN = Pattern.compile("[\\\"'](/api/[^\\\"'?` }]+)");
    private static final List<String> IMPORT_SUFFIXES = List.of(".tsx", ".jsx", ".ts", ".js", "/index.tsx");

    public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
        AnalysisState state = new AnalysisState(inventory.root(), inventory.javaFiles());
        for (String message : inventory.diagnostics()) state.diagnostics.add(new Diagnostic(message, Confidence.UNRESOLVED, new SourceLocation(".", 1), "SOURCE_LIMIT", List.of()));
        for (Path file : inventory.javaFiles()) {
            parseController(inventory.root(), file, state);
        }
        for (Path file : inventory.reactFiles()) {
            parseReact(inventory.root(), file, state);
        }
        connectReactGraph(state);
        ApplicationGraph graph=new ApplicationGraph(
                new ApplicationGraph.Application(inventory.root().getFileName().toString(), inventory.root().toString(), inventory.technologies()),
                state.nodes, state.edges, state.diagnostics, state.apiContracts, ApplicationGraph.CURRENT_SCHEMA_VERSION);
        return SpringServerValidation.enrich(io.screentrace.parser.jsp.UrlGraphContribution.enrich(graph,inventory),inventory);
    }

    private void parseController(Path root, Path file, AnalysisState state) {
        try {
            String relative = root.relativize(file).toString();
            for (ClassOrInterfaceDeclaration type : StaticJavaParser.parse(SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES)).findAll(ClassOrInterfaceDeclaration.class)) {
                parseControllerType(type, relative, state);
            }
        } catch (IOException | RuntimeException exception) {
            state.diagnostics.add(new Diagnostic("Unable to parse Java source: " + exception.getMessage(), Confidence.UNRESOLVED,
                    new SourceLocation(root.relativize(file).toString(), 1)));
        }
    }

    private void parseControllerType(ClassOrInterfaceDeclaration type, String relative, AnalysisState state) {
        if (!isController(type)) {
            return;
        }
        boolean rest = annotation(type, "RestController") != null || annotation(type,"ResponseBody")!=null;
        List<String> bases = paths(annotation(type, REQUEST_MAPPING));
        if (bases.isEmpty()) {
            bases = List.of("");
        }
        for (MethodDeclaration method : type.getMethods()) {
            java.util.Optional<AnnotationExpr> mapping = mapping(method);
            if (mapping.isPresent()) {
                parseMapping(method, mapping.get(), new ControllerContext(type.getNameAsString(), relative, bases, rest), state);
            }
        }
    }

    private void parseMapping(MethodDeclaration method, AnnotationExpr mapping, ControllerContext controller, AnalysisState state) {
        String httpMethod = httpMethod(mapping);
        List<String> methodPaths = paths(mapping);
        if (methodPaths.isEmpty()) {
            methodPaths = List.of("");
        }
        SourceLocation source = new SourceLocation(controller.relative(), method.getBegin().map(position -> position.line).orElse(1));
        String handlerName = controller.typeName() + "." + method.getNameAsString() + "()";
        String handlerId = ApplicationGraph.id(NodeType.HANDLER, controller.relative() + ":" + handlerName + ":" + source.line());
        addNode(state.nodes, new GraphNode(handlerId, NodeType.HANDLER, handlerName,
                Map.of("class", controller.typeName(), "method", method.getNameAsString()), source, Confidence.CONFIRMED));

        String result = returnLiteral(method);
        boolean redirect = result != null && result.startsWith("redirect:");
        EndpointContext endpoint = new EndpointContext(handlerId, httpMethod, controller.rest()||annotation(method,"ResponseBody")!=null||method.getType().isClassOrInterfaceType()&&method.getType().asClassOrInterfaceType().getNameAsString().equals("ResponseEntity"), redirect, result, source);
        for (String base : controller.bases()) {
            for (String child : methodPaths) {
                addEndpoint(state, join(base, child), endpoint, method, mapping);
            }
        }
    }

    private void addEndpoint(AnalysisState state, String path, EndpointContext endpoint, MethodDeclaration method, AnnotationExpr mapping) {
        String label = endpoint.httpMethod() + " " + path;
        String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, label + ":" + endpoint.handlerId());
        Map<String, String> attributes = new TreeMap<>();
        attributes.put("httpMethod", endpoint.httpMethod());
        attributes.put("path", path);
        attributes.put("category", endpoint.category());
        addNode(state.nodes, new GraphNode(endpointId, NodeType.ENDPOINT, label, attributes, endpoint.source(), Confidence.CONFIRMED));
        state.endpointByRoute.putIfAbsent(path, endpointId);
        edge(state.edges, EdgeType.HANDLED_BY, endpointId, endpoint.handlerId(), Confidence.CONFIRMED, endpoint.source());
        if (endpoint.rest()) state.apiContracts.add(state.contracts.contract(endpointId, method, mapping, endpoint.source(), List.of()));
        if (endpoint.rendersScreen()) {
            edge(state.edges, EdgeType.RENDERS, endpoint.handlerId(), screen(endpoint.result(), state.nodes, endpoint.source()), Confidence.CONFIRMED,
                    endpoint.source());
        }
    }

    private void parseReact(Path root, Path file, AnalysisState state) throws IOException {
        String text = SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
        String relative = root.relativize(file).toString();
        Map<String, String> imports = imports(root, file, text);
        addRoutes(root, text, relative, imports, state);
        addComponents(text, relative, state);
    }

    private void addRoutes(Path root, String text, String relative, Map<String, String> imports, AnalysisState state) {
        Matcher routes = ROUTE_PATTERN.matcher(text);
        while (routes.find()) {
            String route = routes.group(1);
            addRoute(root, text, relative, imports, state, routes, route);
        }
    }

    private void addRoute(Path root, String text, String relative, Map<String, String> imports, AnalysisState state, Matcher routes, String route) {
        String view = lastView(routes.group(2));
        SourceLocation source = new SourceLocation(relative, line(text, routes.start()));
        String viewSource = sourceForView(text, view, imports, relative);
        Map<String, String> attributes = new TreeMap<>();
        attributes.put(ROUTE, route);
        attributes.put("view", view);
        attributes.put("viewSource", viewSource);
        attributes.put("viewSources", String.join("|", sourceClosure(root, viewSource, new LinkedHashSet<>())));
        String id = ApplicationGraph.id(NodeType.SCREEN, relative + ":" + route);
        addNode(state.nodes, new GraphNode(id, NodeType.SCREEN, routeName(route), attributes, source, Confidence.CONFIRMED));
    }

    private static String routeName(String route) {
        return route.equals(ROUTE_SEPARATOR) ? "Home" : route.substring(1);
    }

    private void addComponents(String text, String relative, AnalysisState state) {
        addComponents(text, relative, LINK_PATTERN, "LINK", NAVIGATION, null, state);
        addComponents(text, relative, NAVIGATE_PATTERN, "BUTTON", NAVIGATION, null, state);
        addApiCalls(text, relative, state);
    }

    private void addApiCalls(String text, String relative, AnalysisState state) {
        Matcher matcher = API_PATTERN.matcher(text);
        while (matcher.find()) {
            String target = matcher.group(1);
            String action = isLoadEffect(text, matcher.start()) ? "PAGE_LOAD" : REQUEST;
            String label = buttonLabel(text, matcher.start());
            addComponent(new ComponentContext(relative, text, matcher.start(), label == null ? "API_CALL" : "BUTTON", action,
                    target, target, label == null ? target : label), state);
        }
    }

    private static String buttonLabel(String text, int offset) {
        int start = text.lastIndexOf("<button", offset);
        int jsxEnd = start < 0 ? -1 : text.indexOf("}>", start);
        int end = jsxEnd < 0 ? (start < 0 ? -1 : text.indexOf('>', start)) : jsxEnd + 1;
        if (start < 0 || end < offset) return null;
        int close = text.indexOf("</button>", end);
        if (close < 0) return null;
        String label = text.substring(end + 1, close).replaceAll("<[^>]+>", "").trim();
        return label.isEmpty() ? null : label;
    }

    /** A conservative source-level lifecycle check: calls outside a proved useEffect remain user requests. */
    private static boolean isLoadEffect(String text, int offset) {
        int effect = text.lastIndexOf("useEffect", offset);
        if (effect < 0) return false;
        int close = text.indexOf("}, []", effect);
        return close >= offset;
    }

    private void addComponents(String text, String relative, Pattern pattern, String type, String action,
            String endpointGroup, AnalysisState state) {
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            String target = matcher.group(1);
            addComponent(new ComponentContext(relative, text, matcher.start(), type, action, target, endpointGroup == null ? null : target, target), state);
        }
    }

    private void addComponent(ComponentContext component, AnalysisState state) {
        SourceLocation source = new SourceLocation(component.relative(), line(component.text(), component.offset()));
        String id = ApplicationGraph.id(NodeType.COMPONENT, component.relative() + ":" + component.offset() + ":" + component.target());
        addNode(state.nodes, new GraphNode(id, NodeType.COMPONENT, component.label(),
                Map.of("componentType", component.type(), "action", component.action(), "target", component.target()), source, Confidence.CONFIRMED));
        if (component.endpoint() != null) {
            String endpointId = state.endpointByRoute.get(component.endpoint());
            if (endpointId != null) {
                edge(state.edges, EdgeType.TRIGGERS, id, endpointId, Confidence.CONFIRMED, source);
            }
        }
    }

    private static Map<String, String> imports(Path root, Path file, String text) {
        Map<String, String> result = new HashMap<>();
        for (String statement : text.lines().toList()) {
            ImportedComponent imported = importedComponent(statement);
            if (imported == null) {
                continue;
            }
            Path base = file.getParent().resolve(imported.source());
            for (String suffix : IMPORT_SUFFIXES) {
                Path candidate = Path.of(base + suffix);
                if (SafeProjectFiles.isSafeRegularFile(root, candidate)) {
                    try {
                        SafeProjectFiles.readUtf8Limited(root, candidate, SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
                        result.put(imported.name(), root.relativize(candidate.toRealPath()).toString());
                        break;
                    } catch (IOException ignored) { /* Oversized or changed imports remain unresolved. */ }
                }
            }
        }
        return result;
    }

    private static ImportedComponent importedComponent(String statement) {
        String line = statement.strip();
        if (!line.startsWith("import ")) {
            return null;
        }
        int from = fromKeyword(line);
        if (from < 0) {
            return null;
        }
        String name = importedName(line.substring("import ".length(), from));
        String source = quotedValue(line.substring(from + "from".length()).strip());
        return name == null || source == null ? null : new ImportedComponent(name, source);
    }

    private static int fromKeyword(String line) {
        int position = line.indexOf("from");
        while (position >= 0) {
            boolean startsAfterWhitespace = position > 0 && Character.isWhitespace(line.charAt(position - 1));
            int end = position + "from".length();
            boolean endsBeforeWhitespace = end < line.length() && Character.isWhitespace(line.charAt(end));
            if (startsAfterWhitespace && endsBeforeWhitespace) {
                return position;
            }
            position = line.indexOf("from", end);
        }
        return -1;
    }

    private static String importedName(String declaration) {
        int index = 0;
        while (index < declaration.length() && (Character.isWhitespace(declaration.charAt(index)) || declaration.charAt(index) == '{')) {
            index++;
        }
        if (index == declaration.length() || !Character.isUpperCase(declaration.charAt(index))) {
            return null;
        }
        int end = index + 1;
        while (end < declaration.length()
                && (Character.isLetterOrDigit(declaration.charAt(end)) || declaration.charAt(end) == '_')) {
            end++;
        }
        return declaration.substring(index, end);
    }

    private static String quotedValue(String value) {
        if (value.length() < 2 || (value.charAt(0) != '\'' && value.charAt(0) != '\"')) {
            return null;
        }
        char quote = value.charAt(0);
        int end = value.indexOf(quote, 1);
        return end < 0 ? null : value.substring(1, end);
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
        Path file = root.resolve(relative).normalize();
        if (!SafeProjectFiles.isSafeRegularFile(root, file)) {
            return visited;
        }
        try {
            String text = SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
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
            if (node.type() == NodeType.SCREEN && node.attributes().containsKey(ROUTE)) {
                screensByRoute.put(node.attributes().get(ROUTE), node);
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
        for (GraphNode component : state.nodes.stream().filter(node -> isScreenComponent(node, sources)).toList()) {
            if ("PAGE_LOAD".equals(component.attributes().get("action"))) {
                endpointFor(component, state).ifPresent(endpoint -> edge(state.edges, EdgeType.CALLS, screen.id(), endpoint, Confidence.CONFIRMED, component.source()));
                continue;
            }
            edge(state.edges, EdgeType.CONTAINS, screen.id(), component.id(), Confidence.CONFIRMED, component.source());
            GraphNode next = screensByRoute.get(component.attributes().get("target"));
            if (next != null) {
                edge(state.edges, EdgeType.NAVIGATES_TO, component.id(), next.id(), Confidence.CONFIRMED, component.source());
            }
        }
    }

    private static java.util.Optional<String> endpointFor(GraphNode component, AnalysisState state) {
        return state.edges.stream().filter(edge -> edge.type() == EdgeType.TRIGGERS && edge.from().equals(component.id())).map(Relationship::to).findFirst();
    }

    private static boolean isScreenComponent(GraphNode node, Set<String> sources) {
        return node.type() == NodeType.COMPONENT && node.source() != null && sources.contains(node.source().file())
                && (NAVIGATION.equals(node.attributes().get("action")) || REQUEST.equals(node.attributes().get("action")) || "PAGE_LOAD".equals(node.attributes().get("action")));
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
        if (!REQUEST_MAPPING.equals(mapping.getNameAsString())) {
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
        String path = (base + ROUTE_SEPARATOR + child).replaceAll("/{2,}", ROUTE_SEPARATOR);
        if (path.isEmpty()) {
            return ROUTE_SEPARATOR;
        }
        return path.startsWith(ROUTE_SEPARATOR) ? path : ROUTE_SEPARATOR + path;
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
        private final List<ApplicationGraph.ApiContract> apiContracts = new ArrayList<>();
        private final ApiContractExtractor contracts;

        private AnalysisState(Path root, List<Path> javaFiles) {
            contracts = new ApiContractExtractor(root, javaFiles);
        }
    }

    private record ControllerContext(String typeName, String relative, List<String> bases, boolean rest) {
    }

    private record EndpointContext(String handlerId, String httpMethod, boolean rest, boolean redirect, String result, SourceLocation source) {
        private String category() {
            if (rest) {
                return "REST_API";
            }
            return redirect ? "REDIRECT" : "MVC_SCREEN";
        }

        private boolean rendersScreen() {
            return !rest && result != null && !redirect;
        }
    }

    private record ComponentContext(String relative, String text, int offset, String type, String action, String target, String endpoint, String label) {
    }

    private record ImportedComponent(String name, String source) {
    }
}
