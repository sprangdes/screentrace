package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/** oussamazoghlami/SpringStrutsHibernate pages/tiles/includes.jsp holds only taglib directives and was listed as a blank screen. */
class DirectiveOnlyJspTest {
  @Test void aJspOfOnlyDirectivesIsAFragmentAndOneWithMarkupStaysAPage() throws Exception {
    Path root = Files.createTempDirectory("st-directive-only");
    Path includes = root.resolve("src/main/webapp/pages/tiles/includes.jsp"), page = root.resolve("src/main/webapp/pages/page.jsp");
    Files.createDirectories(includes.getParent());
    Files.writeString(includes, "<%@ taglib prefix=\"spring\" uri=\"http://www.springframework.org/tags\" %>\n<%-- shared declarations --%>\n<%@ taglib uri=\"http://struts.apache.org/tags-bean\" prefix=\"bean\"%>\n<%@ staglib uri=\"http://struts.apache.org/tags-logic\" prefix=\"logic\"%>\n");
    Files.writeString(page, "<%@ taglib uri=\"http://struts.apache.org/tags-bean\" prefix=\"bean\"%>\n<h1>Page</h1>");
    var views = new JspProjectParser().analyze(root, List.of(includes, page)).views();
    assertEquals(JspAnalysis.ViewKind.JSPF, views.stream().filter(v -> v.path().endsWith("includes.jsp")).findFirst().orElseThrow().kind());
    assertEquals(JspAnalysis.ViewKind.JSP, views.stream().filter(v -> v.path().endsWith("page.jsp")).findFirst().orElseThrow().kind());
    assertTrue(JspProjectParser.directivesOnly("  <%@ page contentType=\"text/html\" %>\n"));
    assertFalse(JspProjectParser.directivesOnly("<%@ page %><% out.print(1); %>"), "a scriptlet can render");
  }
}
