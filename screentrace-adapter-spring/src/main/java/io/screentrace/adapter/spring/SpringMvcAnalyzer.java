package io.screentrace.adapter.spring;

import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.ArrayInitializerExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.FieldAccessExpr;
import com.github.javaparser.ast.expr.NameExpr;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Diagnostic;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.GraphNode;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.core.ApplicationGraph.Relationship;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.core.StableGraphIds;
import io.screentrace.parser.jsp.JspAnalysis;
import io.screentrace.parser.jsp.JspProjectParser;
import io.screentrace.parser.jsp.MarkupGraphContribution;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/** Static analysis for annotation-based, server-rendered Spring MVC applications. */
public final class SpringMvcAnalyzer {
  /** Default-configured and thread-safe; one per class instead of one per call (RV-705). */
  private static final com.fasterxml.jackson.databind.ObjectMapper SHARED_JSON =
      new com.fasterxml.jackson.databind.ObjectMapper();

  public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
    State state = new State(inventory.root(), inventory.javaFiles());
    state.rootDispatcher = SpringRequestConditions.rootDispatcher(inventory);
    ParsedJavaUnits units = new ParsedJavaUnits(inventory.root());
    for (String message : inventory.diagnostics())
      state.diagnostics.add(
          new Diagnostic(
              message,
              Confidence.UNRESOLVED,
              new SourceLocation(".", 1),
              "SOURCE_LIMIT",
              List.of()));
    JspAnalysis jsp = new JspProjectParser().analyze(inventory.root(), inventory.files());
    Set<String> includedViews = includedViewPaths(inventory.root(), jsp);
    Set<String> tileTemplateViews = tileTemplateViews(jsp);
    for (JspAnalysis.View view : jsp.views())
      if (view.kind() != JspAnalysis.ViewKind.JSPF
          && !includedViews.contains(view.path())
          && webPath(view.path()).map(path -> !tileTemplateViews.contains(path)).orElse(true))
        addJspScreen(inventory.root().resolve(view.path()), state);
    addJspFragments(jsp, includedViews, state);
    addTilesDefinitions(jsp, state);
    addServletErrorPages(inventory, state);
    discoverExceptionView(inventory, state);
    parseXmlControllers(inventory, state);
    addPropertiesViewResolvers(inventory, state);
    addJavaViewResolvers(inventory, state, units);
    for (Path java : inventory.javaFiles()) parseController(java, state, units);
    SpringControllerFlow.resolve(
        state.nodes,
        state.edges,
        state.diagnostics,
        state.returnTargets,
        io.screentrace.parser.jsp.UrlResolution.context(inventory, List.of()));
    // resolve() appends to the edge list directly.
    state.indexEdges();
    foldUnroutedTileBodies(state);
    addJspInteractions(jsp, state);
    addJspIncludes(jsp, state);
    state.diagnostics.addAll(jsp.diagnostics());
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
    graph = MarkupGraphContribution.enrich(graph, jsp);
    graph = SpringFormBindings.bind(graph, inventory, units);
    graph = io.screentrace.parser.jsp.ReactGraphContribution.enrich(graph, inventory);
    var completed =
        SpringControllerFlow.project(
            SpringServerValidation.enrich(
                io.screentrace.parser.jsp.UrlGraphContribution.enrich(
                    io.screentrace.parser.jsp.JavaScriptGraphContribution.enrich(
                        io.screentrace.parser.jsp.ThymeleafFragments.enrich(
                            MarkupGraphContribution.enrich(graph, jsp), inventory),
                        inventory),
                    inventory),
                inventory));
    completed = io.screentrace.parser.jsp.RouteTemplateInference.enrich(completed, inventory);
    completed =
        MarkupGraphContribution.inheritLinkActions(
            SpringWebFlowContribution.enrich(
                SpringSecurityRedirects.enrich(completed, inventory), inventory));
    completed =
        io.screentrace.parser.jsp.UrlGraphContribution.enrich(
            SpringSecurityProcessors.enrich(completed, inventory, units), inventory);
    completed = SpringControllerFlow.project(completed);
    completed = SpringDataSimulation.enrich(completed, inventory, units);
    completed = SpringDtoSimulation.enrich(completed, inventory, units);
    return io.screentrace.core.GraphIntegrityValidator.requireAnalysis(
        JspStateVariants.enrich(
            SpringSubmittedModel.enrich(completed, inventory, units), inventory, units));
  }

  private static void discoverExceptionView(ProjectInventory inventory, State state) {
    for (Path file : inventory.files()) {
      if (!file.toString().endsWith(".xml")) continue;
      try {
        String xml =
            SafeProjectFiles.readUtf8Limited(
                inventory.root(), file, SafeProjectFiles.MAX_XML_FILE_BYTES);
        if (!xml.contains("SimpleMappingExceptionResolver")) continue;
        // The resolver bean's own property, as a value attribute or a nested <value>.
        NodeList beans = SafeProjectFiles.parseXml(xml, false).getElementsByTagName("bean");
        for (int index = 0; index < beans.getLength(); index++) {
          Element bean = (Element) beans.item(index);
          String view = property(bean, "defaultErrorView");
          if (bean.getAttribute("class").endsWith("SimpleMappingExceptionResolver")
              && view != null
              && !view.isBlank()) {
            state.defaultExceptionView = view;
            break;
          }
        }
      } catch (IOException ignored) {
        // A missing optional MVC configuration is represented by the normal unresolved diagnostic
        // path.
      }
    }
  }

  private static void addServletErrorPages(ProjectInventory inventory, State state) {
    for (Path file : inventory.files()) {
      String relative = inventory.root().relativize(file).toString().replace('\\', '/');
      if (!relative.endsWith("WEB-INF/web.xml")) continue;
      try {
        String xml =
            SafeProjectFiles.readUtf8Limited(
                inventory.root(), file, SafeProjectFiles.MAX_XML_FILE_BYTES);
        if (!xml.contains("<error-page")) continue;
        var entries = SafeProjectFiles.parseXml(xml, false).getElementsByTagName("error-page");
        var tags =
            io.screentrace.parser.jsp.MarkupTag.scan(xml).stream()
                .filter(t -> !t.closing() && t.name().equals("error-page"))
                .toList();
        for (int i = 0; i < entries.getLength(); i++) {
          var entry = (Element) entries.item(i);
          String location = childText(entry, "location");
          String screen = location == null ? null : state.screensByView.get(location);
          if (screen == null) continue;
          String code = childText(entry, "error-code");
          String exception = childText(entry, "exception-type");
          String kind = Objects.toString(code, Objects.toString(exception, "default"));
          String id =
              ApplicationGraph.id(
                  NodeType.ENTRY_POINT, relative + ":error:" + kind + ":" + location);
          var source = new SourceLocation(relative, i < tags.size() ? tags.get(i).line() : 1);
          addNode(
              state,
              new GraphNode(
                  id,
                  NodeType.ENTRY_POINT,
                  "Servlet error " + kind,
                  Map.of("category", "SERVLET_ERROR", "error", kind, "location", location),
                  source,
                  Confidence.CONFIRMED));
          edge(state, EdgeType.RENDERS, id, screen, Confidence.CONFIRMED, source);
        }
      } catch (IOException error) {
        state.diagnostics.add(
            new Diagnostic(
                "無法讀取 Servlet 錯誤頁設定", Confidence.UNRESOLVED, new SourceLocation(relative, 1)));
      }
    }
  }

  private static String childText(Element parent, String name) {
    var children = parent.getElementsByTagName(name);
    return children.getLength() == 1 ? children.item(0).getTextContent().strip() : null;
  }

  private static void addJspScreen(Path file, State state) {
    String relative = state.root.relativize(file).toString().replace('\\', '/');
    SourceLocation source = new SourceLocation(relative, 1);
    String id = ApplicationGraph.id(NodeType.SCREEN, relative);
    Map<String, String> attributes = new TreeMap<>();
    attributes.put("view", relative);
    // Public paths are relative to the JSP's own web root, not always src/main/webapp.
    String webRoot = io.screentrace.scanner.WebRoots.rootOf(state.webRoots, relative);
    String publicPath = webRoot == null ? null : relative.substring(webRoot.length() - 1);
    if (publicPath != null
        && !publicPath.toUpperCase(java.util.Locale.ROOT).startsWith("/WEB-INF/"))
      attributes.put("routeAliases", publicPath);
    attributes.put("staticPreview", jspPreview(file, state));
    addNode(
        state,
        new GraphNode(
            id,
            NodeType.SCREEN,
            file.getFileName().toString().replaceFirst("\\.jsp$", ""),
            attributes,
            source,
            Confidence.CONFIRMED));
    state.screensByView.put(relative, id);
    state.screensByView.put("/" + relative, id);
    webPath(relative).ifPresent(path -> state.screensByView.put(path, id));
    if (publicPath != null && !publicPath.startsWith("/WEB-INF/"))
      state.screensByView.put(publicPath, id);
    List<String> prefixes =
        new ArrayList<>(List.of("WEB-INF/jsp/", "WEB-INF/views/", "src/main/resources/templates/"));
    if (webRoot != null) {
      prefixes.add(webRoot + "WEB-INF/jsp/");
      prefixes.add(webRoot + "WEB-INF/views/");
    }
    for (String prefix : prefixes) {
      if (relative.startsWith(prefix))
        state.screensByView.put(
            relative.substring(prefix.length()).replaceFirst("\\.jsp$", ""), id);
    }
    String templateRoot = templateRoot(relative);
    if (templateRoot != null && relative.endsWith(".html")) {
      String logical = relative.substring(templateRoot.length(), relative.length() - 5);
      state.screensByView.put(logical, id);
      state.screensByView.put("/" + logical, id);
    }
  }

  /**
   * The Spring Boot templates folder holding {@code relative}, also inside a module folder
   * ("web/src/main/resources/templates/"); null when the file is not in one (RV-216).
   */
  static String templateRoot(String relative) {
    String marker = "src/main/resources/templates/";
    if (relative.startsWith(marker)) return marker;
    int index = relative.indexOf("/" + marker);
    return index < 0 ? null : relative.substring(0, index + 1) + marker;
  }

  private static String jspPreview(Path file, State state) {
    try {
      String source =
          SafeProjectFiles.readUtf8Limited(
              state.root, file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
      List<String> items = new ArrayList<>();
      List<io.screentrace.parser.jsp.MarkupTag> tags =
          io.screentrace.parser.jsp.MarkupTag.scan(source).stream()
              .filter(tag -> !tag.closing())
              .toList();
      for (var tag : tags) {
        if (items.size() >= 8) break;
        String name = tag.name().toLowerCase(java.util.Locale.ROOT).replaceFirst("^form:", "");
        String field =
            tag.attribute("path") != null ? tag.attribute("path") : tag.attribute("name");
        String type = tag.attribute("type") == null ? "text" : tag.attribute("type").toLowerCase();
        // Hidden inputs and buttons are not fields the user fills in (RV-215).
        if (Set.of("input", "password", "textarea", "select").contains(name)
            && !Set.of("hidden", "submit", "button", "reset", "image").contains(type)
            && field != null
            && !field.isEmpty()) items.add("FIELD:" + field);
      }
      for (var tag : tags) {
        if (items.size() >= 12) break;
        String name = tag.name().toLowerCase(java.util.Locale.ROOT), value = tag.attribute("value");
        if (!name.equals("button") && !name.equals("input")) continue;
        // Only buttons are actions; a text input's default value is not (RV-215).
        String type = tag.attribute("type") == null ? "" : tag.attribute("type").toLowerCase();
        boolean button =
            name.equals("button") || Set.of("submit", "button", "reset", "image").contains(type);
        if (!button) continue;
        if (value != null && !value.isEmpty()) items.add("ACTION:" + value);
        else if ("submit".equalsIgnoreCase(tag.attribute("type"))) {
          int next = source.indexOf('<', tag.end() + 1);
          items.add(
              "ACTION:"
                  + source.substring(tag.end() + 1, next < 0 ? source.length() : next).strip());
        }
      }
      return String.join("|", items);
    } catch (IOException ignored) {
      return "";
    }
  }

  private static void parseController(Path file, State state, ParsedJavaUnits units) {
    String relative = state.root.relativize(file).toString().replace('\\', '/');
    try {
      for (ClassOrInterfaceDeclaration type :
          units.parse(file).findAll(ClassOrInterfaceDeclaration.class)) {
        if (!SpringMappings.isController(type)) continue;
        var declaredBases = SpringMappingPaths.of(annotation(type, "RequestMapping"), type);
        SpringMappingPaths.report(
            declaredBases,
            new SourceLocation(relative, type.getBegin().map(p -> p.line).orElse(1)),
            type.getNameAsString(),
            state.diagnostics);
        List<String> bases = SpringMappingPaths.effective(declaredBases);
        Map<String, String> constants = viewConstants(type);
        for (MethodDeclaration method : type.getMethods()) {
          AnnotationExpr mapping = SpringMappings.mapping(method).orElse(null);
          if (mapping != null)
            addMapping(
                type,
                method,
                mapping,
                relative,
                bases,
                constants,
                SpringMappings.respondsWithBody(type, method),
                state);
          else if (annotation(method, "ExceptionHandler") != null
              && !SpringMappings.respondsWithBody(type, method))
            addExceptionHandler(type, method, relative, constants, state);
        }
      }
    } catch (IOException | RuntimeException exception) {
      state.diagnostics.add(
          new Diagnostic(
              "Unable to parse Java source: " + exception.getMessage(),
              Confidence.UNRESOLVED,
              new SourceLocation(relative, 1)));
    }
  }

  private static void addExceptionHandler(
      ClassOrInterfaceDeclaration type,
      MethodDeclaration method,
      String relative,
      Map<String, String> constants,
      State state) {
    var annotation = annotation(method, "ExceptionHandler");
    var source = new SourceLocation(relative, annotation.getBegin().map(p -> p.line).orElse(1));
    String className = type.getNameAsString();
    String id =
        StableGraphIds.handler(
            relative,
            type.getFullyQualifiedName().orElse(className),
            method.getSignature().asString());
    addNode(
        state,
        new GraphNode(
            id,
            NodeType.HANDLER,
            className + "." + method.getNameAsString() + "()",
            Map.of(
                "class",
                className,
                "method",
                method.getNameAsString(),
                "exceptionMapping",
                annotation.toString()),
            source,
            Confidence.CONFIRMED));
    for (var target : SpringControllerReturns.extract(method, relative, className, constants)) {
      if (target.kind() != SpringControllerReturns.Kind.VIEW) {
        SpringControllerFlow.unresolved(state.diagnostics, target, "@ExceptionHandler 回傳畫面無法證明");
        continue;
      }
      String screen = screenForView(target.value(), target.source(), state);
      var proof = new ArrayList<>(viewEvidence(target, target.value(), screen, state));
      var condition = SpringRequestConditions.forTarget(method, target, state.rootDispatcher);
      if (condition != null) proof.add(condition.evidence(target.source(), null));
      state.addEdge(
          new Relationship(
              ApplicationGraph.id(
                  NodeType.HANDLER,
                  "exception-render:"
                      + id
                      + ":"
                      + screen
                      + ":"
                      + target.source().line()
                      + target.branch()),
              EdgeType.RENDERS,
              id,
              screen,
              Confidence.INFERRED,
              target.source(),
              proof));
    }
  }

  private static void addMapping(
      ClassOrInterfaceDeclaration type,
      MethodDeclaration method,
      AnnotationExpr mapping,
      String relative,
      List<String> bases,
      Map<String, String> constants,
      boolean rest,
      State state) {
    SourceLocation source =
        new SourceLocation(relative, method.getBegin().map(p -> p.line).orElse(1));
    String handlerName = type.getNameAsString() + "." + method.getNameAsString() + "()";
    String handlerId =
        StableGraphIds.handler(
            relative,
            type.getFullyQualifiedName().orElse(type.getNameAsString()),
            method.getSignature().asString());
    addNode(
        state,
        new GraphNode(
            handlerId,
            NodeType.HANDLER,
            handlerName,
            Map.of("class", type.getNameAsString(), "method", method.getNameAsString()),
            source,
            Confidence.CONFIRMED));
    var declaredChildren = SpringMappingPaths.of(mapping, type);
    SpringMappingPaths.report(declaredChildren, source, handlerName, state.diagnostics);
    List<String> children = SpringMappingPaths.effective(declaredChildren);
    var returns =
        rest
            ? List.<SpringControllerReturns.Target>of()
            : SpringControllerReturns.extract(method, relative, type.getNameAsString(), constants);
    List<String> views =
        returns.stream()
            .filter(t -> t.kind() != SpringControllerReturns.Kind.UNKNOWN)
            .map(
                t ->
                    t.kind() == SpringControllerReturns.Kind.VIEW
                        ? t.value()
                        : (t.kind() == SpringControllerReturns.Kind.FORWARD
                                ? "forward:"
                                : "redirect:")
                            + t.value())
            .distinct()
            .toList();
    var unknownReturns =
        returns.stream().filter(t -> t.kind() == SpringControllerReturns.Kind.UNKNOWN).toList();
    if (!unknownReturns.isEmpty()) {
      var old = Objects.requireNonNull(state.nodeById.get(handlerId));
      var attrs = new TreeMap<>(old.attributes());
      attrs.put("unresolvedReturnCount", Integer.toString(unknownReturns.size()));
      var proof = new ArrayList<>(old.evidence());
      unknownReturns.forEach(t -> proof.addAll(t.evidence()));
      state.nodes.remove(old);
      state.addNodeLast(
          new GraphNode(
              old.id(), old.type(), old.name(), attrs, old.source(), old.confidence(), proof));
    }
    for (var target : returns) {
      if (target.kind() == SpringControllerReturns.Kind.UNKNOWN)
        SpringControllerFlow.unresolved(state.diagnostics, target, "無法證明常值或未改寫的回傳物件");
      else if (target.kind() != SpringControllerReturns.Kind.VIEW)
        for (String httpMethod : httpMethods(mapping))
          state.returnTargets.add(new SpringControllerFlow.Pending(handlerId, httpMethod, target));
    }
    for (String httpMethod : httpMethods(mapping))
      for (String base : bases)
        for (String child : children) {
          String path = SpringMappings.join(base, child);
          String endpointId =
              ApplicationGraph.id(NodeType.ENDPOINT, httpMethod + " " + path + ":" + handlerId);
          addNode(
              state,
              new GraphNode(
                  endpointId,
                  NodeType.ENDPOINT,
                  httpMethod + " " + path,
                  Map.of(
                      "httpMethod",
                      httpMethod,
                      "path",
                      path,
                      "category",
                      rest
                          ? "REST_API"
                          : !views.isEmpty()
                                  && views.stream().allMatch(view -> view.startsWith("redirect:"))
                              ? "REDIRECT"
                              : "MVC_SCREEN"),
                  source,
                  Confidence.CONFIRMED));
          EndpointReference endpoint = new EndpointReference(endpointId, path, httpMethod);
          state.endpoints.add(endpoint);
          edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, Confidence.CONFIRMED, source);
          state.apiContracts.add(
              state.contracts.contract(endpointId, method, mapping, source, views));
          for (var target :
              returns.stream()
                  .filter(t -> t.kind() == SpringControllerReturns.Kind.VIEW)
                  .toList()) {
            String view = target.value();
            var condition = SpringRequestConditions.forTarget(method, target, state.rootDispatcher);
            if (condition != null && !condition.accepts(path)) continue;
            String screenId = screenForView(view, target.source(), state);
            Confidence confidence =
                resolvedScreenId(view, state) != null
                        && !target.evidence().stream()
                            .anyMatch(
                                e ->
                                    e.parser().equals("SpringControllerReturns")
                                        && e.resolution()
                                            == ApplicationGraph.ResolutionStatus.INFERRED)
                    ? Confidence.CONFIRMED
                    : Confidence.INFERRED;
            String returnId =
                ApplicationGraph.id(
                    NodeType.COMPONENT,
                    "RENDERS:"
                        + handlerId
                        + ":"
                        + screenId
                        + ":"
                        + target.source().line()
                        + ":"
                        + target.expression()
                        + SpringControllerReturns.branchKey(target)
                        + (condition != null && condition.servletPrefix() != null
                            ? ":" + endpointId
                            : ""));
            if (!state.edgeIndex.containsKey(returnId)) {
              var proof = new ArrayList<>(viewEvidence(target, view, screenId, state));
              if (condition != null) proof.add(condition.evidence(target.source(), endpointId));
              state.addEdge(
                  new Relationship(
                      returnId,
                      EdgeType.RENDERS,
                      handlerId,
                      screenId,
                      confidence,
                      target.source(),
                      proof));
            }
            state
                .endpointsByScreen
                .computeIfAbsent(screenId, ignored -> new ArrayList<>())
                .add(endpoint);
            state
                .screensByEndpoint
                .computeIfAbsent(endpointId, ignored -> new ArrayList<>())
                .add(screenId);
          }
          if (!rest
              && views.isEmpty()
              && throwsException(method)
              && state.defaultExceptionView != null) {
            String screenId = screenForView(state.defaultExceptionView, source, state);
            edge(state, EdgeType.RENDERS, handlerId, screenId, Confidence.CONFIRMED, source);
            state
                .endpointsByScreen
                .computeIfAbsent(screenId, ignored -> new ArrayList<>())
                .add(endpoint);
            state
                .screensByEndpoint
                .computeIfAbsent(endpointId, ignored -> new ArrayList<>())
                .add(screenId);
          }
          // A throwing handler with no default exception view still has no provable view; it
          // used to get no diagnostic at all (RV-210).
          if (!rest
              && views.isEmpty()
              && (!throwsException(method) || state.defaultExceptionView == null))
            state.diagnostics.add(
                new Diagnostic(
                    "Handler return view cannot be resolved statically: " + handlerName,
                    Confidence.UNRESOLVED,
                    source));
        }
  }

  private static List<ApplicationGraph.AnalysisEvidence> viewEvidence(
      SpringControllerReturns.Target target, String view, String screenId, State state) {
    var proof = new ArrayList<>(target.evidence());
    for (var resolver : state.viewResolvers)
      if (Objects.equals(
          state.screensByView.get(
              normalizeResolverPath(resolver.prefix(), view, resolver.suffix())),
          screenId)) proof.addAll(resolver.evidence());
    return proof;
  }

  private static boolean throwsException(MethodDeclaration method) {
    return !method.findAll(com.github.javaparser.ast.stmt.ThrowStmt.class).isEmpty();
  }

  private static String screenForView(String view, SourceLocation source, State state) {
    String known = resolvedScreenId(view, state);
    if (known != null) return known;
    String id = ApplicationGraph.id(NodeType.SCREEN, view);
    addNode(
        state,
        new GraphNode(
            id, NodeType.SCREEN, view, Map.of("view", view), source, Confidence.INFERRED));
    state.diagnostics.add(
        new Diagnostic("No JSP source found for view: " + view, Confidence.UNRESOLVED, source));
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
        Document document =
            xml(
                SafeProjectFiles.readUtf8Limited(
                    inventory.root(), file, SafeProjectFiles.MAX_XML_FILE_BYTES));
        Map<String, Element> beans = beans(document);
        addViewResolvers(beans, state);
        addXmlViewControllers(document, relative, state);
        Map<String, String> routes = xmlRoutes(beans);
        for (Map.Entry<String, String> route : routes.entrySet())
          addXmlController(route.getKey(), route.getValue(), beans, relative, state);
      } catch (Exception exception) {
        state.diagnostics.add(
            new Diagnostic(
                "Unable to parse Spring MVC XML: " + exception.getMessage(),
                Confidence.UNRESOLVED,
                new SourceLocation(relative, 1),
                "SPRING_XML_UNRESOLVED",
                List.of()));
      }
    }
  }

  private static Map<String, Element> beans(Document document) {
    Map<String, Element> beans = new HashMap<>();
    NodeList nodes = document.getElementsByTagName("bean");
    for (int index = 0; index < nodes.getLength(); index++) {
      Element bean = (Element) nodes.item(index);
      String id = bean.getAttribute("id");
      List<String> names = beanNames(bean);
      // A bean declared only by name is found by its first name, as Spring does (RV-205).
      beans.put(
          !id.isBlank() ? id : !names.isEmpty() ? names.get(0) : "__anonymous_" + index, bean);
    }
    return beans;
  }

  private static void addJavaViewResolvers(
      ProjectInventory inventory, State state, ParsedJavaUnits units) throws IOException {
    for (Path file : inventory.javaFiles())
      try {
        var unit = units.parse(file);
        for (var method : unit.findAll(MethodDeclaration.class)) {
          if (annotation(method, "Bean") == null || method.getBody().isEmpty()) continue;
          var returns = method.findAll(com.github.javaparser.ast.stmt.ReturnStmt.class);
          if (returns.size() != 1
              || returns.get(0).getExpression().filter(Expression::isNameExpr).isEmpty()
              || returns.get(0).getParentNode().orElse(null) != method.getBody().get()) continue;
          String name = returns.get(0).getExpression().get().asNameExpr().getNameAsString();
          var definitions =
              method.findAll(com.github.javaparser.ast.body.VariableDeclarator.class).stream()
                  .filter(v -> v.getNameAsString().equals(name))
                  .toList();
          if (definitions.size() != 1) continue;
          var definition = definitions.get(0);
          if (definition.getInitializer().filter(Expression::isObjectCreationExpr).isEmpty())
            continue;
          var creation = definition.getInitializer().get().asObjectCreationExpr();
          if (!creation.getType().getNameAsString().equals("InternalResourceViewResolver")
              || !creation.getArguments().isEmpty()) continue;
          String prefix = "", suffix = "";
          boolean safe = true;
          Set<String> properties = new HashSet<>();
          for (var ref : method.findAll(com.github.javaparser.ast.expr.NameExpr.class))
            if (ref.getNameAsString().equals(name)) {
              var parent = ref.getParentNode().orElse(null);
              if (parent == returns.get(0)) continue;
              if (!(parent instanceof com.github.javaparser.ast.expr.MethodCallExpr call)
                  || call.getScope().orElse(null) != ref
                  || !Set.of("setPrefix", "setSuffix", "setViewClass")
                      .contains(call.getNameAsString())
                  || call.getArguments().size() != 1
                  || call.findAncestor(com.github.javaparser.ast.stmt.ExpressionStmt.class)
                      .filter(e -> e.getParentNode().orElse(null) == method.getBody().get())
                      .isEmpty()
                  || !call.getBegin().orElseThrow().isAfter(definition.getEnd().orElseThrow())
                  || !call.getEnd()
                      .orElseThrow()
                      .isBefore(returns.get(0).getBegin().orElseThrow())) {
                safe = false;
                break;
              }
              String property = call.getNameAsString();
              if (!properties.add(property)) {
                safe = false;
                break;
              }
              if (property.equals("setViewClass")) {
                if (!call.getArgument(0).isClassExpr()
                    || !Set.of(
                            "JstlView",
                            "InternalResourceView",
                            "org.springframework.web.servlet.view.JstlView",
                            "org.springframework.web.servlet.view.InternalResourceView")
                        .contains(call.getArgument(0).asClassExpr().getType().asString()))
                  safe = false;
                continue;
              }
              if (!call.getArgument(0).isStringLiteralExpr()) {
                safe = false;
                break;
              }
              if (property.equals("setPrefix"))
                prefix = call.getArgument(0).asStringLiteralExpr().asString();
              else suffix = call.getArgument(0).asStringLiteralExpr().asString();
            }
          if (safe)
            state.viewResolvers.add(
                new ViewResolver(
                    prefix,
                    suffix,
                    List.of(
                        new ApplicationGraph.AnalysisEvidence(
                            new SourceLocation(
                                inventory.root().relativize(file).toString().replace('\\', '/'),
                                method.getBegin().orElseThrow().line),
                            "SpringViewResolver",
                            ApplicationGraph.ResolutionStatus.INFERRED,
                            "Java Bean InternalResourceViewResolver；prefix="
                                + prefix
                                + "；suffix="
                                + suffix
                                + "；未設定欄位採用空字串預設；未執行 Bean"))));
        }
      } catch (IOException | RuntimeException error) {
        state.diagnostics.add(
            new Diagnostic(
                "Java view resolver 設定無法證明",
                Confidence.UNRESOLVED,
                new SourceLocation(
                    inventory.root().relativize(file).toString().replace('\\', '/'), 1),
                "SPRING_VIEW_RESOLVER_UNRESOLVED",
                List.of()));
      }
  }

  private static void addPropertiesViewResolvers(ProjectInventory inventory, State state) {
    for (Path file : inventory.files())
      // Test resources configure test runs, not the application (RV-219).
      if (file.getFileName().toString().equals("application.properties")
          && !inventory.root().relativize(file).toString().replace('\\', '/').contains("src/test/"))
        try {
          var properties = new java.util.Properties();
          properties.load(
              new java.io.StringReader(
                  SafeProjectFiles.readUtf8Limited(
                      inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES)));
          String prefix = properties.getProperty("spring.mvc.view.prefix"),
              suffix = properties.getProperty("spring.mvc.view.suffix");
          // Spring Boot defaults the one that is not set to an empty string (RV-219).
          if ((prefix != null || suffix != null)
              && (prefix == null || !prefix.contains("${"))
              && (suffix == null || !suffix.contains("${")))
            state.viewResolvers.add(
                new ViewResolver(prefix == null ? "" : prefix, suffix == null ? "" : suffix));
        } catch (IOException error) {
          state.diagnostics.add(
              new Diagnostic(
                  "View resolver 設定無法讀取",
                  Confidence.UNRESOLVED,
                  new SourceLocation(
                      inventory.root().relativize(file).toString().replace('\\', '/'), 1)));
        }
  }

  private static void addViewResolvers(Map<String, Element> beans, State state) {
    for (Element bean : beans.values()) {
      if (!bean.getAttribute("class").contains("InternalResourceViewResolver")) continue;
      String prefix = property(bean, "prefix");
      String suffix = property(bean, "suffix");
      state.viewResolvers.add(
          new ViewResolver(prefix == null ? "" : prefix, suffix == null ? "" : suffix));
    }
  }

  /** The bean's name attribute split as Spring splits it (comma, semicolon or whitespace). */
  private static List<String> beanNames(Element bean) {
    return java.util.Arrays.stream(bean.getAttribute("name").split("[,;\\s]+"))
        .filter(name -> !name.isBlank())
        .toList();
  }

  private static Map<String, String> xmlRoutes(Map<String, Element> beans) {
    Map<String, String> routes = new TreeMap<>();
    for (var entry : beans.entrySet()) {
      Element bean = entry.getValue();
      if (bean.getAttribute("class").contains("SimpleUrlHandlerMapping"))
        routes.putAll(urlMap(bean));
      if (!isXmlController(bean)) continue;
      // BeanNameUrlHandlerMapping maps the id and every name that starts with '/'; the usual form
      // is name="/welcome.htm" (RV-205).
      List<String> urls = new ArrayList<>();
      urls.add(bean.getAttribute("id"));
      urls.addAll(beanNames(bean));
      for (String url : urls) if (url.startsWith("/")) routes.put(url, entry.getKey());
    }
    return routes;
  }

  private static Map<String, String> urlMap(Element bean) {
    Map<String, String> routes = new TreeMap<>();
    NodeList entries = bean.getElementsByTagName("entry");
    for (int index = 0; index < entries.getLength(); index++) {
      Element entry = (Element) entries.item(index);
      String target =
          entry.hasAttribute("value-ref")
              ? entry.getAttribute("value-ref")
              : entry.getAttribute("value");
      if (!entry.getAttribute("key").isBlank() && !target.isBlank())
        routes.put(entry.getAttribute("key"), target);
    }
    NodeList properties = bean.getElementsByTagName("prop");
    for (int index = 0; index < properties.getLength(); index++) {
      Element property = (Element) properties.item(index);
      if (!property.getAttribute("key").isBlank() && !property.getTextContent().isBlank())
        routes.put(property.getAttribute("key"), property.getTextContent().trim());
    }
    return routes;
  }

  private static void addXmlController(
      String path, String beanId, Map<String, Element> beans, String relative, State state) {
    Element bean = beans.get(beanId);
    // A value-ref may name a bean by one of its names rather than its id.
    if (bean == null)
      bean =
          beans.values().stream()
              .filter(candidate -> beanNames(candidate).contains(beanId))
              .findFirst()
              .orElse(null);
    if (bean == null || !isXmlController(bean)) {
      state.diagnostics.add(
          new Diagnostic(
              "Spring XML route has no statically identifiable controller: " + path,
              Confidence.UNRESOLVED,
              new SourceLocation(relative, 1),
              "SPRING_XML_CONTROLLER_UNRESOLVED",
              List.of()));
      return;
    }
    SourceLocation source = new SourceLocation(relative, 1);
    String className = bean.getAttribute("class");
    String handlerId = ApplicationGraph.id(NodeType.HANDLER, relative + ":" + beanId);
    addNode(
        state,
        new GraphNode(
            handlerId,
            NodeType.HANDLER,
            className + ".handleRequest()",
            Map.of("class", className, "bean", beanId),
            source,
            Confidence.CONFIRMED));
    String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, "ANY " + path + ":" + handlerId);
    addNode(
        state,
        new GraphNode(
            endpointId,
            NodeType.ENDPOINT,
            "ANY " + path,
            Map.of("httpMethod", "ANY", "path", path, "category", "MVC_SCREEN"),
            source,
            Confidence.CONFIRMED));
    state.endpoints.add(new EndpointReference(endpointId, path, "ANY"));
    edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, Confidence.CONFIRMED, source);
    String view = property(bean, "viewName");
    if (view == null || view.isBlank()) {
      state.diagnostics.add(
          new Diagnostic(
              "Spring XML controller view cannot be resolved statically: " + beanId,
              Confidence.UNRESOLVED,
              source,
              "SPRING_XML_VIEW_UNRESOLVED",
              List.of()));
    } else {
      String screenId = screenForView(view, source, state);
      edge(state, EdgeType.RENDERS, handlerId, screenId, Confidence.CONFIRMED, source);
      // Like annotation and view-controller routes, so forms without an action and relative links
      // on this screen know the route that opens it (RV-207).
      state
          .endpointsByScreen
          .computeIfAbsent(screenId, ignored -> new ArrayList<>())
          .add(new EndpointReference(endpointId, path, "ANY"));
      state
          .screensByEndpoint
          .computeIfAbsent(endpointId, ignored -> new ArrayList<>())
          .add(screenId);
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
      String handlerId =
          ApplicationGraph.id(NodeType.HANDLER, relative + ":view-controller:" + path);
      addNode(
          state,
          new GraphNode(
              handlerId,
              NodeType.HANDLER,
              "ViewController(" + path + ").handleRequest()",
              Map.of("class", "mvc:view-controller", "view", view),
              source,
              Confidence.CONFIRMED));
      String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, "GET " + path + ":" + handlerId);
      addNode(
          state,
          new GraphNode(
              endpointId,
              NodeType.ENDPOINT,
              "GET " + path,
              Map.of("httpMethod", "GET", "path", path, "category", "MVC_SCREEN"),
              source,
              Confidence.CONFIRMED));
      state.endpoints.add(new EndpointReference(endpointId, path, "GET"));
      edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, Confidence.CONFIRMED, source);
      String screenId = screenForView(view, source, state);
      edge(state, EdgeType.RENDERS, handlerId, screenId, Confidence.CONFIRMED, source);
      state
          .endpointsByScreen
          .computeIfAbsent(screenId, ignored -> new ArrayList<>())
          .add(new EndpointReference(endpointId, path, "GET"));
      state
          .screensByEndpoint
          .computeIfAbsent(endpointId, ignored -> new ArrayList<>())
          .add(screenId);
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
    return SafeProjectFiles.parseXml(source, false);
  }

  private static void addJspFragments(JspAnalysis jsp, Set<String> includedViews, State state) {
    for (JspAnalysis.View view : jsp.views()) {
      if (view.kind() != JspAnalysis.ViewKind.JSPF && !includedViews.contains(view.path()))
        continue;
      String id = ApplicationGraph.id(NodeType.TEMPLATE_FRAGMENT, view.path());
      addNode(
          state,
          new GraphNode(
              id,
              NodeType.TEMPLATE_FRAGMENT,
              Path.of(view.path()).getFileName().toString(),
              Map.of("view", view.path()),
              view.source(),
              Confidence.CONFIRMED));
      state.fragmentsByPath.put(view.path(), id);
      webPath(view.path()).ifPresent(path -> state.fragmentsByPath.put(path, id));
    }
  }

  private static Set<String> tileTemplateViews(JspAnalysis jsp) {
    Set<String> result = new TreeSet<>();
    for (JspAnalysis.TilesDefinition definition : jsp.tilesDefinitions())
      if (definition.template() != null && !definition.template().isBlank())
        result.add(normalizeWebPath(definition.template()));
    return result;
  }

  private static String normalizeWebPath(String path) {
    String normalized = path.replace('\\', '/');
    while (normalized.startsWith("/")) normalized = normalized.substring(1);
    return "/" + normalized;
  }

  private static void addTilesDefinitions(JspAnalysis jsp, State state) {
    Set<String> names =
        jsp.tilesDefinitions().stream()
            .map(JspAnalysis.TilesDefinition::name)
            .collect(java.util.stream.Collectors.toSet());
    Set<String> fragments = new HashSet<>();
    for (JspAnalysis.TilesDefinition definition : jsp.tilesDefinitions()) {
      if (definition.parent() != null && !definition.parent().isBlank())
        fragments.add(definition.parent());
      // A value naming its own definition (e.g. current="login" read via useAttribute) is a string,
      // never a nested insert.
      for (JspAnalysis.TilesAttribute attribute : definition.attributes())
        if (names.contains(attribute.value()) && !attribute.value().equals(definition.name()))
          fragments.add(attribute.value());
    }
    for (JspAnalysis.Include include : jsp.includes())
      if (names.contains(include.targetPath())) fragments.add(include.targetPath());
    Map<String, JspAnalysis.TilesDefinition> byName = new TreeMap<>();
    jsp.tilesDefinitions().forEach(definition -> byName.put(definition.name(), definition));
    for (JspAnalysis.TilesDefinition definition : jsp.tilesDefinitions()) {
      if (fragments.contains(definition.name())) continue;
      String id = ApplicationGraph.id(NodeType.SCREEN, "tiles:" + definition.name());
      Map<String, String> attributes = new TreeMap<>();
      attributes.put("tilesDefinition", "true");
      attributes.put("tilesDefinitionName", definition.name());
      attributes.put("template", definition.template());
      // The static preview renders the template and fills each tiles:insertAttribute slot from
      // tilesAttributes.
      String template = tilesJspPath(definition.template(), definition, jsp);
      if (template != null) attributes.put("view", template);
      attributes.put("tilesAttributes", tilesAttributesJson(definition, byName, jsp));
      addNode(
          state,
          new GraphNode(
              id,
              NodeType.SCREEN,
              definition.name(),
              attributes,
              definition.source(),
              Confidence.CONFIRMED));
      state.screensByView.put(definition.name(), id);
      Set<String> paths = new TreeSet<>();
      collectTilesJspPaths(definition, byName, jsp, paths, new HashSet<>());
      for (String path : paths)
        state.tileOwnersByView.computeIfAbsent(path, ignored -> new TreeSet<>()).add(id);
    }
  }

  /**
   * Resolves a Tiles web path such as /WEB-INF/views/home.jsp to the analyzed project-relative JSP.
   */
  private static String tilesJspPath(
      String value, JspAnalysis.TilesDefinition definition, JspAnalysis jsp) {
    if (value == null
        || value.isBlank()
        || value.contains("${")
        || value.contains("#{")
        || !value.startsWith("/")) return null;
    // Under the web root of the Tiles definition file, then the project root.
    for (String candidate :
        io.screentrace.scanner.WebRoots.candidates(
            io.screentrace.scanner.WebRoots.DEFAULTS, definition.source().file(), value))
      if (jsp.markup().containsKey(candidate)) return candidate;
    return null;
  }

  private static void collectTilesJspPaths(
      JspAnalysis.TilesDefinition definition,
      Map<String, JspAnalysis.TilesDefinition> byName,
      JspAnalysis jsp,
      Set<String> paths,
      Set<String> seen) {
    if (!seen.add(definition.name())) return;
    List<String> targets = new ArrayList<>();
    targets.add(definition.template());
    definition.attributes().forEach(attribute -> targets.add(attribute.value()));
    for (String target : targets) {
      JspAnalysis.TilesDefinition nested = byName.get(target);
      if (nested != null) collectTilesJspPaths(nested, byName, jsp, paths, seen);
      else {
        String path = tilesJspPath(target, definition, jsp);
        if (path != null) paths.add(path);
      }
    }
  }

  /**
   * The resolved put values of a page definition, in the shape the static preview's Tiles expansion
   * reads.
   */
  private static String tilesAttributesJson(
      JspAnalysis.TilesDefinition definition,
      Map<String, JspAnalysis.TilesDefinition> byName,
      JspAnalysis jsp) {
    try {
      return SHARED_JSON.writeValueAsString(tilesContext(definition, byName, jsp, new HashSet<>()));
    } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
      throw new java.io.UncheckedIOException(error);
    }
  }

  private static Map<String, Object> tilesContext(
      JspAnalysis.TilesDefinition definition,
      Map<String, JspAnalysis.TilesDefinition> byName,
      JspAnalysis jsp,
      Set<String> stack) {
    stack.add(definition.name());
    Map<String, Object> attributes = new TreeMap<>();
    for (JspAnalysis.TilesAttribute attribute : definition.attributes()) {
      if (attribute.list() != null) {
        attributes.put(attribute.name(), Map.of("list", attribute.list()));
        continue;
      }
      String value = attribute.value() == null ? "" : attribute.value();
      JspAnalysis.TilesDefinition nested =
          value.equals(definition.name()) ? null : byName.get(value);
      if (nested != null && !stack.contains(value))
        attributes.put(
            attribute.name(), Map.of("definition", tilesContext(nested, byName, jsp, stack)));
      else if (nested != null) attributes.put(attribute.name(), Map.of("unresolved", value));
      else if (value.startsWith("/") || value.matches("(?i).*\\.(jspf?|html?)$")) {
        String path = tilesJspPath(value, definition, jsp);
        attributes.put(
            attribute.name(), path == null ? Map.of("unresolved", value) : Map.of("path", path));
      } else attributes.put(attribute.name(), Map.of("value", value));
    }
    stack.remove(definition.name());
    Map<String, Object> context = new TreeMap<>();
    String template = tilesJspPath(definition.template(), definition, jsp);
    context.put("template", template == null ? definition.template() : template);
    context.put("attributes", attributes);
    return context;
  }

  /**
   * A JSP that only fills a Tiles page definition is part of that page, not a screen of its own.
   * Once controller returns are resolved, such body screens that nothing renders or forwards to are
   * folded into their Tiles screens.
   */
  private static void foldUnroutedTileBodies(State state) {
    for (var entry : state.tileOwnersByView.entrySet()) {
      String bodyScreen = state.screensByView.get(entry.getKey());
      if (bodyScreen == null || entry.getValue().contains(bodyScreen)) continue;
      GraphNode body = state.nodeById.get(bodyScreen);
      if (body == null
          || body.type() != NodeType.SCREEN
          || "true".equals(body.attributes().get("tilesDefinition"))) continue;
      if (state.edges.stream()
          .anyMatch(e -> e.to().equals(bodyScreen) || e.from().equals(bodyScreen))) continue;
      state.nodes.removeIf(n -> n.id().equals(bodyScreen));
      state.nodeById.remove(bodyScreen);
      state.screensByView.values().removeIf(screen -> screen.equals(bodyScreen));
    }
  }

  private static void addJspInteractions(JspAnalysis jsp, State state) {
    for (JspAnalysis.Interaction rawInteraction : jsp.interactions()) {
      Set<String> owners = ownersForView(rawInteraction.viewPath(), state);
      if (owners.isEmpty()) continue;
      JspAnalysis.Interaction interaction = resolveRelativeJspTarget(rawInteraction, owners, state);
      for (String screenId : owners) addJspInteraction(interaction, screenId, state);
    }
  }

  private static Set<String> ownersForView(String view, State state) {
    Set<String> owners = new TreeSet<>(state.tileOwnersByView.getOrDefault(view, Set.of()));
    String direct = state.screensByView.get(view);
    if (direct != null) owners.add(direct);
    return owners;
  }

  private static void addJspInteraction(
      JspAnalysis.Interaction interaction, String screenId, State state) {
    String id =
        interaction.componentId() != null
            ? interaction.componentId()
            : ApplicationGraph.id(
                NodeType.COMPONENT,
                interaction.viewPath()
                    + ":"
                    + interaction.source().line()
                    + ":"
                    + interaction.target());
    Map<String, String> attributes = new TreeMap<>();
    attributes.put("componentType", interaction.type().name());
    attributes.put("target", interaction.target());
    attributes.put("targetStatus", interaction.confidence().name());
    if (interaction.originalExpression() != null)
      attributes.put("originalExpression", interaction.originalExpression());
    if (!interaction.viewPath().equals(interaction.source().file()))
      attributes.put("includedBy", interaction.viewPath());
    if (interaction.httpMethod() != null) attributes.put("httpMethod", interaction.httpMethod());
    addNode(
        state,
        new GraphNode(
            id,
            NodeType.COMPONENT,
            interaction.label(),
            attributes,
            interaction.source(),
            interaction.confidence(),
            interactionEvidence(interaction)));
    edge(state, EdgeType.CONTAINS, screenId, id, Confidence.CONFIRMED, interaction.source());
    if (interaction.confidence() == Confidence.UNRESOLVED
        || !canTriggerEndpoint(interaction.type())
        || interaction.definitionEvidence().stream()
            .anyMatch(
                e ->
                    e.parser().equals("JspConditionalUrl")
                        || e.parser().equals("JspUrlVariableResolver")
                            && e.resolution() == ApplicationGraph.ResolutionStatus.INFERRED
                            && interaction.target().contains("{"))) return;
    for (EndpointMatch match : endpointsFor(interaction, screenId, state)) {
      edge(
          state,
          EdgeType.TRIGGERS,
          id,
          match.endpointId(),
          match.confidence(),
          interaction.source());
      List<String> targetScreens =
          state.screensByEndpoint.getOrDefault(match.endpointId(), List.of()).stream()
              .distinct()
              .toList();
      if (targetScreens.size() == 1)
        edge(
            state,
            EdgeType.NAVIGATES_TO,
            id,
            targetScreens.get(0),
            Confidence.INFERRED,
            interaction.source());
    }
    String next = state.screensByView.get(interaction.target());
    // A template's logical name is a view resolver key, never proof of a public URL.
    String direct = next;
    GraphNode directNode = next == null ? null : state.nodeById.get(direct);
    if (directNode != null
        && directNode
            .attributes()
            .getOrDefault("view", "")
            .transform(view -> templateRoot(view) != null)) next = null;
    if (next != null)
      edge(state, EdgeType.NAVIGATES_TO, id, next, Confidence.CONFIRMED, interaction.source());
  }

  /**
   * The request path with "." and ".." segments applied and repeated slashes collapsed, keeping any
   * query or fragment; null when ".." would leave the application root (RV-208).
   */
  static String normalizedRequestPath(String path) {
    int boundary = path.length();
    for (char mark : new char[] {'?', '#'}) {
      int index = path.indexOf(mark);
      if (index >= 0) boundary = Math.min(boundary, index);
    }
    String suffix = path.substring(boundary);
    Deque<String> segments = new ArrayDeque<>();
    String[] parts = path.substring(0, boundary).split("/", -1);
    for (int index = 0; index < parts.length; index++) {
      String part = parts[index];
      boolean last = index == parts.length - 1;
      if (part.equals("..")) {
        if (segments.isEmpty()) return null;
        segments.removeLast();
        if (last) segments.addLast("");
      } else if (part.equals(".")) {
        if (last) segments.addLast("");
      } else if (!part.isEmpty() || last) segments.addLast(part);
    }
    return "/" + String.join("/", segments) + suffix;
  }

  private static JspAnalysis.Interaction resolveRelativeJspTarget(
      JspAnalysis.Interaction interaction, Set<String> owners, State state) {
    String raw = interaction.target();
    if (raw == null
        || raw.isBlank()
        || raw.startsWith("/")
        || raw.startsWith("#")
        || raw.contains("://")
        || raw.startsWith("//")
        || raw.equals(JspProjectParser.CURRENT_VIEW_TARGET)
        || raw.contains("${")
        || raw.contains("#{")
        || raw.contains("<%")
        || raw.matches("(?i)^[a-z][a-z0-9+.-]*:.*")) return interaction;
    List<EndpointReference> routes =
        owners.stream()
            .flatMap(screen -> state.endpointsByScreen.getOrDefault(screen, List.of()).stream())
            .collect(
                java.util.stream.Collectors.toMap(
                    EndpointReference::path, e -> e, (a, b) -> a, TreeMap::new))
            .values()
            .stream()
            .toList();
    if (routes.size() != 1) {
      if (routes.isEmpty())
        return unresolvedRelative(interaction, state, routes, "找不到可證明的 controller 路由");
      List<ApplicationGraph.AnalysisEvidence> proof =
          new ArrayList<>(interaction.definitionEvidence());
      routes.forEach(
          route -> {
            GraphNode endpoint = state.nodeById.get(route.id());
            if (endpoint != null)
              proof.add(
                  new ApplicationGraph.AnalysisEvidence(
                      endpoint.source(),
                      "SpringMvcRelativeJspUrl",
                      ApplicationGraph.ResolutionStatus.AMBIGUOUS,
                      "JSP 相對 URL 的來源畫面有多個 controller 路由"));
          });
      state.diagnostics.add(
          new Diagnostic(
              "JSP 相對 URL 的 controller 路由不唯一：" + raw,
              Confidence.AMBIGUOUS,
              interaction.source(),
              "JSP_ROUTE_AMBIGUOUS",
              proof));
      return new JspAnalysis.Interaction(
          interaction.viewPath(),
          interaction.type(),
          interaction.label(),
          raw,
          interaction.httpMethod(),
          interaction.source(),
          Confidence.AMBIGUOUS,
          interaction.submitsCurrentView(),
          interaction.originalExpression(),
          proof,
          interaction.componentId());
    }
    String route = routes.get(0).path();
    int slash = route.lastIndexOf('/');
    String parent = slash <= 0 ? "" : route.substring(0, slash);
    String resolved = normalizedRequestPath(parent + "/" + raw);
    if (resolved == null) return unresolvedRelative(interaction, state, routes, "相對路徑超出應用程式根目錄");
    GraphNode endpoint = state.nodeById.get(routes.get(0).id());
    List<ApplicationGraph.AnalysisEvidence> proof =
        new ArrayList<>(interaction.definitionEvidence());
    proof.add(
        new ApplicationGraph.AnalysisEvidence(
            interaction.source(),
            "SpringMvcRelativeJspUrl",
            ApplicationGraph.ResolutionStatus.INFERRED,
            "相對 URL 以唯一渲染此畫面的 controller 路由目錄解析：" + route + " → " + resolved));
    if (endpoint != null)
      proof.add(
          new ApplicationGraph.AnalysisEvidence(
              endpoint.source(),
              "SpringMvcRelativeJspUrl",
              ApplicationGraph.ResolutionStatus.INFERRED,
              "來源 controller 路由"));
    return new JspAnalysis.Interaction(
        interaction.viewPath(),
        interaction.type(),
        interaction.label(),
        resolved,
        interaction.httpMethod(),
        interaction.source(),
        Confidence.INFERRED,
        interaction.submitsCurrentView(),
        interaction.originalExpression(),
        proof,
        interaction.componentId());
  }

  private static JspAnalysis.Interaction unresolvedRelative(
      JspAnalysis.Interaction interaction,
      State state,
      List<EndpointReference> routes,
      String reason) {
    List<ApplicationGraph.AnalysisEvidence> proof =
        new ArrayList<>(interaction.definitionEvidence());
    routes.forEach(
        route -> {
          GraphNode endpoint = state.nodeById.get(route.id());
          if (endpoint != null)
            proof.add(
                new ApplicationGraph.AnalysisEvidence(
                    endpoint.source(),
                    "SpringMvcRelativeJspUrl",
                    ApplicationGraph.ResolutionStatus.UNRESOLVED,
                    reason));
        });
    proof.add(
        new ApplicationGraph.AnalysisEvidence(
            interaction.source(),
            "SpringMvcRelativeJspUrl",
            ApplicationGraph.ResolutionStatus.UNRESOLVED,
            reason + "；保留原始相對 URL：" + interaction.target()));
    state.diagnostics.add(
        new Diagnostic(
            "JSP 相對 URL 無法以唯一 controller 路由解析：" + interaction.target(),
            Confidence.UNRESOLVED,
            interaction.source(),
            "JSP_ROUTE_UNRESOLVED",
            proof));
    return new JspAnalysis.Interaction(
        interaction.viewPath(),
        interaction.type(),
        interaction.label(),
        interaction.target(),
        interaction.httpMethod(),
        interaction.source(),
        Confidence.UNRESOLVED,
        interaction.submitsCurrentView(),
        interaction.originalExpression(),
        proof,
        interaction.componentId());
  }

  private static List<ApplicationGraph.AnalysisEvidence> interactionEvidence(
      JspAnalysis.Interaction interaction) {
    List<ApplicationGraph.AnalysisEvidence> proof =
        new ArrayList<>(interaction.definitionEvidence());
    proof.add(
        new ApplicationGraph.AnalysisEvidence(
            interaction.source(),
            "JspProjectParser",
            interaction.confidence().resolutionStatus(),
            "原始運算式：" + interaction.originalExpression()));
    return proof;
  }

  private static boolean canTriggerEndpoint(JspAnalysis.InteractionType type) {
    return type == JspAnalysis.InteractionType.NAVIGATION
        || type == JspAnalysis.InteractionType.FORM_SUBMIT
        || type == JspAnalysis.InteractionType.API_TRIGGER;
  }

  private static List<EndpointMatch> endpointsFor(
      JspAnalysis.Interaction interaction, String screenId, State state) {
    List<EndpointReference> candidates =
        interaction.submitsCurrentView()
            ? state.endpointsByScreen.getOrDefault(screenId, List.of())
            : state.endpoints;
    if (!interaction.submitsCurrentView()) {
      List<EndpointMatch> exact = exactEndpoints(interaction, state);
      if (exact != null) return exact;
    }
    int best = 0;
    List<EndpointMatch> matches = new ArrayList<>();
    for (EndpointReference endpoint : candidates) {
      if (!methodMatches(interaction.httpMethod(), endpoint.httpMethod())) continue;
      int score =
          interaction.submitsCurrentView() ? 1 : pathScore(interaction.target(), endpoint.path());
      if (score == 0) continue;
      if (score > best) {
        best = score;
        matches.clear();
      }
      if (score == best) {
        Confidence confidence =
            interaction.submitsCurrentView() || score < 1_000
                ? Confidence.INFERRED
                : Confidence.CONFIRMED;
        matches.add(new EndpointMatch(endpoint.id(), confidence));
      }
    }
    return matches;
  }

  /**
   * The endpoints whose path equals the request path, or null when none do. An equal path scores
   * 1000 and any other path at most 100 + 10 per segment, so below 90 segments the equal ones are
   * exactly the best matches and the full scoring scan can be skipped (RV-702).
   */
  private static List<EndpointMatch> exactEndpoints(
      JspAnalysis.Interaction interaction, State state) {
    String target = QUERY_OR_FRAGMENT.matcher(interaction.target()).replaceFirst("");
    if (target.isEmpty() || segments(target).length >= 90) return null;
    if (state.endpointsIndexed != state.endpoints.size()) {
      state.endpointsByPath.clear();
      for (EndpointReference endpoint : state.endpoints)
        state
            .endpointsByPath
            .computeIfAbsent(endpoint.path(), ignored -> new ArrayList<>())
            .add(endpoint);
      state.endpointsIndexed = state.endpoints.size();
    }
    List<EndpointMatch> matches = new ArrayList<>();
    for (EndpointReference endpoint : state.endpointsByPath.getOrDefault(target, List.of()))
      if (methodMatches(interaction.httpMethod(), endpoint.httpMethod()))
        matches.add(new EndpointMatch(endpoint.id(), Confidence.CONFIRMED));
    return matches.isEmpty() ? null : matches;
  }

  private static boolean methodMatches(String requested, String actual) {
    return requested == null
        || requested.equals("ANY")
        || actual.equals("ANY")
        || requested.equals(actual);
  }

  // pathScore runs for every interaction against every endpoint (RV-706).
  private static final java.util.regex.Pattern QUERY_OR_FRAGMENT =
      java.util.regex.Pattern.compile("[?#].*$");

  private static int pathScore(String target, String endpoint) {
    // Query strings and fragments never take part in Spring request mapping.
    target = QUERY_OR_FRAGMENT.matcher(target).replaceFirst("");
    if (target.isEmpty()) return 0;
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
    return (path.startsWith("/") ? path.substring(1) : path).split("/");
  }

  private static boolean dynamicSegment(String segment) {
    return segment.equals("*") || (segment.startsWith("{") && segment.endsWith("}"));
  }

  private static void addJspIncludes(JspAnalysis jsp, State state) {
    for (JspAnalysis.Include include : jsp.includes()) {
      String fragmentId = state.fragmentsByPath.get(include.targetPath());
      if (fragmentId != null)
        for (String screenId : ownersForView(include.sourceViewPath(), state))
          edge(
              state,
              EdgeType.INCLUDES,
              screenId,
              fragmentId,
              include.confidence(),
              include.source());
    }
  }

  private static Set<String> includedViewPaths(Path root, JspAnalysis jsp) {
    Set<String> paths = new java.util.HashSet<>();
    List<String> webRoots = io.screentrace.scanner.WebRoots.of(root);
    for (JspAnalysis.Include include : jsp.includes()) {
      List<Path> candidates = new ArrayList<>();
      if (include.targetPath().startsWith("/"))
        for (String path :
            io.screentrace.scanner.WebRoots.candidates(
                webRoots, include.sourceViewPath(), include.targetPath()))
          candidates.add(root.resolve(path));
      else {
        Path source = root.resolve(include.sourceViewPath()).getParent();
        candidates.add((source == null ? root : source).resolve(include.targetPath()).normalize());
      }
      for (Path candidate : candidates)
        if (SafeProjectFiles.isSafeRegularFile(root, candidate)) {
          paths.add(
              root.relativize(candidate.toAbsolutePath().normalize())
                  .toString()
                  .replace('\\', '/'));
          break;
        }
    }
    return paths;
  }

  private static java.util.Optional<String> webPath(String path) {
    int marker = path.indexOf("/WEB-INF/");
    return marker < 0 ? java.util.Optional.empty() : java.util.Optional.of(path.substring(marker));
  }

  private static AnnotationExpr annotation(ClassOrInterfaceDeclaration type, String name) {
    return type.getAnnotations().stream()
        .filter(a -> a.getNameAsString().equals(name))
        .findFirst()
        .orElse(null);
  }

  private static AnnotationExpr annotation(MethodDeclaration method, String name) {
    return method.getAnnotations().stream()
        .filter(a -> a.getNameAsString().equals(name))
        .findFirst()
        .orElse(null);
  }

  /**
   * Each HTTP method a mapping accepts, in declaration order; "ANY" when none is declared. {@code
   * method = {GET, POST}} gives two methods instead of the text "{ GET, POST }" (RV-202).
   */
  static List<String> httpMethods(AnnotationExpr mapping) {
    if (!mapping.getNameAsString().equals("RequestMapping"))
      return List.of(
          Map.of(
                  "GetMapping",
                  "GET",
                  "PostMapping",
                  "POST",
                  "PutMapping",
                  "PUT",
                  "DeleteMapping",
                  "DELETE",
                  "PatchMapping",
                  "PATCH")
              .getOrDefault(mapping.getNameAsString(), "ANY"));
    if (!(mapping instanceof NormalAnnotationExpr normal)) return List.of("ANY");
    var value =
        normal.getPairs().stream()
            .filter(p -> p.getNameAsString().equals("method"))
            .map(p -> p.getValue())
            .findFirst();
    if (value.isEmpty()) return List.of("ANY");
    List<Expression> items =
        value.get() instanceof ArrayInitializerExpr array
            ? array.getValues()
            : List.of(value.get());
    List<String> methods = new ArrayList<>();
    for (Expression item : items) {
      String name =
          item instanceof FieldAccessExpr field
              ? field.getNameAsString()
              : item instanceof NameExpr simple ? simple.getNameAsString() : null;
      if (name == null || !name.matches("[A-Z]+")) return List.of("ANY");
      if (!methods.contains(name)) methods.add(name);
    }
    return methods.isEmpty() ? List.of("ANY") : List.copyOf(methods);
  }

  private static Map<String, String> viewConstants(ClassOrInterfaceDeclaration type) {
    Map<String, String> values = new HashMap<>();
    type.getFields().stream()
        .filter(field -> field.isFinal())
        .forEach(
            field ->
                field
                    .getVariables()
                    .forEach(
                        variable ->
                            variable
                                .getInitializer()
                                .filter(Expression::isStringLiteralExpr)
                                .ifPresent(
                                    value ->
                                        values.put(
                                            variable.getNameAsString(),
                                            value.asStringLiteralExpr().asString()))));
    return values;
  }

  private static void addNode(State state, GraphNode node) {
    if (!state.nodeById.containsKey(node.id())) {
      List<ApplicationGraph.AnalysisEvidence> proof =
          node.evidence().stream()
              .map(
                  e ->
                      Set.of("UNKNOWN", "LEGACY").contains(e.parser())
                          ? new ApplicationGraph.AnalysisEvidence(
                              e.source(), "SpringMvcAnalyzer", e.resolution(), e.detail())
                          : e)
              .toList();
      state.addNodeLast(
          new GraphNode(
              node.id(),
              node.type(),
              node.name(),
              node.attributes(),
              node.source(),
              node.confidence(),
              proof));
    }
  }

  private static void edge(
      State state,
      EdgeType type,
      String from,
      String to,
      Confidence confidence,
      SourceLocation source) {
    String id = ApplicationGraph.id(NodeType.COMPONENT, type + ":" + from + ":" + to);
    var proof =
        new ApplicationGraph.AnalysisEvidence(
            source, "SpringMvcAnalyzer", confidence.resolutionStatus(), null);
    Integer index = state.edgeIndex.get(id);
    if (index != null) {
      Relationship existing = state.edges.get(index);
      // A proof for an edge first recorded as inferred upgrades it, keeping both pieces of
      // evidence (RV-206); a weaker proof never downgrades an existing edge.
      if (confidence == Confidence.CONFIRMED && existing.confidence() != Confidence.CONFIRMED) {
        List<ApplicationGraph.AnalysisEvidence> evidence = new ArrayList<>(existing.evidence());
        evidence.add(proof);
        state.edges.set(
            index,
            new Relationship(
                id, type, from, to, confidence, existing.source(), List.copyOf(evidence)));
      }
      return;
    }
    state.addEdge(new Relationship(id, type, from, to, confidence, source, List.of(proof)));
  }

  private static final class State {
    private final Path root;
    private final List<String> webRoots;
    private final List<GraphNode> nodes = new ArrayList<>();
    private final List<Relationship> edges = new ArrayList<>();
    // Id lookups for nodes and edges, kept with the lists: deduplicating by scanning them made a
    // 300-controller project take more than ten minutes (RV-702). Edges are only appended.
    private final Map<String, GraphNode> nodeById = new HashMap<>();
    private final Map<String, Integer> edgeIndex = new HashMap<>();

    private void addNodeLast(GraphNode node) {
      nodes.add(node);
      nodeById.put(node.id(), node);
    }

    private void indexEdges() {
      for (int index = 0; index < edges.size(); index++)
        edgeIndex.putIfAbsent(edges.get(index).id(), index);
    }

    private void addEdge(Relationship edge) {
      edgeIndex.putIfAbsent(edge.id(), edges.size());
      edges.add(edge);
    }

    private final List<Diagnostic> diagnostics = new ArrayList<>();
    private final List<ApplicationGraph.ApiContract> apiContracts = new ArrayList<>();
    private final ApiContractExtractor contracts;
    private final List<EndpointReference> endpoints = new ArrayList<>();
    private final Map<String, List<EndpointReference>> endpointsByScreen = new HashMap<>();
    // endpoints by path, rebuilt when endpoints were added since (they are only appended).
    private final Map<String, List<EndpointReference>> endpointsByPath = new HashMap<>();
    private int endpointsIndexed = -1;
    private final Map<String, List<String>> screensByEndpoint = new HashMap<>();
    private final Map<String, String> screensByView = new HashMap<>();
    private final Map<String, String> fragmentsByPath = new HashMap<>();
    private final List<ViewResolver> viewResolvers = new ArrayList<>();
    private final Map<String, Set<String>> tileOwnersByView = new TreeMap<>();
    private boolean rootDispatcher;
    private final List<SpringControllerFlow.Pending> returnTargets = new ArrayList<>();
    private String defaultExceptionView;

    private State(Path root, List<Path> javaFiles) {
      this.root = root;
      this.webRoots = io.screentrace.scanner.WebRoots.of(root);
      this.contracts = new ApiContractExtractor(root, javaFiles);
    }
  }

  private record EndpointReference(String id, String path, String httpMethod) {}

  private record EndpointMatch(String endpointId, Confidence confidence) {}

  private record ViewResolver(
      String prefix, String suffix, List<ApplicationGraph.AnalysisEvidence> evidence) {
    ViewResolver(String prefix, String suffix) {
      this(prefix, suffix, List.of());
    }
  }
}
