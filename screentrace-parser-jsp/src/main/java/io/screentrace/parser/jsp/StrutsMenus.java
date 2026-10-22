package io.screentrace.parser.jsp;

import io.screentrace.scanner.SafeProjectFiles;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * struts-menu: menus declared in the MenuPlugIn's menu-config.xml and rendered by {@code <menu:displayMenu name="…"/>}.
 * The tag is rewritten in place into the menu's items as plain links, on the tag's own line, so every analysis that
 * reads links sees them. Nothing is guessed: a menu defined twice, or a page without the struts-menu taglib, is left as is.
 */
public final class StrutsMenus {
  record Item(String title, String href) { }

  private static final String DEFAULT_CONFIG = "/WEB-INF/menu-config.xml";
  private final Map<String, List<Item>> menus;

  private StrutsMenus(Map<String, List<Item>> menus) { this.menus = menus; }

  public static StrutsMenus none() { return new StrutsMenus(Map.of()); }

  /** Reads every menu config a MenuPlugIn in a struts-config*.xml points at (menuConfig, default /WEB-INF/menu-config.xml). */
  public static StrutsMenus load(Path root, List<Path> files) {
    Set<Path> configs = new TreeSet<>();
    Set<Path> known = new HashSet<>(files);
    for (Path file : files) {
      String name = file.getFileName().toString();
      if (!name.startsWith("struts-config") || !name.endsWith(".xml") || file.getParent() == null || file.getParent().getParent() == null) continue;
      try {
        String text = SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_XML_FILE_BYTES);
        if (!text.contains("MenuPlugIn")) continue;
        Path webRoot = file.getParent().getParent();
        List<String> declared = new ArrayList<>();
        String pending = null;
        boolean inPlugin = false;
        for (MarkupTag tag : MarkupTag.scan(text)) {
          if (!tag.name().equalsIgnoreCase("plug-in") && !tag.name().equalsIgnoreCase("set-property")) continue;
          if (tag.name().equalsIgnoreCase("plug-in")) {
            if (inPlugin) declared.add(pending == null ? DEFAULT_CONFIG : pending);
            inPlugin = !tag.closing() && String.valueOf(tag.attribute("classname")).endsWith("MenuPlugIn");
            pending = null;
          } else if (inPlugin && !tag.closing() && "menuConfig".equals(tag.attribute("property"))) pending = tag.attribute("value");
        }
        if (inPlugin) declared.add(pending == null ? DEFAULT_CONFIG : pending);
        for (String value : declared) {
          String clean = value == null ? "" : value.trim();
          if (!clean.startsWith("/") || clean.contains("..")) continue;
          Path config = webRoot.resolve(clean.substring(1)).normalize();
          if (config.startsWith(webRoot) && known.contains(config)) configs.add(config);
        }
      } catch (Exception ignored) {
        // An unreadable struts-config declares no menu.
      }
    }
    Map<String, List<Item>> menus = new LinkedHashMap<>();
    Set<String> duplicated = new HashSet<>();
    for (Path config : configs) {
      try {
        String text = SafeProjectFiles.readUtf8Limited(root, config, SafeProjectFiles.MAX_XML_FILE_BYTES);
        String current = null;
        List<Item> items = null;
        for (MarkupTag tag : MarkupTag.scan(text)) {
          String name = tag.name().toLowerCase(Locale.ROOT);
          if (name.equals("menu") && tag.closing()) { current = null; continue; }
          if (tag.closing()) continue;
          if (name.equals("menu")) {
            current = tag.attribute("name");
            if (current == null) continue;
            if (menus.containsKey(current)) duplicated.add(current);
            items = new ArrayList<>();
            menus.put(current, items);
          } else if (name.equals("item") && current != null) {
            String href = tag.attribute("location") != null ? tag.attribute("location") : tag.attribute("page");
            items.add(new Item(tag.attribute("title") == null ? "" : tag.attribute("title"), href));
          }
        }
      } catch (Exception ignored) {
        // An unreadable menu config defines no menus.
      }
    }
    duplicated.forEach(menus::remove);
    return new StrutsMenus(Map.copyOf(menus));
  }

  /** Replaces each {@code <prefix:displayMenu name="…"/>} of a declared menu with its items as links. */
  public String expand(String text) {
    if (menus.isEmpty() || !text.toLowerCase(Locale.ROOT).contains("displaymenu")) return text;
    Set<String> prefixes = new HashSet<>();
    for (MarkupTag tag : MarkupTag.scan(text))
      if (tag.name().startsWith("@") || tag.name().equalsIgnoreCase("@taglib"))
        if (tag.attribute("prefix") != null && String.valueOf(tag.attribute("uri")).contains("struts-menu")) prefixes.add(tag.attribute("prefix"));
    if (prefixes.isEmpty()) return text;
    StringBuilder out = new StringBuilder();
    int cursor = 0;
    for (MarkupTag tag : MarkupTag.scan(text)) {
      int colon = tag.name().indexOf(':');
      if (tag.closing() || colon < 0 || !prefixes.contains(tag.name().substring(0, colon)) || !tag.name().substring(colon + 1).equalsIgnoreCase("displayMenu")) continue;
      List<Item> items = menus.get(tag.attribute("name"));
      if (items == null || tag.start() < cursor) continue;
      out.append(text, cursor, tag.start());
      for (Item item : items) {
        if (item.href() == null) out.append("<span>").append(escape(item.title())).append("</span>");
        else out.append("<a href=\"").append(escape(item.href())).append("\">").append(escape(item.title())).append("</a>");
      }
      cursor = tag.end() + 1;
    }
    return out.append(text.substring(cursor)).toString();
  }

  private static String escape(String value) {
    return value.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;");
  }
}
