package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ScreenTraceCliSecurityTest {
  @Test void previewPolicyBlocksActiveContentAndUnknownMimeTypesAreBinary() {
    String csp = ScreenTraceCli.previewCsp();
    assertTrue(csp.contains("script-src 'none'"));
    assertTrue(csp.contains("connect-src 'none'"));
    assertTrue(csp.contains("form-action 'none'"));
    String main = ScreenTraceCli.reportCsp("<script>window.test=1</script>".getBytes(StandardCharsets.UTF_8));
    assertTrue(main.contains("sha256-"));
    assertFalse(main.contains("script-src 'unsafe-inline'"));
    assertEquals("application/octet-stream", ScreenTraceCli.contentType(Path.of("opaque.dat")));
  }

  @Test void rejectsOutputWritesThroughSymlinks() throws Exception {
    Path root = Files.createTempDirectory("screentrace-output-root");
    Path outside = Files.createTempDirectory("screentrace-output-outside");
    Files.createSymbolicLink(root.resolve("linked"), outside);
    assertThrows(java.io.IOException.class, () -> io.screentrace.scanner.SafeProjectFiles.requireWritePathWithin(root, root.resolve("linked/file.json")));
  }
}
