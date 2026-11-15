package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R68: remaining parser-jsp findings of the 2026-11-14 code review. */
class ParserRound68Test {
  @TempDir Path root;

  void file(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  @Test
  void theInnermostAngularControllerHandlesTheEvent() throws Exception {
    // RV-413
    file(
        "page.html",
        "<div ng-controller=\"App\"><div data-ng-controller=\"Edit\"><button ng-click=\"save()\">Save</button></div></div>");
    var scripts = ScriptSources.collect(new ProjectScanner().scan(root)).scripts();
    assertEquals(
        "Edit",
        scripts.stream()
            .filter(s -> "click".equals(s.event()))
            .findFirst()
            .orElseThrow()
            .controllerName());
  }

  @Test
  void anOrdinaryMapPutKeepsJspValueDefinitionsKnown() throws Exception {
    // RV-403: map.put(key, v) with a variable key used to switch off every EL value.
    file(
        "Util.java",
        "class Util { void f(java.util.Map<String,String> m, String k){ m.put(k, \"v\"); } }");
    file(
        "page.jsp",
        "<c:set var=\"base\" value=\"/app\"/><a href=\"#\" onclick=\"location.href='${base}/next'\">Go</a>");
    var scripts = ScriptSources.collect(new ProjectScanner().scan(root)).scripts();
    assertEquals(
        "/app",
        scripts.stream()
            .filter(s -> "click".equals(s.event()))
            .findFirst()
            .orElseThrow()
            .elValues()
            .get("base"),
        scripts.toString());
  }

  private JspAnalysis analyze() throws Exception {
    var inventory = new ProjectScanner().scan(root);
    return new JspProjectParser().analyze(inventory.root(), inventory.files());
  }

  @Test
  void diamondIncludesAddAFragmentOnceAndQueriesAreIgnored() throws Exception {
    // RV-422, RV-427
    file(
        "page.jsp",
        "<%@ include file=\"a.jspf\" %><%@ include file=\"b.jspf\" %><jsp:include page=\"tabs.jsp?tab=1\"/>");
    file("a.jspf", "<%@ include file=\"nav.jspf\" %>");
    file("b.jspf", "<%@ include file=\"nav.jspf\" %>");
    file("nav.jspf", "<a href=\"/home\">Home</a>");
    file("tabs.jsp", "<a href=\"/tab\">Tab</a>");
    var analysis = analyze();
    var labels =
        analysis.interactions().stream()
            .filter(i -> i.viewPath().equals("page.jsp"))
            .map(JspAnalysis.Interaction::label)
            .toList();
    assertEquals(1, labels.stream().filter("Home"::equals).count(), labels.toString());
    assertTrue(labels.contains("Tab"), labels + " " + analysis.diagnostics());
  }

  @Test
  void linkLabelsReadUpToTheirOwnEndTagInAnyCase() throws Exception {
    // RV-423
    file("page.jsp", "<A href=\"/x\"><abbr title=\"t\">FAQ</abbr> more</A>");
    var labels = analyze().interactions().stream().map(JspAnalysis.Interaction::label).toList();
    assertEquals(java.util.List.of("FAQ more"), labels);
  }

  @Test
  void tilesPutValuesComeFromContentOrBody() throws Exception {
    // RV-417
    file(
        "tiles-defs.xml",
        "<tiles-definitions><definition name=\"x\" template=\"/layout.jsp\"><put-attribute name=\"body\">/list.jsp</put-attribute><put name=\"side\" content=\"/side.jsp\"/></definition></tiles-definitions>");
    var definition = analyze().tilesDefinitions().get(0);
    assertEquals(
        java.util.Map.of("body", "/list.jsp", "side", "/side.jsp"),
        definition.attributes().stream()
            .collect(
                java.util.stream.Collectors.toMap(
                    JspAnalysis.TilesAttribute::name, JspAnalysis.TilesAttribute::value)));
  }
}
