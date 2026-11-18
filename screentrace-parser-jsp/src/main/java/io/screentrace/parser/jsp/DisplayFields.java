package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.ComponentKind;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.core.StableGraphIds;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Display fields (ADR 0157): an HTML element whose own content prints data — EL text such as {@code
 * ${owner.lastName}}, {@code <c:out>}, {@code <bean:write>}, {@code <fmt:format…>}, or a Thymeleaf
 * {@code th:text}. The element is the component, so the preview capture finds it the way it finds
 * every other component (same id from the same tag and attributes). An element that is already a
 * component (a button, a link, an input) keeps that kind. Output repeated in a loop is one
 * component, marked repeated. The name is the nearest label the markup proves — the column's table
 * header, a preceding label or term, or text such as 「姓名：」 before the output — and otherwise the
 * bound property.
 */
final class DisplayFields {
  private DisplayFields() {}

  private static final Pattern EL = Pattern.compile("\\$\\{([^}]{1,500})}");
  private static final Pattern PATH =
      Pattern.compile("[A-Za-z_$][\\w$]*(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*|\\[[^\\]]{1,40}])*");
  private static final Set<String> OUTPUT_TAGS =
      Set.of(
          "c:out",
          "bean:write",
          "nested:write",
          "fmt:formatnumber",
          "fmt:formatdate",
          "spring:escapebody");
  private static final Set<String> LOOPS = Set.of("c:foreach", "logic:iterate", "nested:iterate");

  /** Elements whose content is not page text, or that are never a field of their own. */
  private static final Set<String> NOT_FIELDS =
      Set.of(
          "html",
          "head",
          "title",
          "body",
          "script",
          "style",
          "option",
          "optgroup",
          "textarea",
          "select",
          "noscript",
          "template");

  private static final class Frame {
    final MarkupTag token;
    final String tag;
    final String id;
    final boolean repeated;
    final String guard;
    final List<String> outputs = new ArrayList<>();
    final StringBuilder text = new StringBuilder();
    String leadingText;
    String previousLabel;
    int column = -1;
    int cells;
    boolean headerRow;
    List<String> headers;

    Frame(MarkupTag token, String tag, String id, boolean repeated, String guard) {
      this.token = token;
      this.tag = tag;
      this.id = id;
      this.repeated = repeated;
      this.guard = guard;
    }
  }

  static MarkupAnalysis add(
      MarkupAnalysis markup, String path, String text, Map<Integer, String> anchors) {
    var fields = find(path, text, anchors);
    if (fields.isEmpty()) return markup;
    var existing = new java.util.HashSet<String>();
    for (var c : markup.components()) existing.add(c.id());
    List<MarkupAnalysis.Component> components = new ArrayList<>(markup.components());
    for (var field : fields) if (existing.add(field.id())) components.add(field);
    return new MarkupAnalysis(components, markup.events(), markup.rules(), markup.behaviors());
  }

  static List<MarkupAnalysis.Component> find(
      String path, String text, Map<Integer, String> anchors) {
    List<MarkupAnalysis.Component> result = new ArrayList<>();
    List<Frame> stack = new ArrayList<>();
    List<String> scopes = new ArrayList<>(); // loop and condition tags, for repeated and guard
    List<String> guards = new ArrayList<>();
    Map<String, Integer> occurrences = new HashMap<>();
    int position = 0;
    for (MarkupTag token : MarkupTag.scan(text)) {
      if (token.start() > position) content(stack, text.substring(position, token.start()));
      position = Math.max(position, token.end() + 1);
      String tag = token.name().toLowerCase(Locale.ROOT);
      if (token.closing()) {
        for (int i = scopes.size() - 1; i >= 0; i--)
          if (scopes.get(i).equals(tag)) {
            scopes.subList(i, scopes.size()).clear();
            guards.subList(i, guards.size()).clear();
            break;
          }
        for (int i = stack.size() - 1; i >= 0; i--)
          if (stack.get(i).tag.equals(tag)) {
            while (stack.size() > i) close(stack, path, anchors, result);
            break;
          }
        continue;
      }
      var attrs = token.attributes();
      boolean selfClosing = token.end() > 0 && text.charAt(token.end() - 1) == '/';
      if (OUTPUT_TAGS.contains(tag)) {
        String expression =
            tag.endsWith(":write")
                ? join(attrs.get("name"), attrs.get("property"))
                : attrs.getOrDefault("value", "");
        if (!stack.isEmpty() && expression != null && !expression.isBlank())
          output(stack.get(stack.size() - 1), expression);
        continue;
      }
      if (LOOPS.contains(tag) || MarkupAnalysis.isConditional(tag)) {
        if (!selfClosing) {
          scopes.add(tag);
          guards.add(LOOPS.contains(tag) ? null : MarkupAnalysis.condition(token));
        }
        continue;
      }
      if (tag.contains(":") || tag.startsWith("@") || tag.startsWith("!")) continue;
      // Every element is counted, as the capture counts it, so ids match.
      Map<String, String> identity = new TreeMap<>(attrs);
      identity.put("tag", tag);
      int occurrence =
          occurrences.merge(ComponentKind.DISPLAY_FIELD + identity.toString(), 1, Integer::sum) - 1;
      String id = StableGraphIds.component(path, ComponentKind.DISPLAY_FIELD, identity, occurrence);
      boolean repeated =
          scopes.stream().anyMatch(LOOPS::contains)
              || attrs.containsKey("th:each")
              || attrs.containsKey("data-th-each")
              || stack.stream().anyMatch(f -> f.repeated);
      String guard =
          guards.stream()
              .filter(java.util.Objects::nonNull)
              .reduce((a, b) -> a + " && " + b)
              .orElse(null);
      var frame = new Frame(token, tag, id, repeated, guard);
      table(stack, frame, attrs);
      for (String key : List.of("th:text", "th:utext", "data-th-text", "data-th-utext"))
        if (attrs.get(key) != null && !attrs.get(key).isBlank()) output(frame, attrs.get(key));
      if (selfClosing || MarkupTag.VOID_ELEMENTS.contains(tag)) {
        // A void element holds no text; a th:text on it still prints nothing.
        continue;
      }
      stack.add(frame);
    }
    if (position < text.length()) content(stack, text.substring(position));
    while (!stack.isEmpty()) close(stack, path, anchors, result);
    return result;
  }

  /** Table bookkeeping: each cell's column, and the header texts of the table. */
  private static void table(List<Frame> stack, Frame frame, Map<String, String> attrs) {
    if (frame.tag.equals("table")) frame.headers = new ArrayList<>();
    if (frame.tag.equals("tr")) {
      Frame head = nearest(stack, "thead");
      frame.headerRow = head != null && nearestIndex(stack, "thead") > nearestIndex(stack, "table");
    }
    if (frame.tag.equals("td") || frame.tag.equals("th")) {
      Frame row = nearest(stack, "tr");
      if (row != null) {
        frame.column = row.cells;
        int span = 1;
        try {
          span =
              Math.max(
                  1, Math.min(50, Integer.parseInt(attrs.getOrDefault("colspan", "1").trim())));
        } catch (NumberFormatException ignored) {
          // A computed colspan counts as one column; later headers may then not line up.
        }
        row.cells += span;
        if (frame.tag.equals("th")) row.headerRow = true;
      }
    }
  }

  private static Frame nearest(List<Frame> stack, String tag) {
    int at = nearestIndex(stack, tag);
    return at < 0 ? null : stack.get(at);
  }

  private static int nearestIndex(List<Frame> stack, String tag) {
    for (int i = stack.size() - 1; i >= 0; i--) if (stack.get(i).tag.equals(tag)) return i;
    return -1;
  }

  private static void content(List<Frame> stack, String raw) {
    if (stack.isEmpty()) return;
    Frame top = stack.get(stack.size() - 1);
    if (Set.of("script", "style").contains(top.tag)) return;
    Matcher el = EL.matcher(raw);
    int last = 0;
    while (el.find()) {
      String before = raw.substring(last, el.start());
      top.text.append(before);
      output(top, el.group(0));
      last = el.end();
    }
    top.text.append(raw.substring(last));
  }

  private static void output(Frame frame, String expression) {
    if (frame.outputs.isEmpty()) frame.leadingText = plain(frame.text.toString());
    frame.outputs.add(expression.strip());
  }

  private static void close(
      List<Frame> stack,
      String path,
      Map<Integer, String> anchors,
      List<MarkupAnalysis.Component> result) {
    Frame frame = stack.remove(stack.size() - 1);
    Frame parent = stack.isEmpty() ? null : stack.get(stack.size() - 1);
    String own = plain(frame.text.toString());
    // Labels for later siblings: a label, a term, a header cell, or emphasized text that ends a
    // label.
    if (parent != null
        && Set.of("label", "dt", "th", "strong", "b").contains(frame.tag)
        && frame.outputs.isEmpty()
        && !own.isEmpty()) parent.previousLabel = own.replaceAll("[:：]\\s*$", "");
    if (frame.tag.equals("th") && frame.outputs.isEmpty()) {
      Frame row = nearest(stack, "tr"), table = nearest(stack, "table");
      if (row != null && row.headerRow && table != null && table.headers != null) {
        while (table.headers.size() <= frame.column) table.headers.add(null);
        if (frame.column >= 0 && table.headers.get(frame.column) == null)
          table.headers.set(frame.column, own);
      }
    }
    // Text read so far belongs to the parent's content too, for its own label and value.
    if (parent != null) parent.text.append(' ').append(own).append(' ');
    if (frame.outputs.isEmpty()
        || NOT_FIELDS.contains(frame.tag)
        || MarkupAnalysis.kind(frame.tag, frame.token.attributes()) != null) return;
    String[] label = label(stack, frame, parent);
    String expression = String.join(" ", frame.outputs);
    if (expression.length() > 300) expression = expression.substring(0, 300) + "…";
    String property = property(frame.outputs.get(0));
    Map<String, String> attrs = new TreeMap<>(frame.token.attributes());
    attrs.put("expression", expression);
    if (property != null) attrs.put("property", property);
    String name = label[0] != null ? label[0] : property != null ? property : expression;
    attrs.put("displayName", name.length() > 80 ? name.substring(0, 80) + "…" : name);
    attrs.put(
        "labelSource", label[0] != null ? label[1] : property != null ? "property" : "expression");
    String anchor = anchors.get(frame.token.start());
    if (anchor != null) attrs.put("expansionAnchor", anchor);
    result.add(
        new MarkupAnalysis.Component(
            frame.id,
            ComponentKind.DISPLAY_FIELD,
            frame.tag,
            attrs,
            new SourceLocation(path, frame.token.line()),
            frame.guard,
            frame.repeated,
            null,
            null,
            null,
            Confidence.UNRESOLVED));
  }

  /** The label the markup proves for a field, and where it came from. */
  private static String[] label(List<Frame> stack, Frame frame, Frame parent) {
    Frame cell = frame.column >= 0 ? frame : null;
    for (int i = stack.size() - 1; cell == null && i >= 0; i--)
      if (stack.get(i).column >= 0) cell = stack.get(i);
    if (cell != null && cell.tag.equals("td")) {
      Frame table = nearest(stack, "table");
      if (table != null
          && table.headers != null
          && cell.column < table.headers.size()
          && table.headers.get(cell.column) != null
          && !table.headers.get(cell.column).isBlank())
        return new String[] {table.headers.get(cell.column), "tableHeader"};
    }
    String leading = frame.leadingText == null ? "" : frame.leadingText;
    if (leading.matches(".{1,40}[:：]"))
      return new String[] {leading.replaceAll("[:：]$", "").strip(), "leadingText"};
    if (parent != null && parent.previousLabel != null && parent.previousLabel.length() <= 40)
      return new String[] {parent.previousLabel, "precedingLabel"};
    return new String[] {null, null};
  }

  /** The model property an output reads, when it is a plain property path. */
  static String property(String output) {
    String body = output.strip();
    if (body.startsWith("${") && body.endsWith("}")) body = body.substring(2, body.length() - 1);
    body = body.strip();
    if (body.startsWith("#{") || body.startsWith("*{"))
      body = body.substring(2, body.length() - 1).strip();
    Matcher whole = PATH.matcher(body);
    if (whole.matches()) return body.replaceAll("\\s+", "");
    // fn:escapeXml(owner.name), owner.name ?: '-': the first dotted path is the property.
    Matcher any = Pattern.compile("[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)+").matcher(body);
    return any.find() ? any.group() : null;
  }

  private static String join(String name, String property) {
    if (name == null || name.isBlank()) return property;
    return property == null || property.isBlank() ? name : name + "." + property;
  }

  private static String plain(String text) {
    return EL.matcher(text)
        .replaceAll(" ")
        .replaceAll("&nbsp;", " ")
        .replaceAll("\\s+", " ")
        .strip();
  }
}
