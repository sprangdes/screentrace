package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsGraphSupport.*;
import static io.screentrace.adapter.struts.StrutsMessages.*;
import static io.screentrace.adapter.struts.StrutsServletMappings.*;

import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.adapter.struts.StrutsModel.Tile;
import io.screentrace.adapter.struts.StrutsModel.TileScreenName;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.*;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import org.w3c.dom.*;

/** Tiles definitions, Tiles screens and their names. */
final class StrutsTiles {
  private StrutsTiles() {}

  static void readTiles(State state) {
    Map<String, Tile> tiles = new TreeMap<>();
    for (Path file : state.inventory.tilesConfigFiles())
      try {
        String path = relative(state, file);
        for (Element definition : StrutsSources.elements(readXml(file, state), "definition")) {
          String name = definition.getAttribute("name"),
              template =
                  definition.hasAttribute("template")
                      ? definition.getAttribute("template")
                      : definition.hasAttribute("page")
                          ? definition.getAttribute("page")
                          : definition.getAttribute("path");
          Map<String, String> puts = new TreeMap<>();
          for (String tag : List.of("put", "put-attribute"))
            for (Element item : StrutsSources.elements(definition, tag))
              puts.put(item.getAttribute("name"), item.getAttribute("value"));
          if (tiles.containsKey(name)) {
            diagnostic(
                state,
                "Tiles 定義重複：" + name,
                StrutsSources.source(path, definition),
                "TILES_AMBIGUOUS");
            tiles.remove(name);
            state.ambiguousTiles.add(name);
            continue;
          }
          if (!state.ambiguousTiles.contains(name))
            tiles.put(
                name,
                new Tile(
                    name,
                    template,
                    definition.getAttribute("extends"),
                    puts,
                    StrutsSources.source(path, definition)));
        }
      } catch (Exception error) {
        diagnostic(
            state,
            "Tiles 設定無法解析",
            new SourceLocation(relative(state, file), 1),
            "TILES_UNRESOLVED");
      }
    Map<String, Tile> resolved = new TreeMap<>();
    for (String name : tiles.keySet()) resolveTile(name, tiles, resolved, new HashSet<>(), state);
    state.tiles.putAll(resolved);
    Set<String> referencedDefinitions = new TreeSet<>();
    for (Tile tile : resolved.values()) {
      if (resolved.containsKey(tile.parent())) referencedDefinitions.add(tile.parent());
      for (String value : tile.puts().values())
        if (resolved.containsKey(value)) referencedDefinitions.add(value);
    }
    for (Path file : state.inventory.files())
      if (file.toString().endsWith(".jsp") || file.toString().endsWith(".jspf"))
        try {
          String text =
              SafeProjectFiles.readUtf8Limited(
                  state.inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
          for (MarkupTag tag : MarkupTag.scan(text))
            if (!tag.closing() && tag.name().equalsIgnoreCase("tiles:insert")) {
              String target = first(tag, "definition", "name", "page", "value");
              if (resolved.containsKey(target)) referencedDefinitions.add(target);
            }
        } catch (Exception unread) {
          // JspProjectParser reports an unreadable page; it only references no Tiles definition
          // here.
        }
    for (String name : resolved.keySet())
      if (!referencedDefinitions.contains(name)) state.tilePageDefinitions.add(name);
    for (String page : state.tilePageDefinitions)
      collectTileDefinitions(
          page,
          state,
          state.tilePageOwners.computeIfAbsent(page, key -> new TreeSet<>()),
          new HashSet<>());
    for (String name : resolved.keySet())
      if (state.tilePageOwners.values().stream().noneMatch(owners -> owners.contains(name)))
        state.tileStandaloneDefinitions.add(name);
    for (Tile tile : resolved.values()) {
      String viewId = ApplicationGraph.id(NodeType.VIEW, "tiles:" + tile.name());
      state.tileViewIds.put(tile.name(), viewId);
      String template = resolvedTileTemplate(tile, state),
          displayView = tile.parent().isBlank() ? template : tile.template();
      Confidence status =
          state.viewIds.containsKey(template) ? Confidence.CONFIRMED : Confidence.UNRESOLVED;
      Map<String, String> attributes = new TreeMap<>();
      attributes.put("view", displayView);
      if (!Objects.equals(displayView, template)) attributes.put("resolvedView", template);
      if (!tile.parent().isBlank()) attributes.put("extends", tile.parent());
      if (tile.parent().isBlank() && !Objects.equals(template, tile.template()))
        attributes.put("originalView", tile.template());
      addNode(state, viewId, NodeType.VIEW, tile.name(), attributes, tile.source(), status);
    }
    for (Tile tile : resolved.values()) {
      String viewId = state.tileViewIds.get(tile.name());
      String parentViewId = state.tileViewIds.get(tile.parent());
      if (parentViewId != null)
        edge(
            state,
            EdgeType.INCLUDES,
            viewId,
            parentViewId,
            Confidence.CONFIRMED,
            tile.source(),
            "Tiles definition extends=" + tile.parent());
      List<String> targets = new ArrayList<>(tile.puts().values());
      targets.add(tile.template());
      for (String target : targets) {
        String referenced = tileViewId(target, state);
        if (referenced == null) referenced = state.tileViewIds.get(target);
        if (referenced != null)
          edge(state, EdgeType.INCLUDES, viewId, referenced, Confidence.CONFIRMED, tile.source());
        else if (target.endsWith(".jsp") || target.startsWith("/"))
          diagnostic(state, "Tiles 屬性目標未解析：" + target, tile.source(), "TILES_REFERENCE_UNRESOLVED");
      }
    }
  }

  static void collectTileDefinitions(
      String name, State state, Set<String> owners, Set<String> seen) {
    if (!seen.add(name)) return;
    owners.add(name);
    Tile tile = state.tiles.get(name);
    if (tile == null) return;
    if (state.tiles.containsKey(tile.parent()))
      collectTileDefinitions(tile.parent(), state, owners, seen);
    List<String> targets = new ArrayList<>(tile.puts().values());
    targets.add(tile.template());
    for (String value : targets)
      if (state.tiles.containsKey(value)) collectTileDefinitions(value, state, owners, seen);
      else if (value.endsWith(".jsp") || value.endsWith(".jspf") || value.endsWith(".faces"))
        for (String inserted : tileInsertDefinitions(value, state))
          collectTileDefinitions(inserted, state, owners, seen);
  }

  static Set<String> tileInsertDefinitions(String target, State state) {
    String path = tileJspViewPath(target, state);
    if (path == null) return Set.of();
    Path file = state.inventory.root().resolve(path);
    try {
      String text =
          SafeProjectFiles.readUtf8Limited(
              state.inventory.root(), file, SafeProjectFiles.MAX_JSP_FILE_BYTES);
      Set<String> result = new TreeSet<>();
      for (MarkupTag tag : MarkupTag.scan(text))
        if (!tag.closing() && tag.name().equalsIgnoreCase("tiles:insert")) {
          String definition = first(tag, "definition", "name", "page", "value");
          if (definition != null && state.tiles.containsKey(definition)) result.add(definition);
        }
      return result;
    } catch (IOException | SecurityException error) {
      return Set.of();
    }
  }

  static String tileJspViewPath(String target, State state) {
    String resolvedTarget = normalizeFacesPath(target, state);
    if (resolvedTarget == null) return null;
    String viewId = state.viewIds.get(resolvedTarget);
    if (viewId == null) {
      List<String> candidates =
          state.viewIds.entrySet().stream()
              .filter(entry -> entry.getKey().endsWith(resolvedTarget))
              .map(Map.Entry::getValue)
              .distinct()
              .toList();
      if (candidates.size() == 1) viewId = candidates.get(0);
    }
    GraphNode view = viewId == null ? null : state.nodes.get(viewId);
    if (view != null)
      return view.attributes().getOrDefault("resolvedView", view.attributes().get("view"));
    String suffix = resolvedTarget.startsWith("/") ? resolvedTarget.substring(1) : resolvedTarget;
    List<String> paths =
        state.inventory.files().stream()
            .filter(file -> relative(state, file).endsWith(suffix))
            .map(file -> relative(state, file))
            .distinct()
            .toList();
    return paths.size() == 1 ? paths.get(0) : null;
  }

  static String resolvedTileTemplate(Tile tile, State state) {
    String resolved = tileJspViewPath(tile.template(), state);
    return resolved == null ? tile.template() : resolved;
  }

  static TileScreenName tileScreenName(Tile tile, State state) {
    String title = staticTileTitle(tile.puts().get("title"), state);
    if (title != null) return new TileScreenName(title, "Tiles title put", tile.source().file());
    String body = tilePrimaryBodyPath(tile, state, new HashSet<>());
    String bodyName = body == null ? null : staticJspPageName(body, state);
    if (bodyName != null) return new TileScreenName(bodyName, "body JSP", body);
    return new TileScreenName(
        humanizeTileDefinition(tile.name()), "Tiles definition name", tile.source().file());
  }

  static String staticTileTitle(String value, State state) {
    if (value == null || value.isBlank()) return null;
    String candidate = value.strip();
    List<MarkupTag> tags = MarkupTag.scan(candidate);
    if (tags.size() == 1
        && isMessageTag(tags.get(0))
        && tags.get(0).start() == 0
        && tags.get(0).end() == candidate.length() - 1) {
      String resolved = message(tags.get(0), state);
      return resolved == null ? null : cleanScreenName(resolved);
    }
    if (candidate.matches("(?s).*\\$\\{|.*#\\{|.*<%.*")) return null;
    Set<String> translations = state.messages.get(candidate);
    if (translations != null && translations.size() == 1)
      return cleanScreenName(translations.iterator().next());
    if (candidate.contains("<") || candidate.contains(">")) return null;
    return cleanScreenName(candidate);
  }

  static String tilePrimaryBodyPath(Tile tile, State state, Set<String> seen) {
    if (!seen.add(tile.name())) return null;
    String target = tile.puts().get("body");
    if (target == null || target.isBlank()) {
      List<String> content =
          tile.puts().entrySet().stream()
              .filter(
                  entry ->
                      !Set.of("title", "header", "footer", "menu")
                          .contains(entry.getKey().toLowerCase(Locale.ROOT)))
              .map(Map.Entry::getValue)
              .filter(value -> value != null && !value.isBlank())
              .distinct()
              .toList();
      if (content.size() != 1) return null;
      target = content.get(0);
    }
    Tile nested = state.tiles.get(target);
    if (nested != null) return tilePrimaryBodyPath(nested, state, seen);
    if (!(target.endsWith(".jsp") || target.endsWith(".jspf") || target.endsWith(".faces")))
      return null;
    return tileJspViewPath(target, state);
  }

  static String staticJspPageName(String path, State state) {
    try {
      String source =
          SafeProjectFiles.readUtf8Limited(
              state.inventory.root(),
              state.inventory.root().resolve(path),
              SafeProjectFiles.MAX_JSP_FILE_BYTES);
      // The first <title>, then each <h1>; MarkupTag skips tags inside comments and scriptlets.
      List<String> titles = MarkupTag.contents(source, "title");
      if (!titles.isEmpty()) {
        String name = staticMarkupLabel(withoutCommentsAndScriptlets(titles.get(0)), state);
        if (name != null) return name;
      }
      for (String heading : MarkupTag.contents(source, "h1")) {
        String name = staticMarkupLabel(withoutCommentsAndScriptlets(heading), state);
        if (name != null) return name;
      }
    } catch (IOException | SecurityException unread) {
      // JspProjectParser reports an unreadable page; it only gives no page name here.
    }
    return null;
  }

  static String staticMarkupLabel(String markup, State state) {
    if (MarkupTag.scan(markup).stream()
            .anyMatch(
                tag ->
                    !tag.closing()
                        && Set.of("c:choose", "c:when", "c:if", "c:foreach")
                            .contains(tag.name().toLowerCase(Locale.ROOT)))
        || markup.matches("(?s).*\\$\\{|.*#\\{|.*<%.*")) return null;
    String resolved =
        MarkupTag.replaceTags(markup, StrutsTiles::isMessageTag, tag -> message(tag, state));
    if (resolved == null) return null;
    String label =
        resolved
            .replaceAll("(?is)<[^>]*>", " ")
            .replaceAll("&amp;", "&")
            .replaceAll("&lt;", "<")
            .replaceAll("&gt;", ">")
            .replaceAll("&quot;", "\"")
            .replaceAll("&#39;", "'");
    return cleanScreenName(label);
  }

  static boolean isMessageTag(MarkupTag tag) {
    String name = tag.name().toLowerCase(Locale.ROOT);
    return name.equals("bean:message") || name.equals("s:message");
  }

  /** The resolved text of a bean:message / s:message tag; null when its key is not found. */
  static String message(MarkupTag tag, State state) {
    String key = tag.attribute("key");
    if (key == null) return null;
    String resolved = resolveMessage(state, tag.attribute("bundle"), key);
    return resolved.startsWith("（訊息 key：") ? null : resolved;
  }

  /** Comments and scriptlets inside an element's text are not part of its static label. */
  static String withoutCommentsAndScriptlets(String markup) {
    return markup
        .replaceAll("(?s)<%--.*?--%>", "")
        .replaceAll("(?s)<!--.*?-->", "")
        .replaceAll("(?s)<%(?!@).*?%>", "");
  }

  static String cleanScreenName(String value) {
    String cleaned =
        value == null
            ? ""
            : value
                .replaceAll("\\$\\{[^{}]*}|#\\{[^{}]*}|<%.*?%>", " ")
                .replaceAll("\\s+", " ")
                .strip();
    return cleaned.isBlank() ? null : cleaned;
  }

  static String humanizeTileDefinition(String value) {
    String name =
        value == null
            ? ""
            : value
                .replaceFirst("^\\.+", "")
                .replaceAll("([a-z0-9])([A-Z])", "$1 $2")
                .replaceAll("([A-Z])([A-Z][a-z])", "$1 $2")
                .replaceAll("[._-]+", " ")
                .replaceAll("\\s+", " ")
                .strip();
    if (name.isBlank()) return "未命名畫面";
    StringBuilder result = new StringBuilder();
    boolean capitalize = true;
    for (char character : name.toCharArray()) {
      if (Character.isWhitespace(character)) {
        result.append(character);
        capitalize = true;
      } else {
        result.append(capitalize ? Character.toUpperCase(character) : character);
        capitalize = false;
      }
    }
    return result.toString();
  }

  static boolean isTilesLayoutPath(String path, State state) {
    return state.tiles.values().stream()
        .map(tile -> resolvedTileTemplate(tile, state))
        .anyMatch(path::equals);
  }

  static String tileViewId(String target, State state) {
    String viewId = state.viewIds.get(target);
    if (viewId == null
        && (target.endsWith(".jsp") || target.endsWith(".jspf") || target.endsWith(".faces"))) {
      String path = tileJspViewPath(target, state);
      if (path != null) viewId = state.viewIds.get(path);
    }
    return viewId;
  }

  static boolean sameJspPath(String actual, String target, State state) {
    String resolved = tileJspViewPath(target, state);
    return actual.equals(resolved)
        || (resolved == null && actual.endsWith(target.startsWith("/") ? target : "/" + target));
  }

  static void materializeTileScreens(State state) {
    if (state.tiles.isEmpty()) return;
    for (String name : new TreeSet<>(state.tilePageDefinitions)) ensureTileScreen(name, state);
    for (String name : new TreeSet<>(state.tileStandaloneDefinitions)) {
      String screen = ensureTileScreen(name, state);
      if (screen == null) continue;
      for (String path : tileJspPaths(name, state)) {
        state.tilePageJspPaths.add(path);
        state.tileFragmentOwners.computeIfAbsent(path, key -> new TreeSet<>()).add(screen);
      }
    }
    for (var entry : state.tilePageOwners.entrySet()) {
      String page = entry.getKey(), screen = state.screens.get(page);
      if (screen == null) continue;
      for (String definition : entry.getValue())
        for (String path : tileJspPaths(definition, state)) {
          state.tilePageJspPaths.add(path);
          state.tileFragmentOwners.computeIfAbsent(path, key -> new TreeSet<>()).add(screen);
          String viewId = state.viewIds.get(path);
          Tile tile = state.tiles.get(definition);
          if (viewId != null && tile != null)
            edge(
                state,
                EdgeType.INCLUDES,
                screen,
                viewId,
                Confidence.CONFIRMED,
                tile.source(),
                "Tiles 版型／片段歸入頁面定義畫面");
        }
    }
    for (String path : state.tilePageJspPaths) removeUnroutedImplicitScreen(path, state);
  }

  static Set<String> tileJspPaths(String definition, State state) {
    Set<String> paths = new TreeSet<>();
    collectTileJspPaths(definition, state, new HashSet<>(), paths);
    return paths;
  }

  static void collectTileJspPaths(
      String definition, State state, Set<String> seen, Set<String> paths) {
    if (!seen.add(definition)) return;
    Tile tile = state.tiles.get(definition);
    if (tile == null) return;
    List<String> targets = new ArrayList<>(tile.puts().values());
    targets.add(tile.template());
    for (String target : targets) {
      if (state.tiles.containsKey(target)) collectTileJspPaths(target, state, seen, paths);
      else if (target.endsWith(".jsp") || target.endsWith(".jspf") || target.endsWith(".faces")) {
        String path = tileJspViewPath(target, state);
        if (path != null) {
          paths.add(path);
          for (String inserted : tileInsertDefinitions(path, state))
            collectTileJspPaths(inserted, state, seen, paths);
        }
      }
    }
  }

  static void removeUnroutedImplicitScreen(String path, State state) {
    String id = state.screens.get(path);
    if (id == null) return;
    boolean directEntry =
        state.edges.values().stream()
            .anyMatch(
                edge ->
                    edge.to().equals(id)
                        && Set.of(EdgeType.RENDERS, EdgeType.FORWARDS_TO, EdgeType.NAVIGATES_TO)
                            .contains(edge.type()));
    if (directEntry) return;
    state.nodes.remove(id);
    state
        .edges
        .entrySet()
        .removeIf(entry -> entry.getValue().from().equals(id) || entry.getValue().to().equals(id));
    state.screens.entrySet().removeIf(entry -> entry.getValue().equals(id));
  }

  static String ensureTileScreen(String name, State state) {
    String existing = state.screens.get(name);
    if (existing != null) return existing;
    Tile tile = state.tiles.get(name);
    if (tile == null) return null;
    String screen = ApplicationGraph.id(NodeType.SCREEN, "tiles:" + tile.name()),
        viewId = state.tileViewIds.get(tile.name());
    String template = resolvedTileTemplate(tile, state);
    Confidence status =
        state.viewIds.containsKey(template) ? Confidence.CONFIRMED : Confidence.UNRESOLVED;
    TileScreenName display = tileScreenName(tile, state);
    Map<String, String> attributes = new TreeMap<>();
    attributes.put("view", template);
    attributes.put("tilesDefinition", "true");
    attributes.put("tilesDefinitionName", tile.name());
    attributes.put("screenNameSource", display.source());
    attributes.put("screenNameSourcePath", display.path());
    if (!Objects.equals(template, tile.template())) attributes.put("originalView", tile.template());
    attributes.put("tilesAttributes", tilesAttributesJson(tile, state));
    addNode(state, screen, NodeType.SCREEN, display.name(), attributes, tile.source(), status);
    state.screens.put(name, screen);
    List<String> targets = new ArrayList<>(tile.puts().values());
    targets.add(tile.template());
    for (String target : targets) {
      String view = tileViewId(target, state);
      if (view == null) view = state.tileViewIds.get(target);
      if (view != null)
        edge(state, EdgeType.INCLUDES, screen, view, Confidence.CONFIRMED, tile.source());
      else if (target.endsWith(".jsp") || target.startsWith("/"))
        diagnostic(state, "Tiles 屬性目標未解析：" + target, tile.source(), "TILES_REFERENCE_UNRESOLVED");
      if (target.endsWith(".jsp")) {
        state.tileFragmentOwners.computeIfAbsent(target, key -> new TreeSet<>()).add(screen);
        String targetView = state.viewIds.get(target);
        if (targetView == null) {
          List<String> matches =
              state.viewIds.values().stream()
                  .distinct()
                  .filter(
                      candidate -> {
                        GraphNode candidateView = state.nodes.get(candidate);
                        String actual =
                            candidateView == null ? null : candidateView.attributes().get("view");
                        return actual != null
                            && actual.endsWith(target.startsWith("/") ? target : "/" + target);
                      })
                  .toList();
          if (matches.size() == 1) targetView = matches.get(0);
        }
        GraphNode targetViewNode = targetView == null ? null : state.nodes.get(targetView);
        if (targetViewNode != null) {
          String sourcePath = targetViewNode.attributes().get("view");
          if (sourcePath != null)
            state
                .tileFragmentOwners
                .computeIfAbsent(sourcePath, key -> new TreeSet<>())
                .add(screen);
        }
      }
    }
    return screen;
  }

  /**
   * The resolved put values of a page definition, so the static preview can fill each tiles:insert
   * slot of its template.
   */
  static String tilesAttributesJson(Tile tile, State state) {
    try {
      return new com.fasterxml.jackson.databind.ObjectMapper()
          .writeValueAsString(tilesContext(tile, state, new HashSet<>()));
    } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
      throw new UncheckedIOException(error);
    }
  }

  static Map<String, Object> tilesContext(Tile tile, State state, Set<String> stack) {
    stack.add(tile.name());
    Map<String, Object> attributes = new TreeMap<>();
    for (var put : tile.puts().entrySet()) {
      String value = put.getValue();
      Tile nested = state.tiles.get(value);
      if (nested != null && !stack.contains(value))
        attributes.put(put.getKey(), Map.of("definition", tilesContext(nested, state, stack)));
      else if (nested != null) attributes.put(put.getKey(), Map.of("unresolved", value));
      else if (value.startsWith("/") || value.matches("(?i).*\\.(jspf?|html?)$")) {
        String path = tileJspViewPath(value, state);
        attributes.put(
            put.getKey(), path == null ? Map.of("unresolved", value) : Map.of("path", path));
      } else attributes.put(put.getKey(), Map.of("value", value));
    }
    stack.remove(tile.name());
    Map<String, Object> context = new TreeMap<>();
    context.put("template", resolvedTileTemplate(tile, state));
    context.put("attributes", attributes);
    return context;
  }

  static Tile resolveTile(
      String name,
      Map<String, Tile> definitions,
      Map<String, Tile> resolved,
      Set<String> stack,
      State state) {
    if (resolved.containsKey(name)) return resolved.get(name);
    Tile tile = definitions.get(name);
    if (tile == null) return null;
    if (!stack.add(name)) {
      diagnostic(state, "Tiles extends 循環：" + name, tile.source(), "TILES_CYCLE");
      return null;
    }
    Map<String, String> puts = new TreeMap<>();
    String template = tile.template();
    if (!tile.parent().isBlank()) {
      Tile parent = resolveTile(tile.parent(), definitions, resolved, stack, state);
      if (parent == null) {
        diagnostic(
            state, "Tiles parent 未解析：" + tile.parent(), tile.source(), "TILES_PARENT_UNRESOLVED");
        stack.remove(name);
        return null;
      }
      puts.putAll(parent.puts());
      if (template.isBlank()) template = parent.template();
    }
    puts.putAll(tile.puts());
    Tile result = new Tile(name, template, tile.parent(), puts, tile.source());
    resolved.put(name, result);
    stack.remove(name);
    return result;
  }
}
