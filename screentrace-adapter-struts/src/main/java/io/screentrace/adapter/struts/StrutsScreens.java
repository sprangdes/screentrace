package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsForwards.*;
import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsServletMappings.*;
import static io.screentrace.adapter.struts.StrutsTiles.*;

import io.screentrace.adapter.struts.StrutsModel.Mapping;
import io.screentrace.adapter.struts.StrutsModel.PendingForward;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.*;
import java.nio.file.*;
import java.util.*;
import org.w3c.dom.*;

/** Creates JSP screens and views, welcome-file entries and screen route aliases. */
final class StrutsScreens {
  private StrutsScreens() {}

  static void addView(JspAnalysis.View view, State state) {
    String viewId = ApplicationGraph.id(NodeType.VIEW, view.path());
    addNode(
        state,
        viewId,
        NodeType.VIEW,
        view.path(),
        Map.of("view", view.path()),
        view.source(),
        Confidence.CONFIRMED);
    indexView(state.viewIds, view.path(), viewId);
    if (view.kind() == JspAnalysis.ViewKind.JSP) {
      String id = StableGraphIds.screen(view.path());
      Map<String, String> attributes = new TreeMap<>();
      attributes.put("view", view.path());
      if (view.displayName() != null) attributes.put("messageTitle", view.displayName());
      addNode(
          state,
          id,
          NodeType.SCREEN,
          view.displayName() == null
              ? Path.of(view.path()).getFileName().toString().replaceFirst("\\.jsp$", "")
              : view.displayName(),
          attributes,
          view.source(),
          Confidence.CONFIRMED);
      indexView(state.screens, view.path(), id);
      for (String root : state.inventory.webRoots())
        if (view.path().startsWith(root)
            && !view.path().substring(root.length()).startsWith("WEB-INF/")) {
          addScreenRouteAlias(id, "/" + view.path().substring(root.length()), state);
          addSourceRequestPath(
              id, "/" + view.path().substring(root.length()), view.source(), state);
        }
    } else if (view.kind() == JspAnalysis.ViewKind.HTML
        && view.path().replace('\\', '/').startsWith("src/main/webapp/")) {
      String id = StableGraphIds.screen(view.path());
      String publicUrl = "/" + view.path().substring("src/main/webapp/".length());
      Map<String, String> attributes = new TreeMap<>();
      attributes.put("view", view.path());
      attributes.put("route", publicUrl);
      addNode(
          state,
          id,
          NodeType.SCREEN,
          Path.of(view.path()).getFileName().toString().replaceFirst("\\.(html|htm)$", ""),
          attributes,
          view.source(),
          Confidence.CONFIRMED);
      indexView(state.screens, view.path(), id);
    }
  }

  static String screenForView(String path, State state, SourceLocation source) {
    String resolvedPath = normalizeFacesPath(path, state);
    if (resolvedPath == null) return null;
    String direct = state.screens.get(resolvedPath);
    if (direct != null) return direct;
    String indexed = state.viewIds.get(resolvedPath);
    if (indexed == null) {
      List<String> candidates =
          state.viewIds.entrySet().stream()
              .filter(entry -> entry.getKey().endsWith(resolvedPath))
              .map(Map.Entry::getValue)
              .distinct()
              .toList();
      if (candidates.size() == 1) indexed = candidates.get(0);
    }
    if (indexed != null) {
      String viewPath = state.nodes.get(indexed).attributes().get("view");
      if (viewPath != null)
        return isTilesLayoutPath(viewPath, state) ? null : ensureJspScreen(viewPath, state);
    }
    if (!resolvedPath.startsWith("/")) return null;
    List<String> matches =
        state.nodes.values().stream()
            .filter(
                node ->
                    node.type() == NodeType.SCREEN
                        && node.attributes().getOrDefault("view", "").endsWith(resolvedPath))
            .map(GraphNode::id)
            .distinct()
            .toList();
    if (matches.size() == 1) return matches.get(0);
    if (matches.size() > 1)
      diagnostic(state, "forward JSP 路徑對應多個畫面：" + resolvedPath, source, "STRUTS_FORWARD_AMBIGUOUS");
    return null;
  }

  static String ensureJspScreen(String viewPath, State state) {
    String existing = state.screens.get(viewPath);
    if (existing != null) return existing;
    String viewId = state.viewIds.get(viewPath);
    GraphNode view = viewId == null ? null : state.nodes.get(viewId);
    if (view == null) return null;
    String id = StableGraphIds.screen(viewPath);
    String name = Path.of(viewPath).getFileName().toString().replaceFirst("\\.jsp$", "");
    addNode(
        state,
        id,
        NodeType.SCREEN,
        name,
        Map.of("view", viewPath),
        view.source(),
        Confidence.CONFIRMED);
    indexView(state.screens, viewPath, id);
    return id;
  }

  static void resolveConfiguredForwards(State state) {
    for (PendingForward pending : state.pendingForwards) {
      String unused = unusedDeclaredForward(pending, state);
      if (unused != null) {
        state.diagnostics.add(
            new Diagnostic(
                "forward 已宣告但 Action 程式從未使用，不列為目的頁：" + unused + " → " + pending.target(),
                Confidence.INFERRED,
                pending.source(),
                "STRUTS_FORWARD_UNUSED",
                evidence(
                    pending.source(),
                    Confidence.INFERRED,
                    "Action 程式只以字面名稱呼叫 findForward，且 ActionMapping 未傳出")));
        continue;
      }
      forward(pending.target(), pending.ownerId(), pending.module(), pending.source(), state);
    }
    for (Mapping mapping : state.actionMappings) analyzeForwards(mapping, state);
  }

  static void readWelcomeFiles(State state) {
    for (Path file : state.inventory.files())
      if (file.getFileName().toString().equals("web.xml"))
        try {
          String path = relative(state, file);
          Document document = readXml(file, state);
          for (Element list : StrutsSources.elements(document, "welcome-file-list"))
            for (Element welcome : StrutsSources.elements(list, "welcome-file")) {
              String value = welcome.getTextContent().trim();
              if (value.isBlank()) continue;
              var source = StrutsSources.source(path, welcome);
              String screenId, route = "/";
              if (value.endsWith(".do") || value.contains("/do/")) {
                String normalized = logicalPath(value, "", state);
                List<Mapping> routes =
                    normalized == null
                        ? List.of()
                        : state.routes.getOrDefault(normalized, List.of());
                if (routes.size() != 1) {
                  diagnostic(
                      state,
                      "welcome-file action 路由無法唯一解析：" + value,
                      source,
                      "STRUTS_WELCOME_FILE_UNRESOLVED");
                  continue;
                }
                List<String> targetScreens =
                    resolveMappingScreens(routes.get(0), state, new LinkedHashSet<>(), 0, source);
                if (targetScreens.size() != 1) {
                  diagnostic(
                      state,
                      "welcome-file action 目的畫面無法唯一解析：" + value,
                      source,
                      "STRUTS_WELCOME_FILE_UNRESOLVED");
                  continue;
                }
                screenId = targetScreens.get(0);
                route = publicPath(normalized, routes.get(0).module(), state);
              } else {
                List<String> candidatePaths = new ArrayList<>();
                if (state.screens.containsKey(value)) candidatePaths.add(value);
                for (Path sourceFile : state.inventory.files())
                  if (sourceFile
                      .getFileName()
                      .toString()
                      .equals(Path.of(value).getFileName().toString())) {
                    String candidate = relative(state, sourceFile);
                    if (candidate.endsWith("/" + value) || candidate.equals(value))
                      candidatePaths.add(candidate);
                  }
                List<String> candidates =
                    candidatePaths.stream()
                        .distinct()
                        .map(candidate -> screenForView(candidate, state, source))
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList();
                if (candidates.size() != 1) {
                  diagnostic(
                      state,
                      candidates.isEmpty()
                          ? "welcome-file 未找到唯一 JSP 畫面：" + value
                          : "welcome-file 有多個同名 JSP 畫面：" + value,
                      source,
                      candidates.isEmpty()
                          ? "STRUTS_WELCOME_FILE_UNRESOLVED"
                          : "STRUTS_WELCOME_FILE_AMBIGUOUS");
                  continue;
                }
                screenId = candidates.get(0);
              }
              String
                  handlerId =
                      ApplicationGraph.id(NodeType.HANDLER, path + ":welcome-file:" + value),
                  endpointId = StableGraphIds.endpoint("GET", route);
              addNode(
                  state,
                  endpointId,
                  NodeType.ENDPOINT,
                  "GET " + route,
                  Map.of(
                      "httpMethod",
                      "GET",
                      "path",
                      route,
                      "category",
                      "MVC_SCREEN",
                      "entryBasis",
                      "STATIC_URL",
                      "entrySource",
                      "系統預設首頁（web.xml welcome-file）",
                      "welcomeFile",
                      value),
                  source,
                  Confidence.CONFIRMED);
              addNode(
                  state,
                  handlerId,
                  NodeType.HANDLER,
                  "系統預設首頁",
                  Map.of("entrySource", "web.xml welcome-file"),
                  source,
                  Confidence.CONFIRMED);
              edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, Confidence.CONFIRMED, source);
              edge(state, EdgeType.RENDERS, handlerId, screenId, Confidence.CONFIRMED, source);
              GraphNode old = state.nodes.get(screenId);
              if (old != null) {
                Map<String, String> attributes = new TreeMap<>(old.attributes());
                attributes.put("welcomeFile", value);
                attributes.put("entrySource", "系統預設首頁（web.xml welcome-file）");
                attributes.put("entryBasis", "STATIC_URL");
                List<AnalysisEvidence> evidence = new ArrayList<>(old.evidence());
                evidence.add(
                    new AnalysisEvidence(
                        source,
                        "StrutsProjectAnalyzer",
                        ResolutionStatus.CONFIRMED,
                        "welcome-file=" + value + "；basis=STATIC_URL"));
                state.nodes.put(
                    screenId,
                    new GraphNode(
                        old.id(),
                        old.type(),
                        old.name(),
                        attributes,
                        old.source(),
                        old.confidence(),
                        evidence.stream().distinct().sorted().toList()));
              }
            }
        } catch (Exception error) {
          diagnostic(
              state,
              "web.xml welcome-file 無法解析",
              new SourceLocation(relative(state, file), 1),
              "STRUTS_WELCOME_FILE_UNRESOLVED");
        }
  }

  static void addSourceRequestPath(
      String screenId, String path, SourceLocation source, State state) {
    if (path == null
        || !path.startsWith("/")
        || path.startsWith("//")
        || path.contains("{")
        || path.contains("..")) return;
    var old = state.nodes.get(screenId);
    if (old == null) return;
    Set<String> paths = new TreeSet<>();
    String previous = old.attributes().get("sourceRequestPaths");
    if (previous != null) paths.addAll(Arrays.asList(previous.split("\\u001f")));
    paths.add(path);
    var attrs = new TreeMap<>(old.attributes());
    attrs.put("sourceRequestPaths", String.join("\u001f", paths));
    var proof = new ArrayList<>(old.evidence());
    proof.add(
        new AnalysisEvidence(
            source,
            "StrutsRequestPath",
            ResolutionStatus.INFERRED,
            "來源 forward/redirect 的請求路徑=" + path));
    state.nodes.put(
        old.id(),
        new GraphNode(
            old.id(),
            old.type(),
            old.name(),
            attrs,
            old.source(),
            old.confidence(),
            proof.stream().distinct().sorted().toList()));
  }

  static void addScreenRouteAlias(String screenId, String alias, State state) {
    GraphNode screen = state.nodes.get(screenId);
    if (screen == null || alias == null || alias.isBlank()) return;
    Set<String> aliases = new TreeSet<>();
    String existing = screen.attributes().get("routeAliases");
    if (existing != null && !existing.isBlank())
      aliases.addAll(Arrays.asList(existing.split("\\u001f")));
    aliases.add(alias);
    Map<String, String> attrs = new TreeMap<>(screen.attributes());
    attrs.put("routeAliases", String.join("\u001f", aliases));
    state.nodes.put(
        screenId,
        new GraphNode(
            screen.id(),
            screen.type(),
            screen.name(),
            attrs,
            screen.source(),
            screen.confidence(),
            screen.evidence()));
  }
}
