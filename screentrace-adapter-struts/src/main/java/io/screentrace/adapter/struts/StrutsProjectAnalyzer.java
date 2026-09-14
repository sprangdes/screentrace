package io.screentrace.adapter.struts;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.JspAnalysis;
import io.screentrace.parser.jsp.JspProjectParser;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;
import org.xml.sax.InputSource;

/** Deterministic Struts 1 configuration analysis, including Spring-managed Action bean resolution. */
public final class StrutsProjectAnalyzer {
  public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
    State state = new State(inventory.root(), springBeans(inventory));
    JspAnalysis jsp = new JspProjectParser().analyze(inventory.root(), inventory.files());
    addViews(jsp, state);
    for (Path config : inventory.strutsConfigFiles()) parseConfig(config, state);
    addInteractions(jsp, state);
    state.diagnostics.addAll(jsp.diagnostics());
    return new ApplicationGraph(new ApplicationGraph.Application(inventory.root().getFileName().toString(), inventory.root().toString(), inventory.technologies()),
        state.nodes, state.edges, state.diagnostics);
  }

  private static void addViews(JspAnalysis jsp, State state) {
    for (JspAnalysis.View view : jsp.views()) {
      if (view.kind() == JspAnalysis.ViewKind.JSP) {
        String id = ApplicationGraph.id(NodeType.SCREEN, view.path());
        addNode(state, new GraphNode(id, NodeType.SCREEN, Path.of(view.path()).getFileName().toString().replaceFirst("\\.jsp$", ""),
            Map.of("view", view.path()), view.source(), Confidence.CONFIRMED));
        indexView(state.screensByPath, view.path(), id);
      } else {
        String id = ApplicationGraph.id(NodeType.TEMPLATE_FRAGMENT, view.path());
        addNode(state, new GraphNode(id, NodeType.TEMPLATE_FRAGMENT, Path.of(view.path()).getFileName().toString(),
            Map.of("view", view.path()), view.source(), Confidence.CONFIRMED));
      }
    }
    for (JspAnalysis.TilesDefinition definition : jsp.tilesDefinitions()) {
      String id = ApplicationGraph.id(NodeType.SCREEN, "tiles:" + definition.name());
      addNode(state, new GraphNode(id, NodeType.SCREEN, definition.name(),
          Map.of("view", definition.template(), "tilesDefinition", "true"), definition.source(), Confidence.CONFIRMED));
      state.screensByPath.put(definition.name(), id);
    }
  }

  private static void parseConfig(Path config, State state) {
    String relative = relative(state.root, config);
    try {
      Document document = document(Files.readString(config));
      Map<String, String> forms = forms(document, relative, state);
      NodeList actions = document.getElementsByTagName("action");
      for (int index = 0; index < actions.getLength(); index++) addAction((Element) actions.item(index), relative, forms, state);
      NodeList forwards = document.getElementsByTagName("global-forwards");
      for (int index = 0; index < forwards.getLength(); index++) addGlobalForwards((Element) forwards.item(index), relative, state);
    } catch (Exception exception) {
      state.diagnostics.add(new Diagnostic("Unable to parse Struts configuration: " + exception.getMessage(), Confidence.UNRESOLVED,
          new SourceLocation(relative, 1), "STRUTS_CONFIG_UNRESOLVED", List.of()));
    }
  }

  private static Map<String, String> forms(Document document, String relative, State state) {
    Map<String, String> forms = new HashMap<>();
    NodeList items = document.getElementsByTagName("form-bean");
    for (int index = 0; index < items.getLength(); index++) {
      Element form = (Element) items.item(index);
      String name = form.getAttribute("name");
      String id = ApplicationGraph.id(NodeType.FORM_MODEL, relative + ":" + name);
      addNode(state, new GraphNode(id, NodeType.FORM_MODEL, name, Map.of("class", form.getAttribute("type")),
          new SourceLocation(relative, 1), Confidence.CONFIRMED));
      forms.put(name, id);
    }
    return forms;
  }

  private static void addAction(Element action, String relative, Map<String, String> forms, State state) {
    String path = action.getAttribute("path");
    if (path.isBlank()) return;
    String actionType = action.getAttribute("type");
    String resolvedType = state.springBeans.getOrDefault(actionType, actionType);
    Confidence confidence = resolvedType.isBlank() ? Confidence.UNRESOLVED : Confidence.CONFIRMED;
    SourceLocation source = new SourceLocation(relative, 1);
    String handlerId = ApplicationGraph.id(NodeType.HANDLER, relative + ":" + path);
    Map<String, String> handlerAttributes = new TreeMap<>();
    handlerAttributes.put("framework", "Struts 1");
    handlerAttributes.put("actionType", resolvedType);
    if (!action.getAttribute("name").isBlank()) handlerAttributes.put("formModel", action.getAttribute("name"));
    addNode(state, new GraphNode(handlerId, NodeType.HANDLER, handlerName(resolvedType, path), handlerAttributes, source, confidence));
    if (!action.getAttribute("name").isBlank() && forms.containsKey(action.getAttribute("name"))) {
      edge(state, EdgeType.DECLARED_BY, handlerId, forms.get(action.getAttribute("name")), Confidence.CONFIRMED, source);
    }
    for (String endpointPath : endpointPaths(path)) {
      String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, "ANY " + endpointPath + ":" + handlerId);
      addNode(state, new GraphNode(endpointId, NodeType.ENDPOINT, "ANY " + endpointPath,
          Map.of("httpMethod", "ANY", "path", endpointPath, "category", "STRUTS_ACTION"), source, confidence));
      state.endpointsByPath.put(endpointPath, endpointId);
      edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, confidence, source);
    }
    forward(action.getAttribute("input"), handlerId, source, state);
    NodeList forwards = action.getElementsByTagName("forward");
    for (int index = 0; index < forwards.getLength(); index++) forward(((Element) forwards.item(index)).getAttribute("path"), handlerId, source, state);
  }

  private static void addGlobalForwards(Element group, String relative, State state) {
    NodeList forwards = group.getElementsByTagName("forward");
    for (int index = 0; index < forwards.getLength(); index++) {
      Element forward = (Element) forwards.item(index);
      String name = forward.getAttribute("name");
      String endpointId = ApplicationGraph.id(NodeType.ENDPOINT, relative + ":global:" + name);
      SourceLocation source = new SourceLocation(relative, 1);
      addNode(state, new GraphNode(endpointId, NodeType.ENDPOINT, "GLOBAL " + name,
          Map.of("category", "STRUTS_GLOBAL_FORWARD", "path", name), source, Confidence.CONFIRMED));
      forward(forward.getAttribute("path"), endpointId, source, state);
    }
  }

  private static void forward(String target, String sourceId, SourceLocation source, State state) {
    if (target == null || target.isBlank()) return;
    String screen = state.screensByPath.get(target);
    if (screen == null) {
      state.diagnostics.add(new Diagnostic("Struts forward cannot be resolved to a JSP or Tiles screen: " + target,
          Confidence.UNRESOLVED, source, "STRUTS_FORWARD_UNRESOLVED", List.of()));
      return;
    }
    edge(state, EdgeType.FORWARDS_TO, sourceId, screen, Confidence.CONFIRMED, source);
  }

  private static void addInteractions(JspAnalysis jsp, State state) {
    for (JspAnalysis.Interaction interaction : jsp.interactions()) {
      String screenId = state.screensByPath.get(interaction.viewPath());
      if (screenId == null) continue;
      String id = ApplicationGraph.id(NodeType.COMPONENT, interaction.viewPath() + ":" + interaction.source().line() + ":" + interaction.target());
      addNode(state, new GraphNode(id, NodeType.COMPONENT, interaction.label(),
          Map.of("componentType", interaction.type().name(), "target", interaction.target()), interaction.source(), interaction.confidence()));
      edge(state, EdgeType.CONTAINS, screenId, id, Confidence.CONFIRMED, interaction.source());
      String endpoint = state.endpointsByPath.get(interaction.target());
      if (endpoint != null) edge(state, EdgeType.TRIGGERS, id, endpoint, Confidence.CONFIRMED, interaction.source());
    }
  }

  private static Map<String, String> springBeans(ProjectInventory inventory) {
    Map<String, String> beans = new HashMap<>();
    for (Path file : inventory.springXmlFiles()) try {
      NodeList nodes = document(Files.readString(file)).getElementsByTagName("bean");
      for (int index = 0; index < nodes.getLength(); index++) {
        Element bean = (Element) nodes.item(index);
        if (!bean.getAttribute("id").isBlank() && !bean.getAttribute("class").isBlank()) beans.put(bean.getAttribute("id"), bean.getAttribute("class"));
      }
    } catch (Exception ignored) { }
    return beans;
  }

  private static Document document(String xml) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    factory.setExpandEntityReferences(false);
    var builder = factory.newDocumentBuilder();
    builder.setEntityResolver((publicId, systemId) -> new InputSource(new StringReader("")));
    return builder.parse(new InputSource(new StringReader(xml)));
  }

  private static void indexView(Map<String, String> views, String path, String id) {
    views.put(path, id);
    int marker = path.indexOf("/WEB-INF/");
    if (marker >= 0) views.put(path.substring(marker), id);
  }

  private static List<String> endpointPaths(String path) {
    return path.endsWith(".do") ? List.of(path) : List.of(path, path + ".do");
  }
  private static String handlerName(String type, String path) { return type.isBlank() ? "UnresolvedAction(" + path + ")" : type + ".execute()"; }
  private static String relative(Path root, Path file) { return root.relativize(file).toString().replace('\\', '/'); }
  private static void addNode(State state, GraphNode node) { if (state.nodes.stream().noneMatch(item -> item.id().equals(node.id()))) state.nodes.add(node); }
  private static void edge(State state, EdgeType type, String from, String to, Confidence confidence, SourceLocation source) {
    String id = ApplicationGraph.id(NodeType.COMPONENT, type + ":" + from + ":" + to);
    if (state.edges.stream().noneMatch(item -> item.id().equals(id))) state.edges.add(new Relationship(id, type, from, to, confidence, source));
  }

  private static final class State {
    private final Path root; private final Map<String, String> springBeans; private final List<GraphNode> nodes = new ArrayList<>();
    private final List<Relationship> edges = new ArrayList<>(); private final List<Diagnostic> diagnostics = new ArrayList<>();
    private final Map<String, String> screensByPath = new HashMap<>(); private final Map<String, String> endpointsByPath = new HashMap<>();
    private State(Path root, Map<String, String> springBeans) { this.root = root; this.springBeans = springBeans; }
  }
}
