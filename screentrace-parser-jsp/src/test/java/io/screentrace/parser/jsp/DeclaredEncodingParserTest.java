package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.charset.Charset;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

/** Legacy pageEncoding values must never cause a JSP to be skipped. */
class DeclaredEncodingParserTest {
  private JspAnalysis analyze(byte[] bytes) throws Exception {
    Path root=Files.createTempDirectory("encoding");Path file=root.resolve("order.jsp");Files.write(file,bytes);
    return new JspProjectParser().analyze(root,List.of(file));
  }
  @Test void big5PageIsParsedWithDecodedLabels() throws Exception {
    var result=analyze("<%@ page pageEncoding=\"Big5\"%>\n<form action=\"/order/save.do\"><input type=\"submit\" value=\"儲存訂單\"></form>\n<a href=\"/order/list.do\">訂單列表</a>".getBytes(Charset.forName("Big5")));
    assertTrue(result.diagnostics().stream().noneMatch(d->d.message().contains("skipped")),result.diagnostics().toString());
    assertTrue(result.interactions().stream().anyMatch(i->"/order/save.do".equals(i.target())));
    assertTrue(result.interactions().stream().anyMatch(i->"/order/list.do".equals(i.target())&&i.label().contains("訂單列表")));
  }
  @Test void unknownDeclarationStillParsesStructure() throws Exception {
    var result=analyze("<%@ page pageEncoding=\"x-unknown\"%>\n<a href=\"/next.do\">Next</a>".getBytes(java.nio.charset.StandardCharsets.UTF_8));
    assertTrue(result.diagnostics().stream().noneMatch(d->d.message().contains("skipped")),result.diagnostics().toString());
    assertTrue(result.interactions().stream().anyMatch(i->"/next.do".equals(i.target())));
  }
}
