package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class JspProjectParserSecurityTest {
  @Test void traversalAndSymlinkIncludesAreUnresolved() throws Exception {
    Path root = Files.createTempDirectory("jsp-security");
    Path web = root.resolve("src/main/webapp/WEB-INF/jsp");
    Files.createDirectories(web);
    Files.writeString(web.resolve("page.jsp"), "<%@ include file=\"../../../../../../outside.jsp\" %><%@ include file=\"link.jsp\" %>");
    Path outside = Files.createTempFile("outside", ".jsp");
    Files.writeString(outside, "<a href=\"/stolen\">Secret</a>");
    try {
      Files.createSymbolicLink(web.resolve("link.jsp"), outside);
      var inventory = new ProjectScanner().scan(root);
      var parsed = new JspProjectParser().analyze(root, inventory.jspFiles());
      assertTrue(parsed.interactions().isEmpty());
      assertTrue(parsed.diagnostics().stream().anyMatch(item -> item.message().contains("cannot be found")
          || item.message().contains("cannot be resolved")), parsed.diagnostics().toString());
      assertFalse(parsed.views().stream().anyMatch(view -> view.path().contains("outside")));
    } finally { Files.deleteIfExists(outside); }
  }

  @Test void marksOversizedJspUnresolvedInsteadOfReadingIt() throws Exception {
    Path root = Files.createTempDirectory("jsp-size-security");
    Path jsp = root.resolve("page.jsp");
    Files.write(jsp, new byte[8 * 1024 * 1024 + 1]);
    var analysis = new JspProjectParser().analyze(root, List.of(jsp));
    assertTrue(analysis.views().isEmpty());
    assertTrue(analysis.diagnostics().stream().anyMatch(item -> item.message().contains("exceeds limit")));
  }
}
