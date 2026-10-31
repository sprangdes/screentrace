package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/** A submit button's formmethod overrides its form's method, exactly as formaction overrides the form's action. */
class JspSubmitterMethodTest {
  private static JspAnalysis analyze(String markup) throws Exception {
    Path root = Files.createTempDirectory("jsp-submitter-method");
    Path page = root.resolve("src/main/webapp/WEB-INF/jsp/page.jsp");
    Files.createDirectories(page.getParent());
    Files.writeString(page, markup);
    return new JspProjectParser().analyze(root, List.of(page));
  }

  private static String method(JspAnalysis analysis, String label) {
    return analysis.interactions().stream().filter(item -> label.equals(item.label())).findFirst().orElseThrow().httpMethod();
  }

  @Test void formmethodOverridesTheFormMethod() throws Exception {
    var analysis = analyze("<form method=\"get\" action=\"/page\"><button type=\"submit\" formaction=\"/save\" formmethod=\"post\">Save</button></form>");
    assertEquals("POST", method(analysis, "Save"));
  }

  @Test void inputSubmitFormmethodIsTrimmedAndUppercased() throws Exception {
    var analysis = analyze("<form method=\"post\" action=\"/page\"><input type=\"submit\" value=\"Reload\" formmethod=\" get \"/></form>");
    assertEquals("GET", method(analysis, "Reload"));
  }

  @Test void submitterWithoutFormmethodKeepsTheFormMethod() throws Exception {
    var analysis = analyze("<form method=\"post\" action=\"/page\"><button type=\"submit\" formaction=\"/save\">Save</button><button type=\"submit\" formmethod=\"\">Blank</button></form>");
    assertEquals("POST", method(analysis, "Save"));
    assertEquals("POST", method(analysis, "Blank"));
  }
}
