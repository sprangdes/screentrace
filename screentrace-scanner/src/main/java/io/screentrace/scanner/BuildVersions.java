package io.screentrace.scanner;

import java.io.IOException;
import java.io.StringReader;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.InputSource;

/** Declared dependency versions read from the project's Maven POMs; nothing is downloaded or resolved remotely. */
public final class BuildVersions {
  /** A version and the POM that declares it. */
  public record Declared(String version, String file, int majorVersion) { }

  private BuildVersions() { }

  /**
   * The single version every POM agrees on for a dependency or parent artifact, with ${property} references resolved
   * from the project's own POM properties. Empty when absent, unresolvable or conflicting.
   */
  public static Optional<Declared> of(ProjectScanner.ProjectInventory inventory, String artifactId) {
    Map<String, String> properties = new HashMap<>();
    List<Document> poms = new ArrayList<>();
    List<String> files = new ArrayList<>();
    for (Path file : inventory.files()) {
      if (!file.getFileName().toString().equals("pom.xml")) continue;
      try {
        Document pom = parse(SafeProjectFiles.readUtf8Limited(inventory.root(), file, SafeProjectFiles.MAX_XML_FILE_BYTES));
        poms.add(pom);
        files.add(inventory.root().relativize(file).toString().replace('\\', '/'));
        for (Element block : children(pom.getDocumentElement(), "properties"))
          for (Node child = block.getFirstChild(); child != null; child = child.getNextSibling())
            if (child instanceof Element property) properties.putIfAbsent(property.getTagName(), property.getTextContent().trim());
      } catch (IOException | RuntimeException ignored) {
        // An unreadable POM declares nothing.
      }
    }
    TreeSet<String> versions = new TreeSet<>();
    String declaredIn = null;
    for (int i = 0; i < poms.size(); i++) {
      for (Element artifact : elements(poms.get(i), "artifactId")) {
        if (!artifact.getTextContent().trim().equals(artifactId) || !(artifact.getParentNode() instanceof Element owner)) continue;
        if (!List.of("dependency", "parent", "plugin").contains(owner.getTagName())) continue;
        List<Element> version = children(owner, "version");
        if (version.isEmpty()) continue;
        String value = resolve(version.get(0).getTextContent().trim(), properties);
        if (value == null) return Optional.empty();
        versions.add(value);
        if (declaredIn == null) declaredIn = files.get(i);
      }
    }
    if (versions.size() != 1) return Optional.empty();
    String version = versions.first();
    try {
      return Optional.of(new Declared(version, declaredIn, Integer.parseInt(version.split("[.-]", 2)[0])));
    } catch (NumberFormatException notNumeric) {
      return Optional.empty();
    }
  }

  private static String resolve(String value, Map<String, String> properties) {
    for (int depth = 0; depth < 8 && value.contains("${"); depth++) {
      int start = value.indexOf("${"), end = value.indexOf('}', start);
      if (end < 0) return null;
      String replacement = properties.get(value.substring(start + 2, end));
      if (replacement == null) return null;
      value = value.substring(0, start) + replacement + value.substring(end + 1);
    }
    return value.contains("${") || value.isBlank() ? null : value;
  }

  private static List<Element> elements(Document document, String name) {
    List<Element> result = new ArrayList<>();
    var nodes = document.getElementsByTagName(name);
    for (int i = 0; i < nodes.getLength(); i++) result.add((Element) nodes.item(i));
    return result;
  }

  private static List<Element> children(Element parent, String name) {
    List<Element> result = new ArrayList<>();
    for (Node child = parent.getFirstChild(); child != null; child = child.getNextSibling())
      if (child instanceof Element element && element.getTagName().equals(name)) result.add(element);
    return result;
  }

  private static Document parse(String xml) throws IOException {
    try {
      var factory = DocumentBuilderFactory.newInstance();
      factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
      factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
      factory.setXIncludeAware(false);
      factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
      factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
      factory.setExpandEntityReferences(false);
      var builder = factory.newDocumentBuilder();
      builder.setErrorHandler(new org.xml.sax.ErrorHandler() {
        @Override public void warning(org.xml.sax.SAXParseException exception) { }
        @Override public void error(org.xml.sax.SAXParseException exception) throws org.xml.sax.SAXParseException { throw exception; }
        @Override public void fatalError(org.xml.sax.SAXParseException exception) throws org.xml.sax.SAXParseException { throw exception; }
      });
      return builder.parse(new InputSource(new StringReader(xml)));
    } catch (javax.xml.parsers.ParserConfigurationException | org.xml.sax.SAXException error) {
      throw new IOException("POM could not be parsed safely", error);
    }
  }
}
