package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Diagnostic;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import java.io.IOException;
import java.io.StringReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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

  public JspAnalysis analyze(Path root, List<Path> files) throws IOException {
    List<JspAnalysis.View> views = new ArrayList<>();
    List<JspAnalysis.Interaction> interactions = new ArrayList<>();
    List<JspAnalysis.Include> includes = new ArrayList<>();
    List<JspAnalysis.TilesDefinition> tilesDefinitions = new ArrayList<>();
    List<Diagnostic> diagnostics = new ArrayList<>();
    for (Path file : files) {
      String name = file.getFileName().toString();
      if (name.endsWith(".jsp") || name.endsWith(".jspf")) {
        parseJsp(root, file, views, interactions, includes, diagnostics);
      } else if (name.endsWith(".xml") && Files.readString(file).contains("tiles-definitions")) {
        parseTiles(root, file, tilesDefinitions, diagnostics);
      }
    }
    return new JspAnalysis(views, interactions, includes, tilesDefinitions, diagnostics);
  }

  private static void parseJsp(Path root, Path file, List<JspAnalysis.View> views,
                               List<JspAnalysis.Interaction> interactions, List<JspAnalysis.Include> includes,
                               List<Diagnostic> diagnostics) throws IOException {
    String text = Files.readString(file);
    String relative = relative(root, file);
    JspAnalysis.ViewKind kind = relative.endsWith(".jspf") ? JspAnalysis.ViewKind.JSPF : JspAnalysis.ViewKind.JSP;
    views.add(new JspAnalysis.View(relative, kind, new SourceLocation(relative, 1)));
    for (MarkupTag tag : MarkupTag.scan(text)) {
      SourceLocation source = new SourceLocation(relative, tag.line());
      switch (tag.name().toLowerCase(Locale.ROOT)) {
        case "jsp:include", "@include" -> include(relative, target(tag, "page", "file"), source, includes, diagnostics);
        case "form", "html:form", "form:form" -> interaction(relative, JspAnalysis.InteractionType.FORM, tag,
            target(tag, "action"), method(tag), source, interactions, diagnostics);
        case "a", "html:link" -> interaction(relative, JspAnalysis.InteractionType.LINK, tag,
            target(tag, "href", "page", "action"), "GET", source, interactions, diagnostics);
        case "button", "input", "html:submit", "html:button", "form:button" -> interaction(relative,
            JspAnalysis.InteractionType.BUTTON, tag, target(tag, "formaction", "action"), null, source,
            interactions, diagnostics);
        default -> { }
      }
    }
  }

  private static void include(String sourcePath, String target, SourceLocation source, List<JspAnalysis.Include> includes,
                              List<Diagnostic> diagnostics) {
    if (literal(target)) includes.add(new JspAnalysis.Include(sourcePath, target, source, Confidence.CONFIRMED));
    else if (target != null) diagnostics.add(unresolved("JSP include cannot be resolved statically: " + target, source));
  }

  private static void interaction(String viewPath, JspAnalysis.InteractionType type, MarkupTag tag, String target,
                                  String method, SourceLocation source, List<JspAnalysis.Interaction> interactions,
                                  List<Diagnostic> diagnostics) {
    if (target == null) return;
    Confidence confidence = literal(target) ? Confidence.CONFIRMED : Confidence.UNRESOLVED;
    interactions.add(new JspAnalysis.Interaction(viewPath, type, label(tag), target, method, source, confidence));
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
    return value == null || value.isBlank() ? "GET" : value.toUpperCase(Locale.ROOT);
  }

  private static String label(MarkupTag tag) {
    String value = target(tag, "value", "title", "id", "name", "property");
    return value == null || value.isBlank() ? tag.name() : value;
  }

  private static boolean literal(String value) {
    return value != null && !value.contains("${") && !value.contains("<%") && !value.contains("#{");
  }

  private static void parseTiles(Path root, Path file, List<JspAnalysis.TilesDefinition> definitions,
                                 List<Diagnostic> diagnostics) {
    String relative = relative(root, file);
    try {
      Document document = secureDocument(Files.readString(file));
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
}
