package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
class MarkupTagSourceTest {
  @Test void ignoresCommentScriptletAndScriptMarkupAndKeepsActualLines() {
    var tags=MarkupTag.scan("<!-- <html:button value='fake'/> -->\n<%-- <html:submit/> --%>\n<% out.write(\"<button/>\"); %>\n<script>var x='<html:text/>';</script>\n<html:text property='real'/>");
    assertEquals(1,tags.stream().filter(t->t.name().startsWith("html:")).count());
    assertEquals(5,tags.stream().filter(t->t.name().equals("html:text")).findFirst().orElseThrow().line());
  }
}
