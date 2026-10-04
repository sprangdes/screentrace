package io.screentrace.adapter.spring;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
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
import io.screentrace.parser.jsp.JspAnalysis;
import io.screentrace.parser.jsp.JspProjectParser;
import io.screentrace.parser.jsp.MarkupGraphContribution;
import java.io.IOException;
import java.io.StringReader;
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
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

/** Static analysis for annotation-based, server-rendered Spring MVC applications. */
public final class SpringMvcAnalyzer {
    private static final Set<String> MAPPINGS = Set.of("RequestMapping", "GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping");
    private static final Set<String> PATH_NAMES = Set.of("value", "path");

    static {
        StaticJavaParser.setConfiguration(new ParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_17));
    }

    public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
        State state = new State(inventory.root(), inventory.javaFiles());
        for (String message : inventory.diagnostics()) state.diagnostics.add(new Diagnostic(message, Confidence.UNRESOLVED, new SourceLocation(".", 1), "SOURCE_LIMIT", List.of()));
        JspAnalysis jsp = new JspProjectParser().analyze(inventory.root(), inventory.files());
        Set<String> includedViews = includedViewPaths(inventory.root(), jsp);
        for (JspAnalysis.View view : jsp.views()) if (view.kind() != JspAnalysis.ViewKind.JSPF && !includedViews.contains(view.path())) addJspScreen(inventory.root().resolve(view.path()), state);
        addJspFragments(jsp, includedViews, state);
        addTilesDefinitions(jsp, state);
        discoverExceptionView(inventory, state);
        parseXmlControllers(inventory, state);
        for (Path java : inventory.javaFiles()) parseController(java, state);
        SpringControllerFlow.resolve(state.nodes,state.edges,state.diagnostics,state.returnTargets,
            io.screentrace.parser.jsp.UrlResolution.context(inventory,List.of()));
        addJspInteractions(jsp, state);
        addJspIncludes(jsp, state);
        state.diagnostics.addAll(jsp.diagnostics());
        ApplicationGraph graph = new ApplicationGraph(new ApplicationGraph.Application(inventory.root().getFileName().toString(), inventory.root().toString(), inventory.technologies()),
                state.nodes, state.edges, state.diagnostics, state.apiContracts, ApplicationGraph.BEHAVIOR_SCHEMA_VERSION, List.of(), List.of());
        graph=MarkupGraphContribution.enrich(graph,jsp);
        graph=SpringFormBindings.bind(graph,inventory);
        return io.screentrace.core.GraphIntegrityValidator.requireAnalysis(SpringControllerFlow.project(SpringServerValidation.enrich(io.screentrace.parser.jsp.UrlGraphContribution.enrich(io.screentrace.parser.jsp.JavaScriptGraphContribution.enrich(MarkupGraphContribution.enrich(graph,jsp),inventory),inventory),inventory)));
    }

    private static void discoverExceptionView(ProjectInventory inventory, State state) {
        for (Path file : inventory.files()) {
            if (!file.toString().endsWith(".xml")) continue;
            try {
                String xml = SafeProjectFiles.readUtf8Limited(inventory.root(), file, SafeProjectFiles.MAX_XML_FILE_BYTES);
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
        attributes.put("staticPreview", jspPreview(file, state));
        addNode(state, new GraphNode(id, NodeType.SCREEN, file.getFileName().toString().replaceFirst("\\.jsp$", ""),
                attributes, source, Confidence.CONFIRMED));
        state.screensByView.put(relative, id);
        state.screensByView.put("/" + relative, id);
        webPath(relative).ifPresent(path -> state.screensByView.put(path, id));
        for (String prefix : List.of("src/main/webapp/WEB-INF/jsp/", "src/main/webapp/WEB-INF/views/", "WEB-INF/jsp/", "WEB-INF/views/")) {
            if (relative.startsWith(prefix)) state.screensByView.put(relative.substring(prefix.length()).replaceFirst("\\.jsp$", ""), id);
        }
    }

    private static String jspPreview(Path file, State state) {
        try {
            String source = SafeProjectFiles.readUtf8Limited(state.root, file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
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
            for (ClassOrInterfaceDeclaration type : StaticJavaParser.parse(SafeProjectFiles.readUtf8Limited(state.root, file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES)).findAll(ClassOrInterfaceDeclaration.class)) {
                AnnotationExpr controller = annotation(type, "Controller");
                boolean rest = annotation(type, "RestController") != null;
                if (controller == null && !rest) continue;
                List<String> bases = paths(annotation(type, "RequestMapping"));
                if (bases.isEmpty()) bases = List.of("");
                Map<String, String> constants = viewConstants(type);
                for (MethodDeclaration method : type.getMethods()) {
                    AnnotationExpr mapping = method.getAnnotations().stream().filter(a -> MAPPINGS.contains(a.getNameAsString())).findFirst().orElse(null);
                    if (mapping != null) addMapping(type, method, mapping, relative, bases, constants,
                        rest || annotation(type,"ResponseBody")!=null || annotation(method, "ResponseBody") != null || method.getType().isClassOrInterfaceType()&&method.getType().asClassOrInterfaceType().getNameAsString().equals("ResponseEntity"), state);
                }
            }
        } catch (IOException | RuntimeException exception) {
            state.diagnostics.add(new Diagnostic("Unable to parse Java source: " + exception.getMessage(), Confidence.UNRESOLVED, new SourceLocation(relative, 1)));
        }
    }

    private static void addMapping(ClassOrInterfaceDeclaration type, MethodDeclaration method, AnnotationExpr mapping, String relative, List<String> bases, Map<String, String> constants, boolean rest, State state) {
        SourceLocation source = new SourceLocation(relative, method.getBegin().map(p -> p.line).orElse(1));
        String handlerName = type.getNameAsString() + "." + method.getNameAsString() + "()";
        String handlerId = ApplicationGraph.id(NodeType.HANDLER, relative + ":" + handlerName + ":" + source.line());
        addNode(state, new GraphNode(handlerId, NodeType.HANDLER, handlerName, Map.of("class", type.getNameAsString(), "method", method.getNameAsString()), source, Confidence.CONFIRMED));
        List<String> children = paths(mapping);
        if (children.isEmpty()) children = List.of("");
        var returns=rest?List.<SpringControllerReturns.Target>of():SpringControllerReturns.extract(method,relative,type.getNameAsString(),constants);
        List<String> views = returns.stream().filter(t->t.kind()!=SpringControllerReturns.Kind.UNKNOWN)
            .map(t->t.kind()==SpringControllerReturns.Kind.VIEW?t.value():(t.kind()==SpringControllerReturns.Kind.FORWARD?"forward:":"redirect:")+t.value()).distinct().toList();
        for(var target:returns) {
            if(target.kind()==SpringControllerReturns.Kind.UNKNOWN)SpringControllerFlow.unresolved(state.diagnostics,target,"無法證明常值或未改寫的回傳物件");
            else if(target.kind()!=SpringControllerReturns.Kind.VIEW)state.returnTargets.add(new SpringControllerFlow.Pending(handlerId,httpMethod(mapping),target));
        }
        for (String base : bases) for (String child : children) {
            String path = join(base, child);
            String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, httpMethod(mapping) + " " + path + ":" + handlerId);
            addNode(state, new GraphNode(endpointId, NodeType.ENDPOINT, httpMethod(mapping) + " " + path,
                    Map.of("httpMethod", httpMethod(mapping), "path", path, "category", rest ? "REST_API" : !views.isEmpty() && views.stream().allMatch(view -> view.startsWith("redirect:")) ? "REDIRECT" : "MVC_SCREEN"), source, Confidence.CONFIRMED));
            state.endpointByPath.putIfAbsent(path, endpointId);
            EndpointReference endpoint = new EndpointReference(endpointId, path, httpMethod(mapping), rest ? "REST_API" : "MVC_SCREEN");
            state.endpoints.add(endpoint);
            edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, Confidence.CONFIRMED, source);
            state.apiContracts.add(state.contracts.contract(endpointId, method, mapping, source, views));
            for (var target : returns.stream().filter(t->t.kind()==SpringControllerReturns.Kind.VIEW).toList()) {
                String view=target.value();String screenId = screenForView(view, target.source(), state);
                Confidence confidence=resolvedScreenId(view, state) != null ? Confidence.CONFIRMED : Confidence.INFERRED;
                String returnId=ApplicationGraph.id(NodeType.COMPONENT,"RENDERS:"+handlerId+":"+screenId+":"+target.source().line()+":"+target.expression());
                if(state.edges.stream().noneMatch(e->e.id().equals(returnId)))state.edges.add(new Relationship(returnId,EdgeType.RENDERS,handlerId,screenId,confidence,target.source(),target.evidence()));
                state.endpointsByScreen.computeIfAbsent(screenId, ignored -> new ArrayList<>()).add(endpoint);
                state.screensByEndpoint.computeIfAbsent(endpointId, ignored -> new ArrayList<>()).add(screenId);
            }
            if (!rest && views.isEmpty() && throwsException(method) && state.defaultExceptionView != null) {
                String screenId = screenForView(state.defaultExceptionView, source, state);
                edge(state, EdgeType.RENDERS, handlerId, screenId, Confidence.CONFIRMED, source);
                state.endpointsByScreen.computeIfAbsent(screenId, ignored -> new ArrayList<>()).add(endpoint);
                state.screensByEndpoint.computeIfAbsent(endpointId, ignored -> new ArrayList<>()).add(screenId);
            }
            if (!rest && views.isEmpty() && !throwsException(method)) state.diagnostics.add(new Diagnostic("Handler return view cannot be resolved statically: " + handlerName, Confidence.UNRESOLVED, source));
        }
    }

    private static boolean throwsException(MethodDeclaration method) {
        return !method.findAll(com.github.javaparser.ast.stmt.ThrowStmt.class).isEmpty();
    }

    private static String screenForView(String view, SourceLocation source, State state) {
        String known = resolvedScreenId(view, state);
        if (known != null) return known;
        String id = ApplicationGraph.id(NodeType.SCREEN, view);
        addNode(state, new GraphNode(id, NodeType.SCREEN, view, Map.of("view", view), source, Confidence.INFERRED));
        state.diagnostics.add(new Diagnostic("No JSP source found for view: " + view, Confidence.UNRESOLVED, source));
        return id;
    }

    private static String resolvedScreenId(String view, State state) {
        String known = state.screensByView.get(view);
        if (known != null) return known;
        for (ViewResolver resolver : state.viewResolvers) {
            String candidate = normalizeResolverPath(resolver.prefix(), view, resolver.suffix());
            known = state.screensByView.get(candidate);
            if (known != null) return known;
        }
        return null;
    }

    private static void parseXmlControllers(ProjectInventory inventory, State state) {
        for (Path file : inventory.springXmlFiles()) {
            String relative = state.root.relativize(file).toString().replace('\\', '/');
            try {
                Document document = xml(SafeProjectFiles.xmlWithoutExternalDoctype(SafeProjectFiles.readUtf8Limited(inventory.root(), file, SafeProjectFiles.MAX_XML_FILE_BYTES)));
                Map<String, Element> beans = beans(document);
                addViewResolvers(beans, state);
                addXmlViewControllers(document, relative, state);
                Map<String, String> routes = xmlRoutes(beans);
                for (Map.Entry<String, String> route : routes.entrySet()) addXmlController(route.getKey(), route.getValue(), beans, relative, state);
            } catch (Exception exception) {
                state.diagnostics.add(new Diagnostic("Unable to parse Spring MVC XML: " + exception.getMessage(), Confidence.UNRESOLVED,
                        new SourceLocation(relative, 1), "SPRING_XML_UNRESOLVED", List.of()));
            }
        }
    }

    private static Map<String, Element> beans(Document document) {
        Map<String, Element> beans = new HashMap<>();
        NodeList nodes = document.getElementsByTagName("bean");
        for (int index = 0; index < nodes.getLength(); index++) {
            Element bean = (Element) nodes.item(index);
            String id = bean.getAttribute("id");
            beans.put(id.isBlank() ? "__anonymous_" + index : id, bean);
        }
        return beans;
    }

    private static void addViewResolvers(Map<String, Element> beans, State state) {
        for (Element bean : beans.values()) {
            if (!bean.getAttribute("class").contains("InternalResourceViewResolver")) continue;
            String prefix = property(bean, "prefix");
            String suffix = property(bean, "suffix");
            state.viewResolvers.add(new ViewResolver(prefix == null ? "" : prefix, suffix == null ? "" : suffix));
        }
    }

    private static Map<String, String> xmlRoutes(Map<String, Element> beans) {
        Map<String, String> routes = new TreeMap<>();
        for (Element bean : beans.values()) {
            if (bean.getAttribute("class").contains("SimpleUrlHandlerMapping")) routes.putAll(urlMap(bean));
            if (bean.getAttribute("id").startsWith("/") && isXmlController(bean)) routes.put(bean.getAttribute("id"), bean.getAttribute("id"));
        }
        return routes;
    }

    private static Map<String, String> urlMap(Element bean) {
        Map<String, String> routes = new TreeMap<>();
        NodeList entries = bean.getElementsByTagName("entry");
        for (int index = 0; index < entries.getLength(); index++) {
            Element entry = (Element) entries.item(index);
            String target = entry.hasAttribute("value-ref") ? entry.getAttribute("value-ref") : entry.getAttribute("value");
            if (!entry.getAttribute("key").isBlank() && !target.isBlank()) routes.put(entry.getAttribute("key"), target);
        }
        NodeList properties = bean.getElementsByTagName("prop");
        for (int index = 0; index < properties.getLength(); index++) {
            Element property = (Element) properties.item(index);
            if (!property.getAttribute("key").isBlank() && !property.getTextContent().isBlank()) routes.put(property.getAttribute("key"), property.getTextContent().trim());
        }
        return routes;
    }

    private static void addXmlController(String path, String beanId, Map<String, Element> beans, String relative, State state) {
        Element bean = beans.get(beanId);
        if (bean == null || !isXmlController(bean)) {
            state.diagnostics.add(new Diagnostic("Spring XML route has no statically identifiable controller: " + path, Confidence.UNRESOLVED,
                    new SourceLocation(relative, 1), "SPRING_XML_CONTROLLER_UNRESOLVED", List.of()));
            return;
        }
        SourceLocation source = new SourceLocation(relative, 1);
        String className = bean.getAttribute("class");
        String handlerId = ApplicationGraph.id(NodeType.HANDLER, relative + ":" + beanId);
        addNode(state, new GraphNode(handlerId, NodeType.HANDLER, className + ".handleRequest()",
                Map.of("class", className, "bean", beanId), source, Confidence.CONFIRMED));
        String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, "ANY " + path + ":" + handlerId);
        addNode(state, new GraphNode(endpointId, NodeType.ENDPOINT, "ANY " + path,
                Map.of("httpMethod", "ANY", "path", path, "category", "MVC_SCREEN"), source, Confidence.CONFIRMED));
        state.endpointByPath.putIfAbsent(path, endpointId);
        state.endpoints.add(new EndpointReference(endpointId, path, "ANY", "MVC_SCREEN"));
        edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, Confidence.CONFIRMED, source);
        String view = property(bean, "viewName");
        if (view == null || view.isBlank()) {
            state.diagnostics.add(new Diagnostic("Spring XML controller view cannot be resolved statically: " + beanId, Confidence.UNRESOLVED,
                    source, "SPRING_XML_VIEW_UNRESOLVED", List.of()));
        } else {
            String screenId = screenForView(view, source, state);
            edge(state, EdgeType.RENDERS, handlerId, screenId, Confidence.CONFIRMED, source);
            state.screensByEndpoint.computeIfAbsent(endpointId, ignored -> new ArrayList<>()).add(screenId);
        }
    }

    private static void addXmlViewControllers(Document document, String relative, State state) {
        NodeList controllers = document.getElementsByTagName("mvc:view-controller");
        for (int index = 0; index < controllers.getLength(); index++) {
            Element controller = (Element) controllers.item(index);
            String path = controller.getAttribute("path");
            String view = controller.getAttribute("view-name");
            if (path.isBlank() || view.isBlank()) continue;
            SourceLocation source = new SourceLocation(relative, 1);
            String handlerId = ApplicationGraph.id(NodeType.HANDLER, relative + ":view-controller:" + path);
            addNode(state, new GraphNode(handlerId, NodeType.HANDLER, "ViewController(" + path + ").handleRequest()",
                Map.of("class", "mvc:view-controller", "view", view), source, Confidence.CONFIRMED));
            String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, "GET " + path + ":" + handlerId);
            addNode(state, new GraphNode(endpointId, NodeType.ENDPOINT, "GET " + path,
                Map.of("httpMethod", "GET", "path", path, "category", "MVC_SCREEN"), source, Confidence.CONFIRMED));
            state.endpointByPath.putIfAbsent(path, endpointId);
            state.endpoints.add(new EndpointReference(endpointId, path, "GET", "MVC_SCREEN"));
            edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, Confidence.CONFIRMED, source);
            String screenId = screenForView(view, source, state);
            edge(state, EdgeType.RENDERS, handlerId, screenId, Confidence.CONFIRMED, source);
            state.endpointsByScreen.computeIfAbsent(screenId, ignored -> new ArrayList<>())
                .add(new EndpointReference(endpointId, path, "GET", "MVC_SCREEN"));
            state.screensByEndpoint.computeIfAbsent(endpointId, ignored -> new ArrayList<>()).add(screenId);
        }
    }

    private static boolean isXmlController(Element bean) {
        String className = bean.getAttribute("class");
        return className.contains("Controller") || className.contains("HttpRequestHandler");
    }

    private static String property(Element bean, String name) {
        NodeList properties = bean.getElementsByTagName("property");
        for (int index = 0; index < properties.getLength(); index++) {
            Element property = (Element) properties.item(index);
            if (!name.equals(property.getAttribute("name"))) continue;
            if (property.hasAttribute("value")) return property.getAttribute("value");
            NodeList values = property.getElementsByTagName("value");
            if (values.getLength() > 0) return values.item(0).getTextContent().trim();
        }
        return null;
    }

    private static String normalizeResolverPath(String prefix, String view, String suffix) {
        String joined = (prefix + "/" + view + suffix).replaceAll("/{2,}", "/");
        return joined.startsWith("/") ? joined : "/" + joined;
    }

    private static Document xml(String source) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        factory.setXIncludeAware(false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        factory.setExpandEntityReferences(false);
        var builder = factory.newDocumentBuilder();
        builder.setEntityResolver((publicId, systemId) -> new InputSource(new StringReader("")));
        return builder.parse(new InputSource(new StringReader(source)));
    }

    private static void addJspFragments(JspAnalysis jsp, Set<String> includedViews, State state) {
        for (JspAnalysis.View view : jsp.views()) {
            if (view.kind() != JspAnalysis.ViewKind.JSPF && !includedViews.contains(view.path())) continue;
            String id = ApplicationGraph.id(NodeType.TEMPLATE_FRAGMENT, view.path());
            addNode(state, new GraphNode(id, NodeType.TEMPLATE_FRAGMENT, Path.of(view.path()).getFileName().toString(),
                    Map.of("view", view.path()), view.source(), Confidence.CONFIRMED));
            state.fragmentsByPath.put(view.path(), id);
            webPath(view.path()).ifPresent(path -> state.fragmentsByPath.put(path, id));
        }
    }

    private static void addTilesDefinitions(JspAnalysis jsp, State state) {
        for (JspAnalysis.TilesDefinition definition : jsp.tilesDefinitions()) {
            String id = ApplicationGraph.id(NodeType.SCREEN, "tiles:" + definition.name());
            addNode(state, new GraphNode(id, NodeType.SCREEN, definition.name(),
                    Map.of("tilesDefinition", "true", "template", definition.template()), definition.source(), Confidence.CONFIRMED));
            state.screensByView.put(definition.name(), id);
        }
    }

    private static void addJspInteractions(JspAnalysis jsp, State state) {
        for (JspAnalysis.Interaction rawInteraction : jsp.interactions()) {
            JspAnalysis.Interaction interaction=resolveRelativeJspTarget(rawInteraction,state);
            String screenId = state.screensByView.get(interaction.viewPath());
            if (screenId == null) continue;
            String id = interaction.componentId()!=null?interaction.componentId():ApplicationGraph.id(NodeType.COMPONENT, interaction.viewPath() + ":" + interaction.source().line() + ":" + interaction.target());
            Map<String, String> attributes = new TreeMap<>();
            attributes.put("componentType", interaction.type().name());
            attributes.put("target", interaction.target());
            attributes.put("targetStatus",interaction.confidence().name());
            if(interaction.originalExpression()!=null)attributes.put("originalExpression",interaction.originalExpression());
            if (!interaction.viewPath().equals(interaction.source().file())) attributes.put("includedBy", interaction.viewPath());
            if (interaction.httpMethod() != null) attributes.put("httpMethod", interaction.httpMethod());
            addNode(state, new GraphNode(id, NodeType.COMPONENT, interaction.label(), attributes, interaction.source(), interaction.confidence(), interactionEvidence(interaction)));
            edge(state, EdgeType.CONTAINS, screenId, id, Confidence.CONFIRMED, interaction.source());
            if (interaction.confidence() == Confidence.UNRESOLVED || !canTriggerEndpoint(interaction.type())) continue;
            for (EndpointMatch match : endpointsFor(interaction, screenId, state)) {
                edge(state, EdgeType.TRIGGERS, id, match.endpointId(), match.confidence(), interaction.source());
                List<String> targetScreens = state.screensByEndpoint.getOrDefault(match.endpointId(), List.of()).stream()
                    .distinct().toList();
                if (targetScreens.size() == 1) edge(state, EdgeType.NAVIGATES_TO, id, targetScreens.get(0),
                    Confidence.INFERRED, interaction.source());
            }
            String next = state.screensByView.get(interaction.target());
            if (next != null) edge(state, EdgeType.NAVIGATES_TO, id, next, Confidence.CONFIRMED, interaction.source());
        }
    }

    private static JspAnalysis.Interaction resolveRelativeJspTarget(JspAnalysis.Interaction interaction,State state) {
        String raw=interaction.target();
        if(raw==null||raw.isBlank()||raw.startsWith("/")||raw.startsWith("#")||raw.contains("://")||raw.startsWith("//")
            ||raw.equals(JspProjectParser.CURRENT_VIEW_TARGET)
            ||raw.contains("${")||raw.contains("#{")||raw.contains("<%")||raw.matches("(?i)^[a-z][a-z0-9+.-]*:.*"))return interaction;
        String screenId=state.screensByView.get(interaction.viewPath());if(screenId==null)return unresolvedRelative(interaction,state,List.of(),"找不到來源畫面");
        List<EndpointReference> routes=state.endpointsByScreen.getOrDefault(screenId,List.of()).stream()
            .collect(java.util.stream.Collectors.toMap(EndpointReference::path,e->e,(a,b)->a,TreeMap::new)).values().stream().toList();
        if(routes.size()!=1) {
            if(routes.isEmpty())return unresolvedRelative(interaction,state,routes,"找不到可證明的 controller 路由");
            List<ApplicationGraph.AnalysisEvidence> proof=new ArrayList<>(interaction.definitionEvidence());
            routes.forEach(route->{GraphNode endpoint=state.nodes.stream().filter(n->n.id().equals(route.id())).findFirst().orElse(null);if(endpoint!=null)proof.add(new ApplicationGraph.AnalysisEvidence(endpoint.source(),"SpringMvcRelativeJspUrl",ApplicationGraph.ResolutionStatus.AMBIGUOUS,"JSP 相對 URL 的來源畫面有多個 controller 路由"));});
            state.diagnostics.add(new Diagnostic("JSP 相對 URL 的 controller 路由不唯一："+raw,Confidence.AMBIGUOUS,interaction.source(),"JSP_ROUTE_AMBIGUOUS",proof));
            return new JspAnalysis.Interaction(interaction.viewPath(),interaction.type(),interaction.label(),raw,interaction.httpMethod(),interaction.source(),Confidence.AMBIGUOUS,interaction.submitsCurrentView(),interaction.originalExpression(),proof,interaction.componentId());
        }
        String route=routes.get(0).path();int slash=route.lastIndexOf('/');String parent=slash<=0?"":route.substring(0,slash);
        String resolved=(parent+"/"+raw).replaceAll("/{2,}","/");
        GraphNode endpoint=state.nodes.stream().filter(n->n.id().equals(routes.get(0).id())).findFirst().orElse(null);
        List<ApplicationGraph.AnalysisEvidence> proof=new ArrayList<>(interaction.definitionEvidence());
        proof.add(new ApplicationGraph.AnalysisEvidence(interaction.source(),"SpringMvcRelativeJspUrl",ApplicationGraph.ResolutionStatus.INFERRED,"相對 URL 以唯一渲染此畫面的 controller 路由目錄解析："+route+" → "+resolved));
        if(endpoint!=null)proof.add(new ApplicationGraph.AnalysisEvidence(endpoint.source(),"SpringMvcRelativeJspUrl",ApplicationGraph.ResolutionStatus.INFERRED,"來源 controller 路由"));
        return new JspAnalysis.Interaction(interaction.viewPath(),interaction.type(),interaction.label(),resolved,interaction.httpMethod(),interaction.source(),Confidence.INFERRED,interaction.submitsCurrentView(),interaction.originalExpression(),proof,interaction.componentId());
    }

    private static JspAnalysis.Interaction unresolvedRelative(JspAnalysis.Interaction interaction,State state,List<EndpointReference> routes,String reason) {
        List<ApplicationGraph.AnalysisEvidence> proof=new ArrayList<>(interaction.definitionEvidence());
        routes.forEach(route->{GraphNode endpoint=state.nodes.stream().filter(n->n.id().equals(route.id())).findFirst().orElse(null);if(endpoint!=null)proof.add(new ApplicationGraph.AnalysisEvidence(endpoint.source(),"SpringMvcRelativeJspUrl",ApplicationGraph.ResolutionStatus.UNRESOLVED,reason));});
        proof.add(new ApplicationGraph.AnalysisEvidence(interaction.source(),"SpringMvcRelativeJspUrl",ApplicationGraph.ResolutionStatus.UNRESOLVED,reason+"；保留原始相對 URL："+interaction.target()));
        state.diagnostics.add(new Diagnostic("JSP 相對 URL 無法以唯一 controller 路由解析："+interaction.target(),Confidence.UNRESOLVED,interaction.source(),"JSP_ROUTE_UNRESOLVED",proof));
        return new JspAnalysis.Interaction(interaction.viewPath(),interaction.type(),interaction.label(),interaction.target(),interaction.httpMethod(),interaction.source(),Confidence.UNRESOLVED,interaction.submitsCurrentView(),interaction.originalExpression(),proof,interaction.componentId());
    }

    private static List<ApplicationGraph.AnalysisEvidence> interactionEvidence(JspAnalysis.Interaction interaction) {
        List<ApplicationGraph.AnalysisEvidence> proof=new ArrayList<>(interaction.definitionEvidence());
        proof.add(new ApplicationGraph.AnalysisEvidence(interaction.source(),"JspProjectParser",interaction.confidence().resolutionStatus(),"原始運算式："+interaction.originalExpression()));return proof;
    }

    private static boolean canTriggerEndpoint(JspAnalysis.InteractionType type) {
        return type == JspAnalysis.InteractionType.NAVIGATION || type == JspAnalysis.InteractionType.FORM_SUBMIT
            || type == JspAnalysis.InteractionType.API_TRIGGER;
    }

    private static List<EndpointMatch> endpointsFor(JspAnalysis.Interaction interaction, String screenId, State state) {
        List<EndpointReference> candidates = interaction.submitsCurrentView()
            ? state.endpointsByScreen.getOrDefault(screenId, List.of())
            : state.endpoints;
        int best = 0;
        List<EndpointMatch> matches = new ArrayList<>();
        for (EndpointReference endpoint : candidates) {
            if (!methodMatches(interaction.httpMethod(), endpoint.httpMethod())) continue;
            int score = interaction.submitsCurrentView() ? 1 : pathScore(interaction.target(), endpoint.path());
            if (score == 0) continue;
            if (score > best) {
                best = score;
                matches.clear();
            }
            if (score == best) {
                Confidence confidence = interaction.submitsCurrentView() || score < 1_000
                    ? Confidence.INFERRED : Confidence.CONFIRMED;
                matches.add(new EndpointMatch(endpoint.id(), confidence));
            }
        }
        return matches;
    }

    private static boolean methodMatches(String requested, String actual) {
        return requested == null || requested.equals("ANY") || actual.equals("ANY") || requested.equals(actual);
    }

    private static int pathScore(String target, String endpoint) {
        if (target.equals(endpoint)) return 1_000;
        String[] targetSegments = segments(target);
        String[] endpointSegments = segments(endpoint);
        if (targetSegments.length > endpointSegments.length) return 0;
        int offset = endpointSegments.length - targetSegments.length;
        if (offset > 0 && target.startsWith("/")) return 0;
        int score = offset == 0 ? 100 : 10;
        for (int index = 0; index < targetSegments.length; index++) {
            String expected = endpointSegments[index + offset];
            String actual = targetSegments[index];
            if (expected.equals(actual)) score += 10;
            else if (dynamicSegment(expected) || dynamicSegment(actual)) score++;
            else return 0;
        }
        return score;
    }

    private static String[] segments(String path) {
        return path.replaceFirst("^/", "").split("/");
    }

    private static boolean dynamicSegment(String segment) {
        return segment.equals("*") || (segment.startsWith("{") && segment.endsWith("}"));
    }

    private static void addJspIncludes(JspAnalysis jsp, State state) {
        for (JspAnalysis.Include include : jsp.includes()) {
            String screenId = state.screensByView.get(include.sourceViewPath());
            String fragmentId = state.fragmentsByPath.get(include.targetPath());
            if (screenId != null && fragmentId != null) edge(state, EdgeType.INCLUDES, screenId, fragmentId, include.confidence(), include.source());
        }
    }

    private static Set<String> includedViewPaths(Path root, JspAnalysis jsp) {
        Set<String> paths = new java.util.HashSet<>();
        for (JspAnalysis.Include include : jsp.includes()) {
            Path source = root.resolve(include.sourceViewPath()).getParent();
            Path candidate = include.targetPath().startsWith("/")
                ? root.resolve("src/main/webapp" + include.targetPath()) : source.resolve(include.targetPath()).normalize();
            if (!SafeProjectFiles.isSafeRegularFile(root, candidate) && include.targetPath().startsWith("/")) candidate = root.resolve(include.targetPath().substring(1));
            if (SafeProjectFiles.isSafeRegularFile(root, candidate)) paths.add(root.relativize(candidate.toAbsolutePath().normalize()).toString().replace('\\', '/'));
        }
        return paths;
    }

    private static java.util.Optional<String> webPath(String path) {
        int marker = path.indexOf("/WEB-INF/");
        return marker < 0 ? java.util.Optional.empty() : java.util.Optional.of(path.substring(marker));
    }
    private static AnnotationExpr annotation(ClassOrInterfaceDeclaration type, String name) { return type.getAnnotations().stream().filter(a -> a.getNameAsString().equals(name)).findFirst().orElse(null); }
    private static AnnotationExpr annotation(MethodDeclaration method, String name) { return method.getAnnotations().stream().filter(a -> a.getNameAsString().equals(name)).findFirst().orElse(null); }
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
        type.getFields().stream().filter(field->field.isFinal()).forEach(field -> field.getVariables().forEach(variable -> variable.getInitializer().filter(Expression::isStringLiteralExpr)
                .ifPresent(value -> values.put(variable.getNameAsString(), value.asStringLiteralExpr().asString()))));
        return values;
    }
    private static String join(String base, String child) { String path = (base + "/" + child).replaceAll("/{2,}", "/"); return path.isEmpty() ? "/" : path.startsWith("/") ? path : "/" + path; }
    private static void addNode(State state, GraphNode node) {
        if(state.nodes.stream().noneMatch(n->n.id().equals(node.id()))) {
            List<ApplicationGraph.AnalysisEvidence> proof=node.evidence().stream().map(e->Set.of("UNKNOWN","LEGACY").contains(e.parser())?
                new ApplicationGraph.AnalysisEvidence(e.source(),"SpringMvcAnalyzer",e.resolution(),e.detail()):e).toList();
            state.nodes.add(new GraphNode(node.id(),node.type(),node.name(),node.attributes(),node.source(),node.confidence(),proof));
        }
    }
    private static void edge(State state, EdgeType type, String from, String to, Confidence confidence, SourceLocation source) { String id = ApplicationGraph.id(NodeType.COMPONENT, type + ":" + from + ":" + to); if (state.edges.stream().noneMatch(e -> e.id().equals(id))) state.edges.add(new Relationship(id,type,from,to,confidence,source,List.of(new ApplicationGraph.AnalysisEvidence(source,"SpringMvcAnalyzer",confidence.resolutionStatus(),null)))); }
    private static final class State {
        private final Path root; private final List<GraphNode> nodes = new ArrayList<>(); private final List<Relationship> edges = new ArrayList<>(); private final List<Diagnostic> diagnostics = new ArrayList<>();
        private final List<ApplicationGraph.ApiContract> apiContracts = new ArrayList<>(); private final ApiContractExtractor contracts;
        private final Map<String, String> endpointByPath = new HashMap<>(); private final List<EndpointReference> endpoints = new ArrayList<>();
        private final Map<String, List<EndpointReference>> endpointsByScreen = new HashMap<>();
        private final Map<String, List<String>> screensByEndpoint = new HashMap<>(); private final Map<String, String> screensByView = new HashMap<>();
        private final Map<String, String> fragmentsByPath = new HashMap<>(); private final List<ViewResolver> viewResolvers = new ArrayList<>();
        private final List<SpringControllerFlow.Pending> returnTargets=new ArrayList<>();
        private String defaultExceptionView;
        private State(Path root, List<Path> javaFiles) { this.root = root; this.contracts = new ApiContractExtractor(root, javaFiles); }
    }
    private record EndpointReference(String id, String path, String httpMethod, String category) { }
    private record EndpointMatch(String endpointId, Confidence confidence) { }
    private record ViewResolver(String prefix, String suffix) { }
}
