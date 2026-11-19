package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph.*;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Three-valued evaluation of recorded JSP guards against known facts. Anything outside the small EL
 * subset (names, string and boolean literals, not/and/or, eq/ne, parentheses) is unknown, and an
 * unknown term never makes a guard false.
 */
final class JspGuards {
  private static final Pattern GUARD = Pattern.compile("；guard=(.*?)；repeated=", Pattern.DOTALL);

  private JspGuards() {}

  /** The guard recorded on an ownership edge, or the component's own guard. */
  static String guard(Relationship ownership, GraphNode component) {
    for (var evidence : ownership.evidence()) {
      var match = GUARD.matcher(Objects.toString(evidence.detail(), ""));
      if (match.find()) return match.group(1);
    }
    return component == null ? "" : component.attributes().getOrDefault("guard", "");
  }

  /**
   * A recorded guard: {@code ${a} && ${b}} terms, optionally {@code !(${a})}; other terms (such as
   * {@code c:otherwise{}}) are unknown.
   */
  static Boolean evaluate(String guard, Map<String, Object> facts) {
    if (guard == null || guard.isBlank()) return Boolean.TRUE;
    Boolean result = Boolean.TRUE;
    for (String term : terms(guard)) {
      String text = term.strip();
      boolean negate = false;
      if (text.startsWith("!(") && text.endsWith(")")) {
        negate = true;
        text = text.substring(2, text.length() - 1).strip();
      }
      Boolean value =
          text.startsWith("${") && text.endsWith("}")
              ? expression(text.substring(2, text.length() - 1), facts)
              : null;
      if (negate && value != null) value = !value;
      result = and(result, value);
      if (Boolean.FALSE.equals(result)) return result;
    }
    return result;
  }

  /** A bare EL expression without the surrounding {@code ${}}. */
  static Boolean expression(String expression, Map<String, Object> facts) {
    try {
      var parser = new Parser(tokens(expression), facts);
      Object value = parser.or();
      if (parser.at < parser.tokens.size()) return null;
      return value instanceof Boolean b ? b : null;
    } catch (RuntimeException unsupported) {
      return null;
    }
  }

  private static List<String> terms(String guard) {
    List<String> terms = new ArrayList<>();
    int depth = 0, start = 0;
    char quote = 0;
    for (int i = 0; i < guard.length(); i++) {
      char c = guard.charAt(i);
      if (quote != 0) {
        if (c == quote) quote = 0;
        continue;
      }
      if (c == '\'' || c == '"') quote = c;
      else if (c == '{' || c == '(') depth++;
      else if (c == '}' || c == ')') depth--;
      else if (depth == 0 && guard.startsWith(" && ", i)) {
        terms.add(guard.substring(start, i));
        start = i + 4;
        i += 3;
      }
    }
    terms.add(guard.substring(start));
    return terms;
  }

  private static Boolean and(Boolean a, Boolean b) {
    if (Boolean.FALSE.equals(a) || Boolean.FALSE.equals(b)) return Boolean.FALSE;
    return a == null || b == null ? null : Boolean.TRUE;
  }

  private static Boolean or(Boolean a, Boolean b) {
    if (Boolean.TRUE.equals(a) || Boolean.TRUE.equals(b)) return Boolean.TRUE;
    return a == null || b == null ? null : Boolean.FALSE;
  }

  private static final Object UNKNOWN = new Object();

  private static List<String> tokens(String text) {
    List<String> tokens = new ArrayList<>();
    for (int i = 0; i < text.length(); ) {
      char c = text.charAt(i);
      if (Character.isWhitespace(c)) {
        i++;
      } else if (c == '\'' || c == '"') {
        int end = text.indexOf(c, i + 1);
        if (end < 0 || text.substring(i + 1, end).contains("\\"))
          throw new IllegalArgumentException("quote");
        tokens.add(text.substring(i, end + 1));
        i = end + 1;
      } else if (Character.isLetter(c) || c == '_') {
        int end = i;
        while (end < text.length()
            && (Character.isLetterOrDigit(text.charAt(end))
                || text.charAt(end) == '_'
                || text.charAt(end) == '.')) end++;
        tokens.add(text.substring(i, end));
        i = end;
      } else if (text.startsWith("&&", i)
          || text.startsWith("||", i)
          || text.startsWith("==", i)
          || text.startsWith("!=", i)) {
        tokens.add(text.substring(i, i + 2));
        i += 2;
      } else if (c == '!' || c == '(' || c == ')') {
        tokens.add(String.valueOf(c));
        i++;
      } else throw new IllegalArgumentException("unsupported " + c);
    }
    return tokens;
  }

  private static final class Parser {
    final List<String> tokens;
    final Map<String, Object> facts;
    int at;

    Parser(List<String> tokens, Map<String, Object> facts) {
      this.tokens = tokens;
      this.facts = facts;
    }

    boolean take(String... options) {
      if (at < tokens.size() && Arrays.asList(options).contains(tokens.get(at))) {
        at++;
        return true;
      }
      return false;
    }

    Object or() {
      Object value = and();
      while (take("or", "||")) value = box(JspGuards.or(bool(value), bool(and())));
      return value;
    }

    Object and() {
      Object value = equality();
      while (take("and", "&&")) value = box(JspGuards.and(bool(value), bool(equality())));
      return value;
    }

    Object equality() {
      Object value = unary();
      while (at < tokens.size()) {
        boolean equal;
        if (take("eq", "==")) equal = true;
        else if (take("ne", "!=")) equal = false;
        else break;
        Object other = unary();
        value =
            value == UNKNOWN || other == UNKNOWN
                ? UNKNOWN
                : (Objects.equals(value, other) == equal);
      }
      return value;
    }

    Object unary() {
      if (take("not", "!")) {
        Boolean value = bool(unary());
        return value == null ? UNKNOWN : !value;
      }
      if (take("empty")) {
        unary();
        return UNKNOWN;
      }
      return primary();
    }

    Object primary() {
      if (at >= tokens.size()) throw new IllegalArgumentException("end");
      String token = tokens.get(at++);
      if (token.equals("(")) {
        Object value = or();
        if (!take(")")) throw new IllegalArgumentException(")");
        return value;
      }
      if (token.startsWith("'") || token.startsWith("\""))
        return token.substring(1, token.length() - 1);
      if (token.equals("true") || token.equals("false")) return Boolean.valueOf(token);
      if (token.equals("null")) return UNKNOWN;
      if (!Character.isLetter(token.charAt(0)) && token.charAt(0) != '_')
        throw new IllegalArgumentException(token);
      return facts.containsKey(token) ? facts.get(token) : UNKNOWN;
    }

    static Boolean bool(Object value) {
      return value instanceof Boolean b ? b : null;
    }

    static Object box(Boolean value) {
      return value == null ? UNKNOWN : value;
    }
  }
}
