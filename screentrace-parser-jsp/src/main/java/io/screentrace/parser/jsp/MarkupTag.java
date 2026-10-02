package io.screentrace.parser.jsp;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Minimal quote-aware JSP markup tokenizer for element names and literal attributes. */
public final class MarkupTag {
  private final String name;
  private final Map<String, String> attributes;
  private final int line;
  private final int end;
  private final boolean closing;

  private MarkupTag(String name, Map<String, String> attributes, int line, int end, boolean closing) {
    this.name = name;
    this.attributes = attributes;
    this.line = line;
    this.end = end;
    this.closing = closing;
  }

  public static List<MarkupTag> scan(String source) {
    List<MarkupTag> tags = new ArrayList<>();
    int line = 1, lineCursor = 0;
    for (int start = source.indexOf('<'); start >= 0; start = source.indexOf('<', start + 1)) {
      if (source.startsWith("<!--", start) || source.startsWith("<%--", start)) {
        String delimiter = source.startsWith("<!--", start) ? "-->" : "--%>";
        int close = source.indexOf(delimiter, start + 4);
        if (close < 0) break;
        start = close + delimiter.length() - 1;
        continue;
      }
      if (source.startsWith("<%", start) && !source.startsWith("<%@", start)) {
        int close = source.indexOf("%>", start + 2);
        if (close < 0) break;
        start = close + 1;
        continue;
      }
      int end = endOfTag(source, start);
      if (end < 0) break;
      while (lineCursor < start) if (source.charAt(lineCursor++) == '\n') line++;
      String body = source.substring(start + 1, end).trim();
      MarkupTag tag = parse(body, line, end);
      if (tag != null) tags.add(tag);
      start = end;
      if (tag != null && !tag.closing() && (tag.name().equalsIgnoreCase("script") || tag.name().equalsIgnoreCase("style"))) {
        int close = source.toLowerCase(Locale.ROOT).indexOf("</" + tag.name().toLowerCase(Locale.ROOT), end + 1);
        if (close < 0) break;
        start = close - 1;
      }
    }
    return tags;
  }

  public String name() { return name; }
  public int line() { return line; }
  public int end() { return end; }
  public boolean closing() { return closing; }
  public Map<String, String> attributes() { return Map.copyOf(attributes); }
  public String attribute(String name) { return attributes.get(name.toLowerCase(Locale.ROOT)); }

  private static int endOfTag(String source, int start) {
    char quote = 0;
    for (int index = start + 1; index < source.length(); index++) {
      char current = source.charAt(index);
      if (quote != 0) {
        if (current == quote) quote = 0;
      } else if (current == '\'' || current == '"') quote = current;
      else if (current == '>') return index;
    }
    return -1;
  }

  private static MarkupTag parse(String body, int line, int end) {
    if (body.startsWith("%@")) {
      body = "@" + body.substring(2).trim().replaceFirst("%$", "");
    }
    if (body.isBlank() || body.startsWith("!") || body.startsWith("%")) return null;
    boolean closing = body.startsWith("/");
    if (closing) body = body.substring(1).trim();
    int split = 0;
    while (split < body.length() && !Character.isWhitespace(body.charAt(split)) && body.charAt(split) != '/') split++;
    String name = body.substring(0, split);
    return new MarkupTag(name, attributes(body.substring(split)), line, end, closing);
  }

  private static Map<String, String> attributes(String body) {
    Map<String, String> values = new LinkedHashMap<>();
    for (int index = 0; index < body.length();) {
      while (index < body.length() && (Character.isWhitespace(body.charAt(index)) || body.charAt(index) == '/')) index++;
      int nameStart = index;
      while (index < body.length() && !Character.isWhitespace(body.charAt(index)) && body.charAt(index) != '=' && body.charAt(index) != '/') index++;
      if (nameStart == index) break;
      String name = body.substring(nameStart, index).toLowerCase(Locale.ROOT);
      while (index < body.length() && Character.isWhitespace(body.charAt(index))) index++;
      if (index >= body.length() || body.charAt(index) != '=') continue;
      index++;
      while (index < body.length() && Character.isWhitespace(body.charAt(index))) index++;
      if (index >= body.length()) break;
      char quote = body.charAt(index);
      int valueStart;
      int valueEnd;
      if (quote == '\'' || quote == '"') {
        valueStart = ++index;
        while (index < body.length() && body.charAt(index) != quote) index++;
        valueEnd = index;
        if (index < body.length()) index++;
      } else {
        valueStart = index;
        while (index < body.length() && !Character.isWhitespace(body.charAt(index)) && body.charAt(index) != '/') index++;
        valueEnd = index;
      }
      values.put(name, body.substring(valueStart, valueEnd));
    }
    return values;
  }

}
