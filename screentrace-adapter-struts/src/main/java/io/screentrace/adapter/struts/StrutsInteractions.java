package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsConfigParser.*;
import static io.screentrace.adapter.struts.StrutsControls.*;
import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsServletMappings.*;
import static io.screentrace.adapter.struts.StrutsWildcards.*;

import io.screentrace.adapter.struts.StrutsModel.Control;
import io.screentrace.adapter.struts.StrutsModel.Mapping;
import io.screentrace.adapter.struts.StrutsModel.ScreenLoadCall;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.adapter.struts.StrutsModel.WildcardMatch;
import io.screentrace.adapter.struts.StrutsModel.WildcardResolution;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.*;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/** Connects JSP markup (links, forms, screen-load tags, includes) to Struts actions. */
final class StrutsInteractions {
  private StrutsInteractions() {}

  static void addInteractions(JspAnalysis jsp, State state) throws IOException {
    Map<String, List<Control>> byView = new TreeMap<>();
    Map<String, List<ScreenLoadCall>> loadCallsByView = new TreeMap<>();
    var menus =
        io.screentrace.parser.jsp.StrutsMenus.load(state.inventory.root(), state.inventory.files());
    for (Path file : state.inventory.files())
      if (file.toString().endsWith(".jsp")
          || file.toString().endsWith(".jspf")
          || file.toString().endsWith(".html")
          || file.toString().endsWith(".htm")) {
        String path = relative(state, file);
        List<Control> controls = new ArrayList<>();
        try {
          String text =
              menus.expand(
                  SafeProjectFiles.readUtf8Limited(
                      state.inventory.root(), file, SafeProjectFiles.MAX_JSP_FILE_BYTES));
          String action = null, formGroup = null, activeModule = null;
          Map<String, Integer> occurrences = new HashMap<>();
          for (MarkupTag tag : MarkupTag.scan(text)) {
            String name = tag.name().toLowerCase(Locale.ROOT);
            if (tag.closing()) {
              if (Set.of("html:form", "html-el:form", "form", "form:form").contains(name)) {
                action = null;
                formGroup = null;
                activeModule = null;
              }
              continue;
            }
            var source = new SourceLocation(path, tag.line());
            if (isScreenLoadActionTag(name, tag)) {
              String raw = screenLoadTarget(name, tag);
              String module = moduleFor(path, state);
              String explicit = tag.attribute("module");
              if (explicit != null && !explicit.isBlank()) module = explicit;
              String target = raw;
              if (target != null && tag.attribute("action") != null)
                target = normalizeStrutsAction(target, module, state);
              else if (target != null) target = resolveRelativeJspUrl(path, target);
              if (target != null)
                loadCallsByView
                    .computeIfAbsent(path, ignored -> new ArrayList<>())
                    .add(new ScreenLoadCall(name, target, module, source));
            }
            if (Set.of("tiles:insert", "tiles:put").contains(name)) {
              String target = first(tag, "definition", "page", "value");
              String view = target == null ? null : state.viewIds.get(target);
              if (view == null && target != null) view = state.tileViewIds.get(target);
              Set<String> owners =
                  new TreeSet<>(state.tileFragmentOwners.getOrDefault(path, Set.of()));
              String directOwner = state.screens.get(path);
              if (directOwner != null) owners.add(directOwner);
              if (view != null)
                for (String screen : owners)
                  edge(state, EdgeType.INCLUDES, screen, view, Confidence.CONFIRMED, source);
              else if (target != null)
                diagnostic(state, "Tiles 標籤目標未解析：" + target, source, "TILES_REFERENCE_UNRESOLVED");
            }
            ComponentKind kind =
                Set.of("logic:redirect", "logic:forward", "html:rewrite", "html-el:rewrite")
                        .contains(name)
                    ? ComponentKind.LINK
                    : kind(name, tag);
            if (kind == null) continue;
            if (kind == ComponentKind.FORM) action = first(tag, "action");
            String target =
                kind == ComponentKind.LINK
                    ? first(tag, "href", "forward", "page", "action")
                    : first(tag, "formaction");
            if (Set.of("logic:redirect", "logic:forward").contains(name))
              target = first(tag, "forward", "page", "action", "href");
            boolean inheritedFormAction =
                kind == ComponentKind.SUBMIT && target == null && action != null;
            String module = moduleFor(path, state);
            if (target != null
                && tag.attribute("forward") != null
                && !target.startsWith("/")
                && !target.contains("."))
              target = state.globalForwards.getOrDefault(module + ":" + target, target);
            if (kind == ComponentKind.FORM) activeModule = tag.attribute("module");
            if (target == null && (kind == ComponentKind.FORM || kind == ComponentKind.SUBMIT))
              target = action;
            Map<String, String> attrs = new TreeMap<>(tag.attributes());
            attrs.put("tag", name);
            attrs.put("kind", kind.name());
            attrs.put(
                "componentType",
                kind == ComponentKind.FORM || kind == ComponentKind.SUBMIT
                    ? "FORM_SUBMIT"
                    : kind == ComponentKind.LINK ? "NAVIGATION" : kind.name());
            if (name.equals("select") && tag.attribute("name") != null)
              attrs.put("dispatchParameterValues", selectOptionValues(text, tag));
            if (inheritedFormAction) attrs.put("strutsInheritedFormAction", "true");
            String moduleValue =
                tag.attribute("module") != null ? tag.attribute("module") : activeModule;
            if (moduleValue == null || moduleValue.isBlank()) moduleValue = module;
            if (moduleValue != null && !moduleValue.isBlank()) attrs.put("module", moduleValue);
            String originalTarget = target;
            if (kind == ComponentKind.FORM) {
              String formAction = action;
              action =
                  (name.equals("html:form")
                          || name.equals("html-el:form")
                          || name.equals("form:form"))
                      ? normalizeStrutsAction(action, moduleValue, state)
                      : action != null && !action.startsWith("/") && !action.contains(":")
                          ? resolveRelativeJspUrl(path, action)
                          : action;
              if (action != null) {
                target = action;
                attrs.put("originalTarget", formAction);
                attrs.put("target", action);
              }
            } else if (target != null) {
              if (Set.of(
                          "html:link",
                          "html-el:link",
                          "html:rewrite",
                          "html-el:rewrite",
                          "logic:redirect",
                          "logic:forward")
                      .contains(name)
                  && tag.attribute("action") != null)
                target = normalizeStrutsAction(target, moduleValue, state);
              else if (Set.of("a", "form", "html:link", "html-el:link").contains(name)
                  && !target.startsWith("/")
                  && !target.startsWith("#")
                  && !target.matches("(?is)^[a-z][a-z0-9+.-]*:.*")
                  && tag.attribute("action") == null) target = resolveRelativeJspUrl(path, target);
              if (target != null && target.toLowerCase(Locale.ROOT).endsWith(".faces")) {
                String facesTarget = normalizeFacesPath(target, state);
                if (facesTarget != null && !facesTarget.equals(target)) {
                  originalTarget = target;
                  target = facesTarget;
                }
              }
              if (target != null) {
                attrs.put("target", target);
                if (!Objects.equals(originalTarget, target))
                  attrs.put("originalTarget", originalTarget);
              }
            }
            if (target != null) attrs.put("target", target);
            String occurrenceKey = name + new TreeMap<>(tag.attributes());
            int occurrence = occurrences.merge(occurrenceKey, 1, Integer::sum) - 1;
            String id =
                StableGraphIds.component(path, kind, identityAttributes(tag, name), occurrence);
            var resolved =
                jsp.interactions().stream().filter(i -> id.equals(i.componentId())).findFirst();
            if (resolved.isPresent() && !resolved.get().submitsCurrentView()) {
              target = resolved.get().target();
              if (resolved.get().originalExpression() != null)
                attrs.put("originalExpression", resolved.get().originalExpression());
            }
            // <form action="<c:url value='/x.do'/>">: take the literal URL the JSP parser proved,
            // so the form and its submit buttons share it.
            if (kind == ComponentKind.FORM
                && action != null
                && action.stripLeading().startsWith("<")
                && resolved.isPresent()
                && resolved.get().target() != null
                && !resolved.get().target().stripLeading().startsWith("<")) {
              action = resolved.get().target();
              attrs.put("target", action);
            }
            if (kind == ComponentKind.FORM && action != null) target = action;
            if (target != null && target.toLowerCase(Locale.ROOT).endsWith(".faces")) {
              String facesTarget = normalizeFacesPath(target, state);
              if (facesTarget != null && !facesTarget.equals(target)) {
                attrs.put("originalTarget", target);
                target = facesTarget;
              }
            }
            if (target != null) {
              if (Set.of(
                          "html:link",
                          "html-el:link",
                          "html:rewrite",
                          "html-el:rewrite",
                          "logic:redirect",
                          "logic:forward")
                      .contains(name)
                  && tag.attribute("action") != null)
                target = normalizeStrutsAction(tag.attribute("action"), moduleValue, state);
              else if ((name.equals("html:submit")
                      || name.equals("html:button")
                      || name.equals("button")
                      || name.equals("input"))
                  && tag.attribute("formaction") == null
                  && action != null) target = action;
              else if (Set.of("a", "form", "html:link", "html-el:link").contains(name)
                  && !target.startsWith("/")
                  && !target.startsWith("#")
                  && !target.matches("(?is)^[a-z][a-z0-9+.-]*:.*")
                  && tag.attribute("action") == null) target = resolveRelativeJspUrl(path, target);
              attrs.put("target", target);
            }
            if (kind == ComponentKind.FORM) formGroup = id;
            String label = first(tag, "value", "title", "id", "name", "property");
            if (label == null) label = name;
            controls.add(
                new Control(
                    id,
                    label,
                    attrs,
                    target,
                    source,
                    first(tag, "property", "name"),
                    first(tag, "value"),
                    formGroup));
          }
        } catch (IOException | SecurityException error) {
          diagnostic(
              state,
              "JSP 元件解析受限：" + error.getMessage(),
              new SourceLocation(path, 1),
              "SOURCE_LIMIT");
        }
        byView.put(path, controls);
      }
    // Reuse proven include projection so a shared fragment keeps one ID with several screen owners.
    Map<String, Set<String>> projected = new TreeMap<>();
    for (var item : jsp.interactions())
      projected.computeIfAbsent(item.viewPath(), key -> new TreeSet<>()).add(item.source().file());
    for (var view : jsp.views())
      if (view.kind() == JspAnalysis.ViewKind.JSP
          || view.kind() == JspAnalysis.ViewKind.HTML && state.screens.containsKey(view.path())) {
        Set<String> sources = new TreeSet<>(projected.getOrDefault(view.path(), Set.of()));
        sources.add(view.path());
        collectIncludeSources(view.path(), jsp, state, new HashSet<>(), sources);
        Set<String> owners =
            new TreeSet<>(state.tileFragmentOwners.getOrDefault(view.path(), Set.of()));
        String directOwner = state.screens.get(view.path());
        if (directOwner != null) owners.add(directOwner);
        Set<String> modules =
            new TreeSet<>(state.jspModuleOwners.getOrDefault(view.path(), Set.of()));
        String pathModule = moduleFor(view.path(), state);
        if (!pathModule.isBlank()) modules.add(pathModule);
        if (modules.isEmpty()) modules.add("");
        for (String owner : owners)
          for (String module : modules)
            for (String path : sources) {
              for (Control control : byView.getOrDefault(path, List.of()))
                addControl(owner, control, byView.getOrDefault(path, List.of()), module, state);
              for (ScreenLoadCall call : loadCallsByView.getOrDefault(path, List.of()))
                recordScreenLoadCall(owner, call, module, state);
            }
      }
  }

  static boolean isScreenLoadActionTag(String name, MarkupTag tag) {
    if (tag.closing()) return false;
    if (Set.of("jsp:forward", "jsp:include").contains(name)) return tag.attribute("page") != null;
    if (!Set.of(
            "html:img",
            "html-el:img",
            "html:image",
            "html-el:image",
            "html:rewrite",
            "html-el:rewrite")
        .contains(name)) return false;
    return first(tag, "action", "page", "forward", "src") != null;
  }

  static String screenLoadTarget(String name, MarkupTag tag) {
    if (name.equals("jsp:forward") || name.equals("jsp:include")) return tag.attribute("page");
    return first(tag, "action", "page", "forward", "src");
  }

  static void recordScreenLoadCall(
      String screenId, ScreenLoadCall call, String moduleContext, State state) {
    if (!StrutsSources.literal(call.target())) {
      diagnostic(
          state,
          "畫面載入時的 action URL 未解析：" + call.target(),
          call.source(),
          "STRUTS_TARGET_UNRESOLVED");
      return;
    }
    String module = call.module().isBlank() ? moduleContext : call.module();
    String target = call.target();
    Control context =
        new Control(
            "", call.tag(), Map.of("module", module), target, call.source(), null, null, null);
    String resolved = moduleTarget(context, state), path = resolved.split("[?#]", 2)[0];
    List<Mapping> mappings = state.routes.get(path);
    WildcardResolution wildcard = null;
    if (isViewOrAssetPath(path)) return;
    if (mappings == null) {
      String logical = logicalPath(path, module, state);
      if (logical != null) mappings = state.routes.get(logical);
      if (mappings == null) {
        String concrete = logical == null ? path : logical;
        wildcard = resolveWildcard(concrete, module, state);
        if (wildcard != null && wildcard.ambiguous()) {
          for (WildcardMatch candidate : wildcard.candidates()) {
            String endpoint =
                state.endpointIds.getOrDefault(
                    candidate.mapping().route(),
                    StableGraphIds.endpoint(
                        "ANY",
                        publicPath(
                            candidate.mapping().route(), candidate.mapping().module(), state)));
            recordWildcardMatch(endpoint, path, candidate, state, call.source());
            edge(
                state,
                EdgeType.CALLS,
                screenId,
                endpoint,
                Confidence.AMBIGUOUS,
                call.source(),
                "basis=STATIC_URL；載入時來源="
                    + call.tag()
                    + "；"
                    + wildcardAmbiguityDetail(wildcard, state));
          }
          diagnostic(
              state,
              wildcardAmbiguityMessage(wildcard, state),
              call.source(),
              "STRUTS_WILDCARD_VERSION_UNRESOLVED");
          return;
        }
        if (wildcard != null && !wildcard.candidates().isEmpty()) {
          WildcardMatch match = wildcard.candidates().get(0);
          mappings = List.of(match.mapping());
        }
      }
    }
    if (mappings == null || mappings.isEmpty()) return;
    for (Mapping mapping : mappings) {
      String endpoint =
          wildcard == null
              ? state.endpointIds.getOrDefault(
                  path,
                  state.endpointIds.getOrDefault(
                      publicPath(mapping.route(), mapping.module(), state),
                      StableGraphIds.endpoint("ANY", mapping.route())))
              : state.endpointIds.getOrDefault(
                  mapping.route(),
                  StableGraphIds.endpoint(
                      "ANY", publicPath(mapping.route(), mapping.module(), state)));
      GraphNode endpointNode = state.nodes.get(endpoint);
      Confidence confidence =
          mappings.size() > 1
              ? Confidence.AMBIGUOUS
              : endpointNode == null ? Confidence.UNRESOLVED : endpointNode.confidence();
      if (wildcard != null && !wildcard.candidates().isEmpty())
        recordWildcardMatch(endpoint, path, wildcard.candidates().get(0), state, call.source());
      edge(
          state,
          EdgeType.CALLS,
          screenId,
          endpoint,
          confidence,
          call.source(),
          "basis=STATIC_URL；載入時來源=" + call.tag());
    }
  }

  static void suppressActionIncludeDiagnostics(JspAnalysis jsp, State state) {
    Set<SourceLocation> actionIncludes = new HashSet<>();
    for (JspAnalysis.Include include : jsp.includes()) {
      String module = moduleFor(include.sourceViewPath(), state);
      String target = resolveRelativeJspUrl(include.sourceViewPath(), include.targetPath());
      if (target == null) continue;
      String path = target.split("[?#]", 2)[0];
      String logical = logicalPath(path, module, state);
      if (isViewOrAssetPath(path)) continue;
      if (state.routes.containsKey(path)
          || logical != null && state.routes.containsKey(logical)
          || resolveWildcard(logical == null ? path : logical, module, state) != null)
        actionIncludes.add(include.source());
    }
    if (!actionIncludes.isEmpty())
      state.diagnostics.removeIf(
          diagnostic ->
              diagnostic.code().equals("JSP_UNRESOLVED")
                  && diagnostic.message().startsWith("JSP include cannot be found")
                  && actionIncludes.contains(diagnostic.source()));
  }

  /**
   * The action URLs that forward to a screen. Route aliases are not used: link resolution adds
   * aliases too, and a JSP requested directly (no action) is already read against its own folder,
   * which is its request directory.
   */
  static Set<String> requestPaths(GraphNode screen) {
    Set<String> paths = new TreeSet<>();
    if (screen == null) return paths;
    for (String path : screen.attributes().getOrDefault("sourceRequestPaths", "").split("\u001f"))
      if (path.startsWith("/") && !path.startsWith("//")) paths.add(path.split("[?#]", 2)[0]);
    return paths;
  }

  /**
   * A relative link target resolved against the one request directory its screen is served from;
   * null when there is not exactly one.
   */
  static String requestRelativeTarget(String screen, String raw, State state) {
    if (raw == null
        || raw.isBlank()
        || raw.startsWith("/")
        || raw.startsWith("#")
        || raw.matches("(?is)^[a-z][a-z0-9+.-]*:.*")
        || !StrutsSources.literal(raw)) return null;
    Set<String> directories = new TreeSet<>();
    for (String path : requestPaths(state.nodes.get(screen)))
      directories.add(path.substring(0, path.lastIndexOf('/') + 1));
    if (directories.size() != 1) return null;
    try {
      String resolved =
          java.net
              .URI
              .create("http://request.invalid" + directories.iterator().next())
              .resolve(raw)
              .toString()
              .substring("http://request.invalid".length());
      return resolved.startsWith("/") && !resolved.startsWith("/..") ? resolved : null;
    } catch (IllegalArgumentException invalid) {
      return null;
    }
  }

  static boolean isViewOrAssetPath(String path) {
    return path != null
        && path.toLowerCase(Locale.ROOT)
            .matches(".*\\.(?:jsp|jspx|jspf|html?|png|gif|jpe?g|svg|css|js|woff2?|ico|pdf)$");
  }

  static void collectIncludeSources(
      String view, JspAnalysis jsp, State state, Set<String> seen, Set<String> sources) {
    if (!seen.add(view)) return;
    for (var include : jsp.includes())
      if (include.sourceViewPath().equals(view) && StrutsSources.literal(include.targetPath())) {
        String child =
            include.targetPath().startsWith("/")
                ? "src/main/webapp" + include.targetPath()
                : besideFile(view, include.targetPath());
        if (!sources.add(child)) continue;
        collectIncludeSources(child, jsp, state, seen, sources);
      }
  }

  static String resolveRelativeJspUrl(String jspPath, String raw) {
    if (raw == null || !StrutsSources.literal(raw)) return raw;
    String suffix = "";
    int boundary = raw.length();
    int query = raw.indexOf('?'), fragment = raw.indexOf('#');
    if (query >= 0) boundary = Math.min(boundary, query);
    if (fragment >= 0) boundary = Math.min(boundary, fragment);
    suffix = raw.substring(boundary);
    String path = raw.substring(0, boundary);
    if (path.isBlank()) return raw;
    String normalized = besideFile(jspPath, path);
    for (String webRoot : List.of("src/main/webapp/", "WebContent/", "web/"))
      if (normalized.startsWith(webRoot))
        return "/" + normalized.substring(webRoot.length()) + suffix;
    return normalized.startsWith("/") ? normalized + suffix : raw;
  }

  /** {@code relative} resolved next to {@code file}; a file at the project root has no parent. */
  static String besideFile(String file, String relative) {
    Path parent = Path.of(file).getParent();
    return (parent == null ? Path.of(relative) : parent.resolve(relative))
        .normalize()
        .toString()
        .replace('\\', '/');
  }

  static String switchActionTarget(String target) {
    String query = target.contains("?") ? target.substring(target.indexOf('?') + 1) : "";
    Map<String, String> values = new TreeMap<>();
    for (String pair : query.split("&")) {
      String[] parts = pair.split("=", 2);
      if (parts.length == 2) values.put(parts[0], parts[1]);
    }
    String prefix = values.get("prefix"), page = values.get("page");
    return prefix == null || page == null
        ? null
        : (prefix.endsWith("/") ? prefix.substring(0, prefix.length() - 1) : prefix)
            + (page.startsWith("/") ? page : "/" + page);
  }
}
