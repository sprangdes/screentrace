package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsDispatch.*;
import static io.screentrace.adapter.struts.StrutsForwards.*;
import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsServletMappings.*;
import static io.screentrace.adapter.struts.StrutsWildcards.*;

import io.screentrace.adapter.struts.StrutsModel.Mapping;
import io.screentrace.adapter.struts.StrutsModel.PendingForward;
import io.screentrace.adapter.struts.StrutsModel.ServletMappingResolution;
import io.screentrace.adapter.struts.StrutsModel.ServletMappingStatus;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.adapter.struts.StrutsModel.StrutsVersionEvidence;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import org.w3c.dom.*;

/**
 * Reads struts-config.xml action mappings, form beans, Spring bean names and the Struts version.
 */
final class StrutsConfigParser {
  private StrutsConfigParser() {}

  static void collectFormProperties(
      String className,
      State state,
      Map<String, String> properties,
      List<AnalysisEvidence> proof,
      Set<String> seen) {
    if (className == null || !seen.add(className)) return;
    var type = state.types.get(className);
    if (type == null) return;
    String parent = type.parent();
    int separator = type.name().lastIndexOf('.');
    if (!parent.contains(".")
        && separator >= 0
        && state.types.containsKey(type.name().substring(0, separator + 1) + parent))
      parent = type.name().substring(0, separator + 1) + parent;
    collectFormProperties(parent, state, properties, proof, seen);
    for (var field : type.declaration().getFields())
      for (var variable : field.getVariables())
        properties.putIfAbsent(
            "field." + variable.getNameAsString() + ".type", variable.getType().asString());
    for (var method : type.declaration().getMethods())
      if (method.isPublic()
          && method.getParameters().isEmpty()
          && method.getNameAsString().startsWith("get")
          && method.getNameAsString().length() > 3) {
        String raw = method.getNameAsString().substring(3);
        properties.put(
            "field." + java.beans.Introspector.decapitalize(raw) + ".type",
            method.getType().asString());
      }
    proof.addAll(evidence(type.source(), Confidence.CONFIRMED, "ActionForm 欄位宣告：" + className));
  }

  static void parseConfig(Path config, State state) {
    String path = relative(state, config);
    try {
      Document document = readXml(config, state);
      String module = moduleFor(path, state);
      for (Element form : StrutsSources.elements(document, "form-bean")) {
        String name = form.getAttribute("name"),
            id = ApplicationGraph.id(NodeType.FORM_MODEL, path + ":" + name);
        Map<String, String> attrs = new TreeMap<>(StrutsSources.attributes(form));
        attrs.put("class", form.getAttribute("type"));
        for (Element property : StrutsSources.elements(form, "form-property"))
          for (var attribute : StrutsSources.attributes(property).entrySet())
            attrs.put(
                "field." + property.getAttribute("name") + "." + attribute.getKey(),
                attribute.getValue());
        addNode(
            state,
            id,
            NodeType.FORM_MODEL,
            name,
            attrs,
            StrutsSources.source(path, form),
            Confidence.CONFIRMED);
        var model = state.nodes.get(id);
        var properties = new TreeMap<>(model.attributes());
        var proof = new ArrayList<>(model.evidence());
        collectFormProperties(properties.get("class"), state, properties, proof, new HashSet<>());
        state.nodes.put(
            id,
            new GraphNode(
                model.id(),
                model.type(),
                model.name(),
                properties,
                model.source(),
                model.confidence(),
                proof));
        state.forms.put(module + ":" + name, id);
      }
      Map<String, String> global = new TreeMap<>();
      for (Element group : StrutsSources.elements(document, "global-forwards"))
        for (Element forward : StrutsSources.elements(group, "forward")) {
          state
              .forwardRedirects
              .computeIfAbsent(forward.getAttribute("path"), k -> new TreeSet<>())
              .add("true".equalsIgnoreCase(forward.getAttribute("redirect")));
          global.put(forward.getAttribute("name"), forward.getAttribute("path"));
          state.globalForwards.put(
              module + ":" + forward.getAttribute("name"), forward.getAttribute("path"));
          String id =
              ApplicationGraph.id(
                  NodeType.SOURCE_ARTIFACT, path + ":global:" + forward.getAttribute("name"));
          addNode(
              state,
              id,
              NodeType.SOURCE_ARTIFACT,
              "GLOBAL " + forward.getAttribute("name"),
              StrutsSources.attributes(forward),
              StrutsSources.source(path, forward),
              Confidence.CONFIRMED);
        }
      boolean inputForward =
          StrutsSources.elements(document, "controller").stream()
              .anyMatch(
                  controller -> "true".equalsIgnoreCase(controller.getAttribute("inputForward")));
      state.inputForward.put(module, inputForward);
      for (Element plugin : StrutsSources.elements(document, "plug-in")) {
        Map<String, String> attrs = new TreeMap<>(StrutsSources.attributes(plugin));
        for (Element property : StrutsSources.elements(plugin, "set-property"))
          attrs.put(property.getAttribute("property"), property.getAttribute("value"));
        addNode(
            state,
            ApplicationGraph.id(
                NodeType.SOURCE_ARTIFACT, path + ":plugin:" + plugin.getAttribute("className")),
            NodeType.SOURCE_ARTIFACT,
            "設定外掛",
            attrs,
            StrutsSources.source(path, plugin),
            Confidence.CONFIRMED);
      }
      Map<String, Integer> exceptionOccurrences = new HashMap<>();
      for (Element exception : StrutsSources.elements(document, "exception")) {
        var source = StrutsSources.source(path, exception);
        // Scope, exception type and key identify a mapping; only identical repeats differ, by
        // document order, never by line.
        String scope =
            exception.getParentNode() instanceof Element parent
                    && parent.getTagName().equals("action")
                ? "action:" + module + parent.getAttribute("path")
                : "global";
        String key =
            path
                + ":exception:"
                + scope
                + ":"
                + exception.getAttribute("type")
                + ":"
                + exception.getAttribute("key");
        String id =
            ApplicationGraph.id(
                NodeType.HANDLER,
                key + ":" + (exceptionOccurrences.merge(key, 1, Integer::sum) - 1));
        addNode(
            state,
            id,
            NodeType.HANDLER,
            "例外處理",
            StrutsSources.attributes(exception),
            source,
            Confidence.CONFIRMED);
        PendingForward target =
            new PendingForward(id, module, exception.getAttribute("path"), source);
        state.pendingForwards.add(target);
        state.exceptionForwards.add(target);
      }
      for (Element action : StrutsSources.elements(document, "action")) {
        String route = module + action.getAttribute("path");
        if (action.getAttribute("path").isBlank()) continue;
        String type =
            state.beans.getOrDefault(action.getAttribute("type"), action.getAttribute("type"));
        boolean proxy = type.equals("org.springframework.web.struts.DelegatingActionProxy");
        if (proxy && !state.ambiguousBeans.contains(route))
          type = state.beans.getOrDefault(route, type);
        var source = StrutsSources.source(path, action);
        Map<String, String> attrs = new TreeMap<>(StrutsSources.attributes(action));
        attrs.put("actionType", type);
        attrs.put("module", module);
        String handlerId = ApplicationGraph.id(NodeType.HANDLER, path + ":" + route);
        String family = dispatchFamily(type, state, new HashSet<>());
        boolean executeProven =
            state.types.containsKey(type)
                && state.types.get(type).declaration().getMethodsByName("execute").stream()
                    .anyMatch(StrutsDispatch::validDispatchSignature);
        Confidence status =
            family.isBlank()
                ? (type.isBlank()
                    ? Confidence.UNRESOLVED
                    : executeProven ? Confidence.CONFIRMED : Confidence.INFERRED)
                : Confidence.UNRESOLVED;
        if (directActionForward(action, type) != null
            && StrutsSources.literal(directActionForward(action, type)))
          status = Confidence.CONFIRMED;
        if (!family.isBlank()) attrs.put("dispatchFamily", family);
        addNode(
            state,
            handlerId,
            NodeType.HANDLER,
            type.isBlank() ? "未解析的處理器" : type + (family.isBlank() ? ".execute()" : ".<dispatch>()"),
            attrs,
            source,
            status);
        if (proxy
            && state.beanSources.containsKey(route)
            && !type.equals(action.getAttribute("type"))) {
          var old = state.nodes.get(handlerId);
          var proof = new ArrayList<>(old.evidence());
          proof.add(
              new AnalysisEvidence(
                  state.beanSources.get(route),
                  "SpringActionBinding",
                  ResolutionStatus.CONFIRMED,
                  "action path="
                      + route
                      + "；代理="
                      + action.getAttribute("type")
                      + "；唯一 Spring bean class="
                      + type));
          state.nodes.put(
              handlerId,
              new GraphNode(
                  old.id(),
                  old.type(),
                  old.name(),
                  old.attributes(),
                  old.source(),
                  old.confidence(),
                  proof));
        }
        String formId = state.forms.get(module + ":" + action.getAttribute("name"));
        if (formId != null)
          edge(state, EdgeType.DECLARED_BY, handlerId, formId, Confidence.CONFIRMED, source);
        Map<String, String> forwards = new TreeMap<>(global);
        Map<String, SourceLocation> forwardSources = new TreeMap<>();
        for (Element item : StrutsSources.elements(action, "forward")) {
          state
              .forwardRedirects
              .computeIfAbsent(item.getAttribute("path"), k -> new TreeSet<>())
              .add("true".equalsIgnoreCase(item.getAttribute("redirect")));
          forwards.put(item.getAttribute("name"), item.getAttribute("path"));
          forwardSources.put(item.getAttribute("name"), StrutsSources.source(path, item));
        }
        String input = action.getAttribute("input");
        if (inputForward && !input.isBlank()) input = global.getOrDefault(input, input);
        Map<String, String> localForwards = new TreeMap<>();
        for (Element item : StrutsSources.elements(action, "forward"))
          localForwards.put(item.getAttribute("name"), item.getAttribute("path"));
        String direct = directActionForward(action, type);
        if (direct != null) {
          localForwards.put(DIRECT_FORWARD, direct);
          forwardSources.put(DIRECT_FORWARD, source);
        }
        Mapping mapping =
            new Mapping(
                route,
                type,
                handlerId,
                formId,
                action.getAttribute("parameter"),
                family,
                forwards,
                localForwards,
                forwardSources,
                input,
                module,
                source);
        state.actionMappings.add(mapping);
        ServletMappingResolution servletMapping = state.servletMappings.get(module);
        if (servletMapping != null && servletMapping.status() == ServletMappingStatus.PROVEN) {
          List<String> publicPaths =
              servletMapping.patterns().stream()
                  .map(servletPattern -> publicPath(route, servletPattern))
                  .distinct()
                  .toList();
          String primaryPath = publicPaths.get(0),
              endpointId = StableGraphIds.endpoint("ANY", route);
          List<String> aliases = new ArrayList<>();
          aliases.add(route);
          aliases.addAll(publicPaths);
          for (String alias : aliases) {
            List<Mapping> routeMappings =
                state.routes.computeIfAbsent(alias, key -> new ArrayList<>());
            routeMappings.add(mapping);
            state.endpointIds.put(alias, endpointId);
            if (routeMappings.size() > 1)
              diagnostic(state, "路由重複，保留所有處理器候選：" + alias, source, "DUPLICATE_ROUTE");
          }
          Map<String, String> endpointAttrs = new TreeMap<>();
          endpointAttrs.put("httpMethod", "ANY");
          endpointAttrs.put("path", primaryPath);
          endpointAttrs.put("category", "ACTION");
          endpointAttrs.put("servletMappingStatus", "PROVEN");
          if (!primaryPath.equals(route)) {
            endpointAttrs.put("logicalPath", route);
            endpointAttrs.put(
                "aliases",
                String.join(
                    ",", aliases.stream().filter(alias -> !alias.equals(primaryPath)).toList()));
          }
          String proof = mappingProof(servletMapping);
          addNode(
              state,
              endpointId,
              NodeType.ENDPOINT,
              "ANY " + primaryPath,
              endpointAttrs,
              source,
              Confidence.CONFIRMED,
              proof);
          edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, status, source, proof);
        } else {
          for (String alias : endpointPaths(route)) {
            String endpointId = StableGraphIds.endpoint("ANY", alias);
            var mappings = state.routes.computeIfAbsent(alias, key -> new ArrayList<>());
            mappings.add(mapping);
            state.endpointIds.put(alias, endpointId);
            if (mappings.size() > 1)
              diagnostic(state, "路由重複，保留所有處理器候選：" + alias, source, "DUPLICATE_ROUTE");
            Confidence routeStatus =
                alias.equals(route)
                    ? status
                    : (status == Confidence.CONFIRMED ? Confidence.INFERRED : status);
            addNode(
                state,
                endpointId,
                NodeType.ENDPOINT,
                "ANY " + alias,
                Map.of("httpMethod", "ANY", "path", alias, "category", "ACTION"),
                source,
                routeStatus);
            edge(state, EdgeType.HANDLED_BY, endpointId, handlerId, routeStatus, source);
          }
        }
        for (var entry : forwardSources.entrySet())
          if (!hasWildcardSubstitution(route, forwards.get(entry.getKey())))
            state.pendingForwards.add(
                new PendingForward(
                    handlerId, module, forwards.get(entry.getKey()), entry.getValue()));
        if (!input.isBlank() && !hasWildcardSubstitution(route, input))
          state.pendingForwards.add(new PendingForward(handlerId, module, input, source));
      }
    } catch (Exception error) {
      diagnostic(
          state,
          "Struts 設定無法解析：" + error.getMessage(),
          new SourceLocation(path, 1),
          "STRUTS_CONFIG_UNRESOLVED");
    }
  }

  static String moduleFor(String path, State state) {
    List<String> modules = new ArrayList<>();
    for (Path file : state.inventory.files())
      if (file.getFileName().toString().equals("web.xml"))
        try {
          for (Element parameter : StrutsSources.elements(readXml(file, state), "init-param")) {
            var names = StrutsSources.elements(parameter, "param-name");
            var values = StrutsSources.elements(parameter, "param-value");
            if (names.isEmpty() || values.isEmpty()) continue;
            String name = names.get(0).getTextContent().trim();
            if (!name.startsWith("config/")) continue;
            String module = "/" + name.substring("config/".length());
            modules.add(module);
            for (String value : values.get(0).getTextContent().split(","))
              if (path.endsWith(value.trim())) return module;
          }
        } catch (Exception error) {
          diagnostic(
              state,
              "web.xml 模組設定無法解析",
              new SourceLocation(relative(state, file), 1),
              "MODULE_CONFIG_UNRESOLVED");
        }
    String clean = path.replace('\\', '/');
    return modules.stream()
        .filter(module -> clean.contains(module + "/"))
        .max(Comparator.comparingInt(String::length))
        .orElse("");
  }

  static void readSpringBeans(State state) {
    for (Path file : state.inventory.springXmlFiles())
      try {
        for (Element bean : StrutsSources.elements(readXml(file, state), "bean")) {
          String type = bean.getAttribute("class");
          if (type.isBlank()) continue;
          if (!bean.getAttribute("id").isBlank())
            recordBean(
                bean.getAttribute("id"),
                type,
                StrutsSources.source(relative(state, file), bean),
                state);
          for (String name : bean.getAttribute("name").split("[,;\\s]+"))
            if (!name.isBlank())
              recordBean(name, type, StrutsSources.source(relative(state, file), bean), state);
        }
      } catch (Exception error) {
        diagnostic(
            state,
            "Spring bean 設定無法解析",
            new SourceLocation(relative(state, file), 1),
            "SPRING_BEAN_UNRESOLVED");
      }
  }

  static void recordBean(String name, String type, SourceLocation source, State state) {
    String old = state.beans.putIfAbsent(name, type);
    if (old != null && !old.equals(type)) state.ambiguousBeans.add(name);
    state.beanSources.putIfAbsent(name, source);
  }

  static StrutsVersionEvidence detectStrutsVersion(ProjectInventory inventory) {
    Map<String, SourceLocation> versions = new TreeMap<>();
    for (Path file : inventory.files())
      try {
        String relative = StrutsSources.relative(inventory.root(), file),
            name = file.getFileName().toString();
        if (name.equals("pom.xml")) {
          Document pom =
              StrutsSources.xml(
                  SafeProjectFiles.readUtf8Limited(
                      inventory.root(), file, SafeProjectFiles.MAX_XML_FILE_BYTES));
          for (Element parent : StrutsSources.elements(pom, "parent"))
            addMavenStrutsVersion(parent, relative, versions);
          for (Element dependency : StrutsSources.elements(pom, "dependency"))
            addMavenStrutsVersion(dependency, relative, versions);
        } else if (name.equals("build.xml") || name.equals("build.properties")) {
          String text =
              SafeProjectFiles.readUtf8Limited(
                  inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
          String[] lines = text.split("\\R", -1);
          for (int line = 0; line < lines.length; line++) {
            String value = lines[line];
            if (!value.toLowerCase(Locale.ROOT).contains("struts")) continue;
            var matcher =
                java.util.regex.Pattern.compile(
                        "(?i)struts[.\\-_a-z0-9\\\"'= ]*?(?:value[=\\\"' ]*)?(1\\.\\d+\\.\\d+)")
                    .matcher(value);
            if (matcher.find())
              versions.putIfAbsent(matcher.group(1), new SourceLocation(relative, line + 1));
          }
        }
        var library =
            java.util.regex.Pattern.compile("(?i).*struts-[a-z-]*?(\\d+\\.\\d+\\.\\d+).*\\.jar")
                .matcher(name);
        if (library.matches())
          versions.putIfAbsent(library.group(1), new SourceLocation(relative, 1));
      } catch (Exception unread) {
        // A build file that cannot be read gives no version evidence; the version is only
        // described.
      }
    if (versions.size() != 1)
      return new StrutsVersionEvidence(
          null,
          null,
          versions.isEmpty()
              ? "未找到可證明的 Struts 版本"
              : "版本證據互相衝突："
                  + versions.entrySet().stream()
                      .map(
                          entry ->
                              entry.getKey()
                                  + "（"
                                  + entry.getValue().file()
                                  + ":"
                                  + entry.getValue().line()
                                  + "）")
                      .toList());
    var entry = versions.entrySet().iterator().next();
    return new StrutsVersionEvidence(
        entry.getKey(),
        entry.getValue(),
        entry.getKey() + "（" + entry.getValue().file() + ":" + entry.getValue().line() + "）");
  }

  static void addMavenStrutsVersion(
      Element declaration, String file, Map<String, SourceLocation> versions) {
    String group = directText(declaration, "groupId"),
        artifact = directText(declaration, "artifactId"),
        version = directText(declaration, "version");
    if (("org.apache.struts".equals(group) || artifact.startsWith("struts-"))
        && version.matches("\\d+\\.\\d+\\.\\d+"))
      versions.putIfAbsent(version, new SourceLocation(file, sourceLine(declaration)));
  }
}
