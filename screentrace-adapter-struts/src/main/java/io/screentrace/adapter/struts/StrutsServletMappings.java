package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsConfigParser.*;
import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsProjectAnalyzer.*;
import static io.screentrace.adapter.struts.StrutsTiles.*;

import io.screentrace.adapter.struts.StrutsModel.FacesSuffixMapping;
import io.screentrace.adapter.struts.StrutsModel.ServletDefinition;
import io.screentrace.adapter.struts.StrutsModel.ServletMappingResolution;
import io.screentrace.adapter.struts.StrutsModel.ServletMappingStatus;
import io.screentrace.adapter.struts.StrutsModel.ServletPattern;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.*;
import io.screentrace.scanner.SafeProjectFiles;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import org.w3c.dom.*;

/**
 * Resolves the ActionServlet and FacesServlet mappings in web.xml and the public paths they give.
 */
final class StrutsServletMappings {
  private StrutsServletMappings() {}

  static void markUnsupportedJsf(State state, JspAnalysis jsp) {
    for (Path file : state.inventory.files())
      if (file.getFileName().toString().equalsIgnoreCase("web.xml"))
        try {
          // Parsed as XML, so a FacesServlet that is only mentioned in a comment does not count.
          StrutsSources.elements(readXml(file, state), "servlet-class").stream()
              .filter(servlet -> servlet.getTextContent().strip().endsWith("FacesServlet"))
              .findFirst()
              .ifPresent(
                  servlet ->
                      state.diagnostics.add(
                          new Diagnostic(
                              "偵測到 JSF FacesServlet；本階段不分析 JSF 元件",
                              Confidence.UNRESOLVED,
                              new SourceLocation(relative(state, file), sourceLine(servlet)),
                              "UNSUPPORTED_COMPONENT_FRAMEWORK",
                              List.of())));
        } catch (Exception unread) {
          // readFacesServletMappings reports an unreadable web.xml; it only adds no JSF warning
          // here.
        }
    for (GraphNode screen : new ArrayList<>(state.nodes.values()))
      if (screen.type() == NodeType.SCREEN) {
        Set<String> paths = new TreeSet<>();
        String view = screen.attributes().get("view");
        if (view != null && view.endsWith(".jsp")) paths.add(view);
        if ("true".equals(screen.attributes().get("tilesDefinition")))
          paths.addAll(tileJspPaths(screen.name(), state));
        for (var entry : state.tileFragmentOwners.entrySet())
          if (entry.getValue().contains(screen.id())) paths.add(entry.getKey());
        for (String path : paths) {
          Path file = state.inventory.root().resolve(path);
          try {
            String source =
                SafeProjectFiles.readUtf8Limited(
                    state.inventory.root(), file, SafeProjectFiles.MAX_JSP_FILE_BYTES);
            // Tokenized as markup, so commented-out directives and tags inside scriptlets or EL do
            // not count.
            List<MarkupTag> tags = MarkupTag.scan(source);
            Map<String, String> prefixes = new TreeMap<>();
            for (MarkupTag declaration : tags) {
              if (declaration.closing()) continue;
              if (declaration.name().equalsIgnoreCase("@taglib")) {
                String prefix = declaration.attribute("prefix"), uri = declaration.attribute("uri");
                if (prefix != null && uri != null) prefixes.put(prefix, uri);
              }
              declaration.attributes().entrySet().stream()
                  .filter(entry -> entry.getKey().startsWith("xmlns:"))
                  .forEach(
                      entry ->
                          prefixes.put(
                              entry.getKey().substring("xmlns:".length()), entry.getValue()));
            }
            Set<String> jsfPrefixes = new TreeSet<>();
            prefixes.forEach(
                (prefix, uri) -> {
                  if (uri.toLowerCase(Locale.ROOT).contains("jsf/html")
                      || uri.toLowerCase(Locale.ROOT).contains("jsf/core"))
                    jsfPrefixes.add(prefix.toLowerCase(Locale.ROOT));
                });
            if (jsfPrefixes.isEmpty()) continue;
            MarkupTag tag =
                tags.stream()
                    .filter(candidate -> !candidate.closing())
                    .filter(
                        candidate -> {
                          String name = candidate.name().toLowerCase(Locale.ROOT);
                          int colon = name.indexOf(':');
                          return colon > 0
                              && colon < name.length() - 1
                              && jsfPrefixes.contains(name.substring(0, colon));
                        })
                    .findFirst()
                    .orElse(null);
            if (tag == null) continue;
            GraphNode current = state.nodes.get(screen.id());
            if (current != null
                && !"JSF".equals(current.attributes().get("unsupportedComponentFramework"))) {
              Map<String, String> attrs = new TreeMap<>(current.attributes());
              attrs.put("unsupportedComponentFramework", "JSF");
              state.nodes.put(
                  current.id(),
                  new GraphNode(
                      current.id(),
                      current.type(),
                      current.name(),
                      attrs,
                      current.source(),
                      current.confidence(),
                      current.evidence()));
            }
            SourceLocation sourceLocation = new SourceLocation(path, tag.line());
            if (state.diagnostics.stream()
                .noneMatch(
                    item ->
                        item.code().equals("UNSUPPORTED_COMPONENT_FRAMEWORK")
                            && item.source().equals(sourceLocation)))
              state.diagnostics.add(
                  new Diagnostic(
                      "此畫面或其版型／片段使用 JSF 元件；本階段不分析 JSF",
                      Confidence.UNRESOLVED,
                      sourceLocation,
                      "UNSUPPORTED_COMPONENT_FRAMEWORK",
                      List.of(
                          new AnalysisEvidence(
                              sourceLocation,
                              PARSER,
                              ResolutionStatus.UNRESOLVED,
                              "畫面=" + screen.name() + "；JSF 標籤=<" + tag.name()))));
          } catch (Exception unread) {
            // JspProjectParser reports an unreadable page; it only adds no JSF warning here.
          }
        }
      }
  }

  static void readFacesServletMappings(State state) {
    List<Path> webXmls =
        state.inventory.files().stream()
            .filter(file -> file.getFileName().toString().equals("web.xml"))
            .sorted()
            .toList();
    for (Path file : webXmls)
      try {
        Document document = readXml(file, state);
        String webPath = relative(state, file);
        Map<String, String> servlets = new TreeMap<>();
        for (Element servlet : StrutsSources.elements(document, "servlet")) {
          List<Element> names = StrutsSources.elements(servlet, "servlet-name"),
              classes = StrutsSources.elements(servlet, "servlet-class");
          if (!names.isEmpty() && !classes.isEmpty())
            servlets.put(
                names.get(0).getTextContent().trim(), classes.get(0).getTextContent().trim());
        }
        List<String> faces =
            servlets.entrySet().stream()
                .filter(entry -> entry.getValue().endsWith("FacesServlet"))
                .map(Map.Entry::getKey)
                .toList();
        List<String> suffixes = new ArrayList<>();
        for (Element parameter : StrutsSources.elements(document, "context-param")) {
          List<Element> names = StrutsSources.elements(parameter, "param-name"),
              values = StrutsSources.elements(parameter, "param-value");
          if (!names.isEmpty()
              && !values.isEmpty()
              && names.get(0).getTextContent().trim().equals("javax.faces.DEFAULT_SUFFIX"))
            suffixes.addAll(
                Arrays.stream(values.get(0).getTextContent().split(","))
                    .map(String::trim)
                    .filter(value -> value.matches("\\.[A-Za-z0-9]+"))
                    .toList());
        }
        String defaultSuffix =
            suffixes.isEmpty()
                ? ".jsp"
                : suffixes.stream().distinct().count() == 1 ? suffixes.get(0) : null;
        for (Element mapping : StrutsSources.elements(document, "servlet-mapping")) {
          List<Element> names = StrutsSources.elements(mapping, "servlet-name");
          if (names.isEmpty() || !faces.contains(names.get(0).getTextContent().trim())) continue;
          for (Element pattern : StrutsSources.elements(mapping, "url-pattern")) {
            String value = pattern.getTextContent().trim();
            if (value.startsWith("*.") && value.length() > 2)
              state
                  .facesMappings
                  .computeIfAbsent(value.substring(1), ignored -> new ArrayList<>())
                  .add(
                      new FacesSuffixMapping(
                          defaultSuffix, StrutsSources.source(webPath, pattern)));
          }
        }
      } catch (Exception error) {
        diagnostic(
            state,
            "FacesServlet 網址對應無法安全解析",
            new SourceLocation(relative(state, file), 1),
            "JSF_ROUTE_UNRESOLVED");
      }
  }

  static String normalizeFacesPath(String target, State state) {
    if (target == null) return null;
    String[] parts = target.split("([?#])", 2);
    String path = parts[0];
    String suffix = path.substring(path.lastIndexOf('/') + 1);
    int dot = suffix.lastIndexOf('.');
    String extension = dot >= 0 ? suffix.substring(dot) : null;
    boolean facesLike =
        extension != null
            && (".faces".equalsIgnoreCase(extension) || state.facesMappings.containsKey(extension));
    if (!facesLike) return target;
    List<FacesSuffixMapping> candidates = state.facesMappings.getOrDefault(extension, List.of());
    List<String> defaults =
        candidates.stream()
            .map(FacesSuffixMapping::defaultSuffix)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
    if (candidates.isEmpty() || defaults.size() != 1) {
      SourceLocation source =
          candidates.isEmpty() ? new SourceLocation(".", 1) : candidates.get(0).source();
      String key = target + "|" + source.file();
      if (state.facesDiagnostics.add(key))
        diagnostic(
            state, "FacesServlet 網址對應無法證明或有多個候選，未猜測副檔名：" + target, source, "JSF_ROUTE_UNRESOLVED");
      return null;
    }
    return path.substring(0, path.length() - extension.length())
        + defaults.get(0)
        + (parts.length > 1 ? target.substring(path.length()) : "");
  }

  static void readServletMapping(State state) {
    List<Path> webXmls =
        state.inventory.files().stream()
            .filter(file -> file.getFileName().toString().equals("web.xml"))
            .sorted()
            .toList();
    Document document = null;
    String webPath = ".";
    List<ServletDefinition> actionServlets = new ArrayList<>();
    List<ServletPattern> patterns = new ArrayList<>();
    if (!webXmls.isEmpty())
      try {
        Path file = webXmls.get(0);
        webPath = relative(state, file);
        document = readXml(file, state);
        for (Element servlet : StrutsSources.elements(document, "servlet")) {
          List<Element> names = StrutsSources.elements(servlet, "servlet-name"),
              classes = StrutsSources.elements(servlet, "servlet-class");
          if (names.isEmpty() || classes.isEmpty()) continue;
          String name = names.get(0).getTextContent().trim(),
              type = classes.get(0).getTextContent().trim();
          if (!isActionServlet(type, state, new HashSet<>())) continue;
          Map<String, List<String>> configs = new TreeMap<>();
          for (Element param : StrutsSources.elements(servlet, "init-param")) {
            List<Element> keys = StrutsSources.elements(param, "param-name"),
                values = StrutsSources.elements(param, "param-value");
            if (keys.isEmpty() || values.isEmpty()) continue;
            String key = keys.get(0).getTextContent().trim();
            if (key.equals("config") || key.startsWith("config/"))
              configs
                  .computeIfAbsent(key, value -> new ArrayList<>())
                  .addAll(
                      Arrays.stream(values.get(0).getTextContent().split(","))
                          .map(String::trim)
                          .filter(value -> !value.isBlank())
                          .toList());
          }
          actionServlets.add(
              new ServletDefinition(name, type, StrutsSources.source(webPath, servlet), configs));
        }
        for (Element mapping : StrutsSources.elements(document, "servlet-mapping")) {
          List<Element> names = StrutsSources.elements(mapping, "servlet-name");
          if (names.isEmpty()) continue;
          String servletName = names.get(0).getTextContent().trim();
          ServletDefinition servlet =
              actionServlets.stream()
                  .filter(candidate -> candidate.name().equals(servletName))
                  .findFirst()
                  .orElse(null);
          if (servlet == null) continue;
          for (Element pattern : StrutsSources.elements(mapping, "url-pattern")) {
            String value = pattern.getTextContent().trim();
            if (value.startsWith("*.") && value.length() > 2
                || value.startsWith("/") && value.endsWith("/*"))
              patterns.add(
                  new ServletPattern(
                      value,
                      StrutsSources.source(webPath, pattern),
                      servlet.name(),
                      servlet.servletClass()));
          }
        }
      } catch (Exception error) {
        diagnostic(
            state,
            "ActionServlet 的 web.xml 設定無法解析",
            new SourceLocation(webPath, 1),
            "STRUTS_SERVLET_MAPPING_UNRESOLVED");
      }

    Map<String, ServletMappingResolution> resolutions = new TreeMap<>();
    for (Path config : state.inventory.strutsConfigFiles()) {
      String module = moduleFor(relative(state, config), state);
      if (resolutions.containsKey(module)) continue;
      SourceLocation diagnosticSource =
          webXmls.isEmpty() ? new SourceLocation(".", 1) : new SourceLocation(webPath, 1);
      List<ServletDefinition> candidates;
      if (actionServlets.size() == 1) candidates = List.of(actionServlets.get(0));
      else
        candidates =
            actionServlets.stream()
                .filter(servlet -> configuresModule(servlet, module, relative(state, config)))
                .toList();
      if (candidates.size() > 1 || actionServlets.size() > 1 && candidates.isEmpty()) {
        List<ServletDefinition> listed = candidates.isEmpty() ? actionServlets : candidates;
        String names =
            listed.stream()
                .map(
                    servlet ->
                        servlet.name()
                            + "（"
                            + servlet.source().file()
                            + ":"
                            + servlet.source().line()
                            + "）")
                .toList()
                .toString();
        diagnostic(
            state,
            "無法判定 module "
                + (module.isBlank() ? "/" : module)
                + " 由哪個 ActionServlet 處理；候選："
                + names,
            diagnosticSource,
            "STRUTS_SERVLET_MAPPING_AMBIGUOUS");
        resolutions.put(
            module, new ServletMappingResolution(ServletMappingStatus.AMBIGUOUS, List.of(), names));
        continue;
      }
      if (candidates.size() != 1) {
        diagnostic(
            state,
            "找不到可證明的 ActionServlet 宣告與 servlet mapping；servlet mapping 未證明",
            diagnosticSource,
            "STRUTS_SERVLET_MAPPING_UNRESOLVED");
        resolutions.put(
            module,
            new ServletMappingResolution(ServletMappingStatus.UNRESOLVED, List.of(), "未證明"));
        continue;
      }
      ServletDefinition servlet = candidates.get(0);
      List<ServletPattern> ownedPatterns =
          patterns.stream()
              .filter(pattern -> pattern.servletName().equals(servlet.name()))
              .distinct()
              .toList();
      if (ownedPatterns.isEmpty()) {
        diagnostic(
            state,
            "ActionServlet " + servlet.name() + " 沒有 servlet-mapping；servlet mapping 未證明",
            servlet.source(),
            "STRUTS_SERVLET_MAPPING_UNRESOLVED");
        resolutions.put(
            module,
            new ServletMappingResolution(
                ServletMappingStatus.UNRESOLVED, List.of(), servlet.name()));
        continue;
      }
      resolutions.put(
          module,
          new ServletMappingResolution(ServletMappingStatus.PROVEN, ownedPatterns, servlet.name()));
    }
    state.servletMappings.putAll(resolutions);
  }

  static boolean configuresModule(ServletDefinition servlet, String module, String configPath) {
    for (var entry : servlet.configs().entrySet()) {
      String configuredModule =
          entry.getKey().equals("config") ? "" : "/" + entry.getKey().substring("config/".length());
      if (!configuredModule.equals(module)) continue;
      for (String value : entry.getValue()) if (sameConfigPath(value, configPath)) return true;
    }
    return false;
  }

  static boolean sameConfigPath(String configured, String path) {
    String left = configured.replace('\\', '/'), right = path.replace('\\', '/');
    return left.equals(right) || right.endsWith(left.startsWith("/") ? left : "/" + left);
  }

  static String mappingProof(ServletMappingResolution resolution) {
    return "servlet mapping 已證明："
        + resolution.patterns().get(0).servletClass()
        + " → "
        + String.join(", ", resolution.patterns().stream().map(ServletPattern::pattern).toList());
  }

  static boolean isActionServlet(String className, State state, Set<String> visited) {
    if ("org.apache.struts.action.ActionServlet".equals(className)) return true;
    if (className == null || className.isBlank() || !visited.add(className)) return false;
    StrutsSources.JavaType type = state.types.get(className);
    return type != null && isActionServlet(type.parent(), state, visited);
  }

  static String servletClass(Document document, String servletName) {
    for (Element servlet : StrutsSources.elements(document, "servlet")) {
      List<Element> names = StrutsSources.elements(servlet, "servlet-name"),
          classes = StrutsSources.elements(servlet, "servlet-class");
      if (!names.isEmpty()
          && !classes.isEmpty()
          && servletName.equals(names.get(0).getTextContent().trim()))
        return classes.get(0).getTextContent().trim();
    }
    return "";
  }

  static String publicPath(String route, String module, State state) {
    ServletMappingResolution mapping = state.servletMappings.get(module);
    return mapping == null || mapping.status() != ServletMappingStatus.PROVEN
        ? route
        : publicPath(route, mapping.patterns().get(0));
  }

  static String publicPath(String route, ServletPattern servletPattern) {
    String pattern = servletPattern.pattern();
    if (pattern.startsWith("*.")) {
      String suffix = pattern.substring(1);
      return route.endsWith(suffix) ? route : route + suffix;
    }
    String prefix = pattern.substring(0, pattern.length() - 1);
    return route.startsWith(prefix)
        ? route
        : prefix + (route.startsWith("/") ? route.substring(1) : route);
  }

  static String logicalPath(String path, String module, State state) {
    if (state.endpointIds.containsKey(path))
      return state.routes.containsKey(path) ? state.routes.get(path).get(0).route() : path;
    ServletMappingResolution mapping = state.servletMappings.get(module);
    if (mapping == null || mapping.status() != ServletMappingStatus.PROVEN) return null;
    List<String> candidates = new ArrayList<>();
    for (ServletPattern servletPattern : mapping.patterns()) {
      String pattern = servletPattern.pattern();
      if (pattern.startsWith("*.")) {
        String suffix = pattern.substring(1);
        if (path.endsWith(suffix))
          candidates.add(path.substring(0, path.length() - suffix.length()));
      } else {
        String prefix = pattern.substring(0, pattern.length() - 1);
        if (path.startsWith(prefix)) candidates.add("/" + path.substring(prefix.length()));
      }
    }
    List<String> unique = candidates.stream().distinct().toList();
    return unique.size() == 1 ? unique.get(0) : null;
  }
}
