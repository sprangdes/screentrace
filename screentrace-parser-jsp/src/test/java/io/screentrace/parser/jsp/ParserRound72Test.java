package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R72: the parser-jsp findings left after R68. */
class ParserRound72Test {
  @TempDir Path root;

  Path file(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
    return target;
  }

  @Test
  void aDefinitionWhoseParentIsUnresolvedKeepsWhatItDeclares() throws Exception {
    // RV-416
    Path tiles =
        file(
            "WEB-INF/tiles.xml",
            "<tiles-definitions>"
                + "<definition name=\"base\" template=\"/a.jsp\"/>"
                + "<definition name=\"base\" template=\"/b.jsp\"/>"
                + "<definition name=\"orders\" extends=\"base\"><put-attribute name=\"body\" value=\"/orders.jsp\"/></definition>"
                + "<definition name=\"missing\" extends=\"nowhere\" template=\"/c.jsp\"/>"
                + "</tiles-definitions>");
    var analysis = new JspProjectParser().analyze(root, List.of(tiles));
    var orders =
        analysis.tilesDefinitions().stream()
            .filter(d -> d.name().equals("orders"))
            .findFirst()
            .orElseThrow(() -> new AssertionError(analysis.tilesDefinitions().toString()));
    assertEquals("body", orders.attributes().get(0).name());
    assertTrue(analysis.tilesDefinitions().stream().anyMatch(d -> d.name().equals("missing")));
    assertTrue(
        analysis.diagnostics().stream().anyMatch(d -> d.message().contains("Tiles 父定義未解析：base")));
  }

  @Test
  void aButtonWithoutATypeSubmitsItsFormAndTheTypeIgnoresCase() throws Exception {
    // RV-410
    var markup =
        MarkupAnalysis.parse(
            "page.jsp",
            "<form action=\"/save\"><button>Save</button></form><button>Outside</button>"
                + "<button type=\"SUBMIT\">Upper</button><button type=\"button\">Plain</button>");
    var kinds =
        markup.components().stream()
            .filter(c -> c.tag().equals("button"))
            .map(c -> c.kind().name())
            .toList();
    assertEquals(List.of("SUBMIT", "BUTTON", "SUBMIT", "BUTTON"), kinds);
  }

  @Test
  void eachTagCallCitesOnlyItsOwnTagFile() throws Exception {
    // RV-407
    file("WEB-INF/tags/first.tag", "<a href=\"/first\">First</a>");
    file("WEB-INF/tags/second.tag", "<a href=\"/second\">Second</a>");
    file("WEB-INF/tags/frame.tag", "<div class=\"frame\"><jsp:doBody/></div>");
    Path page =
        file(
            "page.jsp",
            "<%@ taglib prefix=\"t\" tagdir=\"/WEB-INF/tags\" %>\n"
                + "<t:first/>\n"
                + "<t:frame>\n"
                + "<t:second/>\n"
                + "</t:frame>\n");
    var analysis = new JspProjectParser().analyze(root, List.of(page));
    for (var expected : List.of(List.of("First", "first.tag"), List.of("Second", "second.tag"))) {
      var interaction =
          analysis.interactions().stream()
              .filter(i -> i.label().equals(expected.get(0)))
              .findFirst()
              .orElseThrow(() -> new AssertionError(analysis.interactions().toString()));
      var tagFiles =
          interaction.definitionEvidence().stream()
              .map(e -> e.source().file())
              .filter(f -> f.endsWith(".tag"))
              .distinct()
              .toList();
      assertEquals(List.of("WEB-INF/tags/" + expected.get(1)), tagFiles, interaction.toString());
    }
  }
}
