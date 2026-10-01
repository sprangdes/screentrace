package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Diagnostic;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.io.StringReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.SAXParseException;

/**
 * Parses JSP, JSPF, and Tiles metadata without applying Struts or Spring routing rules.
 * The parser intentionally returns literal targets only; expression-backed targets remain unresolved.
 */
public final class JspProjectParser {
  private static final String PARSER = "JspProjectParser";
  public static final String CURRENT_VIEW_TARGET = "<current-view>";
  private static final Pattern INLINE_SPRING_URL_LINK = Pattern.compile(
      "(?is)<a\\b.*?\\bhref\\s*=\\s*(['\"])\\s*<spring:url\\b.*?\\bvalue\\s*=\\s*(['\"])([^'\"${}<>]+)\\2.*?/>\\s*\\1");
  private static final Pattern JSP_COMMENT = Pattern.compile("(?s)<%--.*?--%>");
  private static final Pattern JSTL_URL = Pattern.compile("(?is)<c:url\\b[^>]*?\\bvalue\\s*=\\s*(['\"])(.*?)\\1[^>]*/>");

  public JspAnalysis analyze(Path root, List<Path> files) throws IOException {
    List<JspAnalysis.View> views = new ArrayList<>();
    List<JspAnalysis.Interaction> interactions = new ArrayList<>();
    List<JspAnalysis.Include> includes = new ArrayList<>();
    List<JspAnalysis.TilesDefinition> tilesDefinitions = new ArrayList<>();
    List<Diagnostic> diagnostics = new ArrayList<>();
    for (Path file : files) {
      String name = file.getFileName().toString();
      try {
        if (name.endsWith(".jsp") || name.endsWith(".jspf")) {
          parseJsp(root, file, views, interactions, includes, diagnostics);
        } else if (name.endsWith(".xml") && SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_XML_FILE_BYTES).contains("tiles-definitions")) {
          parseTiles(root, file, tilesDefinitions, diagnostics);
        }
      } catch (IOException | SecurityException exception) {
        diagnostics.add(unresolved("Source file was skipped: " + exception.getMessage(), new SourceLocation(relative(root, file), 1)));
      }
    }
    return new JspAnalysis(views, expandIncludedInteractions(root, interactions, includes, diagnostics), includes, tilesDefinitions, diagnostics);
  }

  private static void parseJsp(Path root, Path file, List<JspAnalysis.View> views,
                               List<JspAnalysis.Interaction> interactions, List<JspAnalysis.Include> includes,
                               List<Diagnostic> diagnostics) throws IOException {
    String text = preprocess(SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_JSP_FILE_BYTES));
    String relative = relative(root, file);
    JspAnalysis.ViewKind kind = relative.endsWith(".jspf") ? JspAnalysis.ViewKind.JSPF : JspAnalysis.ViewKind.JSP;
    views.add(new JspAnalysis.View(relative, kind, new SourceLocation(relative, 1)));
    Map<String, String> urls = new HashMap<>();
    String activeFormTarget = null;
    String activeFormMethod = null;
    boolean activeFormSubmitsCurrentView = false;
    inlineSpringUrlLinks(text, relative, interactions, diagnostics);
    for (MarkupTag tag : MarkupTag.scan(text)) {
      SourceLocation source = new SourceLocation(relative, tag.line());
      String tagName = tag.name().toLowerCase(Locale.ROOT);
      if (tag.closing()) {
        if (tagName.equals("form") || tagName.equals("form:form") || tagName.equals("html:form")) {
          activeFormTarget = null;
          activeFormMethod = null;
          activeFormSubmitsCurrentView = false;
        }
        continue;
      }
      switch (tagName) {
        case "spring:url", "c:url" -> registerUrl(tag, urls);
        case "jsp:include", "@include" -> include(relative, target(tag, "page", "file"), source, includes, diagnostics);
        case "form", "html:form", "form:form" -> {
          activeFormTarget = resolvedTarget(target(tag, "action"), urls);
          activeFormMethod = method(tag);
          activeFormSubmitsCurrentView = activeFormTarget == null;
          interaction(relative, JspAnalysis.InteractionType.FORM_SUBMIT, tag, activeFormTarget, activeFormMethod, source,
              activeFormSubmitsCurrentView, interactions, diagnostics);
        }
        case "a", "html:link" -> {
          String resolved = resolvedTarget(target(tag, "href", "page", "action"), urls);
          interaction(relative, linkType(tag, resolved), interactionLabel(tag, text), resolved, "GET", source,
              false, interactions, diagnostics);
        }
        case "button", "input", "html:submit", "html:button", "form:button" -> {
          String action = resolvedTarget(target(tag, "formaction", "action"), urls);
          if (action == null && submitsForm(tag) && activeFormTarget != null) action = activeFormTarget;
          boolean submitsCurrentView = action == null && submitsForm(tag) && activeFormSubmitsCurrentView;
          String label = interactionLabel(tag, text);
          interaction(relative, submitsForm(tag) ? JspAnalysis.InteractionType.FORM_SUBMIT : JspAnalysis.InteractionType.UNKNOWN,
              label, action, activeFormMethod, source,
              submitsCurrentView, interactions, diagnostics);
        }
        default -> { }
      }
    }
  }

  private static void registerUrl(MarkupTag tag, Map<String, String> urls) {
    String variable = tag.attribute("var");
    String value = tag.attribute("value");
    if (variable != null && literal(value)) urls.put(variable, value);
  }

  private static String resolvedTarget(String target, Map<String, String> urls) {
    if (target != null && target.stripLeading().startsWith("<spring:url")) return null;
    if (target == null || !target.startsWith("${") || !target.endsWith("}")) return target;
    String expression = target.substring(2, target.length() - 1).trim();
    String variable = expression;
    int argumentStart = expression.lastIndexOf('(');
    if (argumentStart >= 0 && expression.endsWith(")")) variable = expression.substring(argumentStart + 1, expression.length() - 1).trim();
    return urls.getOrDefault(variable, target);
  }

  private static void inlineSpringUrlLinks(String text, String viewPath, List<JspAnalysis.Interaction> interactions,
                                           List<Diagnostic> diagnostics) {
    Matcher matcher = INLINE_SPRING_URL_LINK.matcher(text);
    while (matcher.find()) {
      SourceLocation source = new SourceLocation(viewPath, line(text, matcher.start()));
      interaction(viewPath, JspAnalysis.InteractionType.NAVIGATION, "a", matcher.group(3).trim(), "GET", source,
          false, interactions, diagnostics);
    }
  }

  private static void include(String sourcePath, String target, SourceLocation source, List<JspAnalysis.Include> includes,
                              List<Diagnostic> diagnostics) {
    if (literal(target)) includes.add(new JspAnalysis.Include(sourcePath, target, source, Confidence.CONFIRMED));
    else if (target != null) diagnostics.add(unresolved("JSP include cannot be resolved statically: " + target, source));
  }

  /** Removes JSP-only syntax and converts literal c:url tags before markup tokenization. */
  static String preprocess(String source) {
    return JSTL_URL.matcher(JSP_COMMENT.matcher(source).replaceAll("")).replaceAll("$2");
  }

  private static JspAnalysis.InteractionType linkType(MarkupTag tag, String target) {
    if (target == null || target.isBlank()) return JspAnalysis.InteractionType.UNKNOWN;
    if ("#".equals(target)) return JspAnalysis.InteractionType.PLACEHOLDER;
    if (target.startsWith("#")) {
      String slide = tag.attribute("data-slide");
      return slide == null || slide.isBlank() ? JspAnalysis.InteractionType.ANCHOR : JspAnalysis.InteractionType.UI_STATE_CHANGE;
    }
    return JspAnalysis.InteractionType.NAVIGATION;
  }

  /** Projects interactions declared by statically included fragments onto each rendered JSP screen. */
  private static List<JspAnalysis.Interaction> expandIncludedInteractions(Path root, List<JspAnalysis.Interaction> interactions,
      List<JspAnalysis.Include> includes, List<Diagnostic> diagnostics) {
    Map<String, List<JspAnalysis.Interaction>> byView = new HashMap<>();
    interactions.forEach(item -> byView.computeIfAbsent(item.viewPath(), ignored -> new ArrayList<>()).add(item));
    Map<String, List<String>> included = new HashMap<>();
    for (JspAnalysis.Include include : includes) {
      String resolved = resolveInclude(root, include.sourceViewPath(), include.targetPath());
      if (resolved == null) diagnostics.add(unresolved("JSP include cannot be found: " + include.targetPath(), include.source()));
      else included.computeIfAbsent(include.sourceViewPath(), ignored -> new ArrayList<>()).add(resolved);
    }
    List<JspAnalysis.Interaction> expanded = new ArrayList<>(interactions);
    byView.keySet().stream().filter(path -> path.endsWith(".jsp")).forEach(view -> collectIncluded(view, view, included, byView,
        new java.util.HashSet<>(), expanded));
    return expanded;
  }

  private static void collectIncluded(String screen, String current, Map<String, List<String>> included,
      Map<String, List<JspAnalysis.Interaction>> byView, java.util.Set<String> stack, List<JspAnalysis.Interaction> result) {
    if (!stack.add(current)) return;
    for (String child : included.getOrDefault(current, List.of())) {
      for (JspAnalysis.Interaction item : byView.getOrDefault(child, List.of())) result.add(new JspAnalysis.Interaction(screen,
          item.type(), item.label(), item.target(), item.httpMethod(), item.source(), item.confidence(), item.submitsCurrentView()));
      collectIncluded(screen, child, included, byView, stack, result);
    }
    stack.remove(current);
  }

  private static String resolveInclude(Path root, String sourceView, String target) {
    Path source = root.resolve(sourceView).getParent();
    Path candidate = target.startsWith("/") ? root.resolve("src/main/webapp" + target) : source.resolve(target).normalize();
    if (SafeProjectFiles.isSafeRegularFile(root, candidate)) return relative(root, candidate);
    if (target.startsWith("/")) {
      candidate = root.resolve(target.substring(1));
      if (SafeProjectFiles.isSafeRegularFile(root, candidate)) return relative(root, candidate);
    }
    return null;
  }

  private static void interaction(String viewPath, JspAnalysis.InteractionType type, MarkupTag tag, String target,
                                  String method, SourceLocation source, List<JspAnalysis.Interaction> interactions,
                                  List<Diagnostic> diagnostics) {
    interaction(viewPath, type, label(tag), target, method, source, false, interactions, diagnostics);
  }

  private static void interaction(String viewPath, JspAnalysis.InteractionType type, MarkupTag tag, String target,
                                  String method, SourceLocation source, boolean submitsCurrentView,
                                  List<JspAnalysis.Interaction> interactions, List<Diagnostic> diagnostics) {
    interaction(viewPath, type, label(tag), target, method, source, submitsCurrentView, interactions, diagnostics);
  }

  private static void interaction(String viewPath, JspAnalysis.InteractionType type, String label, String target,
                                  String method, SourceLocation source, boolean submitsCurrentView,
                                  List<JspAnalysis.Interaction> interactions, List<Diagnostic> diagnostics) {
    if (target == null && !submitsCurrentView) return;
    String resolved = submitsCurrentView ? CURRENT_VIEW_TARGET : target;
    Confidence confidence = submitsCurrentView ? Confidence.INFERRED : literal(resolved) ? Confidence.CONFIRMED : Confidence.UNRESOLVED;
    interactions.add(new JspAnalysis.Interaction(viewPath, type, label, resolved, method, source, confidence,
        submitsCurrentView));
    if (confidence == Confidence.UNRESOLVED) diagnostics.add(unresolved("JSP target cannot be resolved statically: " + target, source));
  }

  private static String target(MarkupTag tag, String... names) {
    for (String name : names) {
      String value = tag.attribute(name);
      if (value != null) return value;
    }
    return null;
  }

  private static String method(MarkupTag tag) {
    String value = tag.attribute("method");
    if (value != null && !value.isBlank()) return value.toUpperCase(Locale.ROOT);
    return tag.name().equalsIgnoreCase("form:form") ? "POST" : "GET";
  }

  private static String label(MarkupTag tag) {
    String value = target(tag, "value", "title", "id", "name", "property");
    return value == null || value.isBlank() ? tag.name() : value;
  }

  private static boolean submitsForm(MarkupTag tag) {
    String type = tag.attribute("type");
    return type == null || type.isBlank() || type.equalsIgnoreCase("submit");
  }

  private static String interactionLabel(MarkupTag tag, String source) {
    String fallback = label(tag);
    if (!fallback.equals("button") && !fallback.equals("a")) return fallback;
    String tagName = tag.name().toLowerCase(Locale.ROOT);
    if (!tagName.equals("button") && !tagName.equals("a")) return fallback;
    int close = source.indexOf("</" + tagName, tag.end());
    if (close < 0) return fallback;
    String text = source.substring(tag.end() + 1, close).replaceAll("<[^>]+>", "").strip();
    return text.isBlank() ? fallback : text;
  }

  private static boolean literal(String value) {
    return value != null && !value.contains("${") && !value.contains("<%") && !value.contains("#{");
  }

  private static void parseTiles(Path root, Path file, List<JspAnalysis.TilesDefinition> definitions,
                                 List<Diagnostic> diagnostics) {
    String relative = relative(root, file);
    try {
      Document document = secureDocument(SafeProjectFiles.xmlWithoutExternalDoctype(SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_XML_FILE_BYTES)));
      NodeList nodes = document.getElementsByTagName("definition");
      for (int index = 0; index < nodes.getLength(); index++) {
        Element definition = (Element) nodes.item(index);
        List<JspAnalysis.TilesAttribute> attributes = new ArrayList<>();
        NodeList attributeNodes = definition.getElementsByTagName("put-attribute");
        for (int attributeIndex = 0; attributeIndex < attributeNodes.getLength(); attributeIndex++) {
          Element attribute = (Element) attributeNodes.item(attributeIndex);
          attributes.add(new JspAnalysis.TilesAttribute(attribute.getAttribute("name"), attribute.getAttribute("value")));
        }
        definitions.add(new JspAnalysis.TilesDefinition(definition.getAttribute("name"), definition.getAttribute("template"),
            attributes, new SourceLocation(relative, 1)));
      }
    } catch (Exception exception) {
      diagnostics.add(unresolved("Unable to parse Tiles configuration: " + exception.getMessage(), new SourceLocation(relative, 1)));
    }
  }

  private static Document secureDocument(String xml) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    factory.setXIncludeAware(false);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    factory.setExpandEntityReferences(false);
    var builder = factory.newDocumentBuilder();
    builder.setEntityResolver((publicId, systemId) -> new InputSource(new StringReader("")));
    builder.setErrorHandler(new org.xml.sax.ErrorHandler() {
      @Override public void warning(SAXParseException exception) { }
      @Override public void error(SAXParseException exception) throws SAXParseException { throw exception; }
      @Override public void fatalError(SAXParseException exception) throws SAXParseException { throw exception; }
    });
    return builder.parse(new InputSource(new StringReader(xml)));
  }

  private static Diagnostic unresolved(String message, SourceLocation source) {
    return new Diagnostic(message, Confidence.UNRESOLVED, source, "JSP_UNRESOLVED", List.of());
  }

  private static String relative(Path root, Path file) {
    return root.relativize(file).toString().replace('\\', '/');
  }

  private static int line(String source, int offset) {
    int line = 1;
    for (int index = 0; index < offset; index++) if (source.charAt(index) == '\n') line++;
    return line;
  }
}
