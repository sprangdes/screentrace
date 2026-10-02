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
  private final Map<String,Integer> attributeLines;
  private final int end;
  private final boolean closing;

  private MarkupTag(String name, Map<String, String> attributes, int line, int end, boolean closing, Map<String,Integer> attributeLines) {
    this.name = name;
    this.attributes = attributes;
    this.line = line;
    this.attributeLines = Map.copyOf(attributeLines);
    this.end = end;
    this.closing = closing;
  }

  public static List<MarkupTag> scan(String source) {
    List<MarkupTag> tags = new ArrayList<>();
    int line = 1, lineCursor = 0;
    for (int start = 0; start < source.length(); start++) {
      if ((source.startsWith("${",start) || source.startsWith("#{",start))) {
        int close=endOfExpression(source,start+2);if(close<0)break;start=close;continue;
      }
      if(source.charAt(start)!='<')continue;
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
  public int attributeLine(String name) { return attributeLines.getOrDefault(name.toLowerCase(Locale.ROOT),line); }
  public int end() { return end; }
  public boolean closing() { return closing; }
  public Map<String, String> attributes() { return Map.copyOf(attributes); }
  public String attribute(String name) { return attributes.get(name.toLowerCase(Locale.ROOT)); }

  private static int endOfExpression(String source,int start) {
    int depth=1;char quote=0;
    for(int i=start;i<source.length();i++) {
      char value=source.charAt(i);
      if(quote!=0) {if(value=='\\')i++;else if(value==quote)quote=0;}
      else if(value=='\''||value=='"')quote=value;
      else if(value=='{')depth++;
      else if(value=='}'&&--depth==0)return i;
    }
    return -1;
  }

  private static int endOfTag(String source, int start) {
    char quote = 0;
    for (int index = start + 1; index < source.length(); index++) {
      char current = source.charAt(index);
      if (quote != 0) {
        if (current == '<' && (source.startsWith("<%", index) || source.startsWith("<", index))) {
          int nested = nestedEnd(source, index);
          if (nested >= 0) { index = nested; continue; }
        }
        if (current == quote) quote = 0;
      } else if (current == '\'' || current == '"') quote = current;
      else if (current == '>') return index;
    }
    return -1;
  }

  private static int nestedEnd(String source, int start) {
    if (source.startsWith("<%", start)) {
      int end = source.indexOf("%>", start + 2);
      return end < 0 ? -1 : end + 1;
    }
    if (start + 1 >= source.length() || !Character.isLetter(source.charAt(start + 1))) return -1;
    return endOfTag(source, start);
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
    Map<String,Integer> locations=new LinkedHashMap<>();
    int attributeBase=line+(int)body.substring(0,split).chars().filter(c->c=='\n').count();
    return new MarkupTag(name, attributes(body.substring(split),attributeBase,locations), line, end, closing,locations);
  }

  private static Map<String, String> attributes(String body, int baseLine, Map<String,Integer> locations) {
    Map<String, String> values = new LinkedHashMap<>();
    int lineCursor=0,currentLine=baseLine;
    for (int index = 0; index < body.length();) {
      while (index < body.length() && (Character.isWhitespace(body.charAt(index)) || body.charAt(index) == '/')) index++;
      int nameStart = index;
      while (index < body.length() && !Character.isWhitespace(body.charAt(index)) && body.charAt(index) != '=' && body.charAt(index) != '/') index++;
      if (nameStart == index) break;
      String name = body.substring(nameStart, index).toLowerCase(Locale.ROOT);
      while(lineCursor<nameStart) if(body.charAt(lineCursor++)=='\n')currentLine++;
      locations.put(name,currentLine);
      while (index < body.length() && Character.isWhitespace(body.charAt(index))) index++;
      if (index >= body.length() || body.charAt(index) != '=') { values.put(name, ""); continue; }
      index++;
      while (index < body.length() && Character.isWhitespace(body.charAt(index))) index++;
      if (index >= body.length()) break;
      char quote = body.charAt(index);
      int valueStart;
      int valueEnd;
      if (quote == '\'' || quote == '"') {
        valueStart = ++index;
        while (index < body.length() && body.charAt(index) != quote) {
          if (body.charAt(index) == '<') {
            int nested = nestedEnd(body, index);
            if (nested >= 0) { index = nested + 1; continue; }
          }
          index++;
        }
        valueEnd = index;
        if (index < body.length()) index++;
      } else {
        valueStart = index;
        while (index < body.length() && !Character.isWhitespace(body.charAt(index))) index++;
        valueEnd = index;
      }
      values.put(name, body.substring(valueStart, valueEnd));
    }
    return values;
  }

}
