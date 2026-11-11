package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsProjectAnalyzer.*;

import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.*;
import io.screentrace.scanner.SafeProjectFiles;
import java.nio.file.*;
import java.util.*;
import org.w3c.dom.*;

/** Shared helpers for graph nodes, edges, evidence, diagnostics and XML. */
final class StrutsGraphSupport {
  private StrutsGraphSupport() {}

  static int lineAt(String source, int offset) {
    int line = 1;
    for (int i = 0; i < Math.min(offset, source.length()); i++)
      if (source.charAt(i) == '\n') line++;
    return line;
  }

  static String directText(Element parent, String name) {
    for (Node child = parent.getFirstChild(); child != null; child = child.getNextSibling())
      if (child instanceof Element element && name.equals(element.getTagName()))
        return element.getTextContent().trim();
    return "";
  }

  static int sourceLine(Element element) {
    Object line = element.getUserData("line");
    return line instanceof Integer value ? value : 1;
  }

  static Map<String, String> identityAttributes(MarkupTag tag, String name) {
    var attrs = new TreeMap<>(tag.attributes());
    attrs.put("tag", name);
    return attrs;
  }

  static String first(MarkupTag tag, String... names) {
    for (String name : names) if (tag.attribute(name) != null) return tag.attribute(name);
    return null;
  }

  static void indexView(Map<String, String> index, String path, String id) {
    index.put(path, id);
    for (String root : List.of("src/main/webapp/", "WebContent/", "web/"))
      if (path.startsWith(root)) index.put("/" + path.substring(root.length()), id);
    int marker = path.indexOf("/WEB-INF/");
    if (marker >= 0) index.put(path.substring(marker), id);
  }

  static List<String> endpointPaths(String path) {
    return path.endsWith(".do") ? List.of(path) : List.of(path, path + ".do");
  }

  static String relative(State state, Path file) {
    return StrutsSources.relative(state.inventory.root(), file);
  }

  static Document readXml(Path file, State state) throws Exception {
    return StrutsSources.xml(
        SafeProjectFiles.readUtf8Limited(
            state.inventory.root(), file, SafeProjectFiles.MAX_XML_FILE_BYTES));
  }

  static List<AnalysisEvidence> evidence(
      SourceLocation source, Confidence confidence, String detail) {
    return List.of(new AnalysisEvidence(source, PARSER, confidence.resolutionStatus(), detail));
  }

  static void addNode(
      State state,
      String id,
      NodeType type,
      String name,
      Map<String, String> attrs,
      SourceLocation source,
      Confidence status) {
    addNode(state, id, type, name, attrs, source, status, null);
  }

  static void addNode(
      State state,
      String id,
      NodeType type,
      String name,
      Map<String, String> attrs,
      SourceLocation source,
      Confidence status,
      String detail) {
    List<AnalysisEvidence> proof = new ArrayList<>(evidence(source, status, null));
    if (detail != null) proof.addAll(evidence(source, status, detail));
    GraphNode node = new GraphNode(id, type, name, attrs, source, status, proof);
    state.nodes.merge(
        id,
        node,
        (a, b) -> {
          List<AnalysisEvidence> evidence = new ArrayList<>(a.evidence());
          if (!evidence.containsAll(b.evidence())) evidence.addAll(b.evidence());
          return new GraphNode(
              a.id(),
              a.type(),
              a.name(),
              a.attributes(),
              a.source(),
              a.confidence() == b.confidence() ? a.confidence() : Confidence.AMBIGUOUS,
              evidence);
        });
  }

  static void edge(
      State state,
      EdgeType type,
      String from,
      String to,
      Confidence status,
      SourceLocation source) {
    edge(state, type, from, to, status, source, null);
  }

  static void edge(
      State state,
      EdgeType type,
      String from,
      String to,
      Confidence status,
      SourceLocation source,
      String detail) {
    String id = ApplicationGraph.id(NodeType.COMPONENT, type + ":" + from + ":" + to);
    state.edges.putIfAbsent(
        id, new Relationship(id, type, from, to, status, source, evidence(source, status, detail)));
  }

  static void diagnostic(State state, String message, SourceLocation source, String code) {
    state.diagnostics.add(
        new Diagnostic(
            message,
            Confidence.UNRESOLVED,
            source,
            code,
            evidence(source, Confidence.UNRESOLVED, null)));
  }
}
