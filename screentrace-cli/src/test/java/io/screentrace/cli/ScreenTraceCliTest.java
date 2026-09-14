package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ScreenTraceCliTest {
  @Test void onlyResolvesStaticFilesInsideTheirAllowedRoot() throws Exception {
    Path root = Files.createTempDirectory("screentrace-cli-test");
    Path report = Files.createDirectories(root.resolve("report"));
    Path analysis = Files.createDirectories(root.resolve("analysis"));
    Path outside = root.resolve("secret.txt");
    Files.writeString(outside, "secret");
    Files.writeString(report.resolve("index.html"), "report");
    Files.writeString(analysis.resolve("application-graph.json"), "{}");
    Files.writeString(analysis.resolve("preview-model.json"), "{}");

    assertEquals(report.resolve("index.html"), ScreenTraceCli.staticFile("/", report, analysis));
    assertEquals(analysis.resolve("application-graph.json"), ScreenTraceCli.staticFile("/application-graph.json", report, analysis));
    assertEquals(analysis.resolve("preview-model.json"), ScreenTraceCli.staticFile("/preview-model.json", report, analysis));
    assertNull(ScreenTraceCli.staticFile("/../secret.txt", report, analysis));
    try {
      Files.createSymbolicLink(analysis.resolve("prototype-model.json"), outside);
      assertNull(ScreenTraceCli.staticFile("/prototype-model.json", report, analysis));
    } catch (UnsupportedOperationException ignored) {
      // Some test filesystems do not support symbolic links.
    }
  }

  @Test void limitsOverlayBodiesAndUsesLoopbackForTheReportServer() throws Exception {
    byte[] allowed = new byte[ScreenTraceCli.MAX_OVERLAY_BYTES];
    assertArrayEquals(allowed, ScreenTraceCli.readLimited(new ByteArrayInputStream(allowed)));
    assertThrows(ScreenTraceCli.RequestTooLargeException.class,
        () -> ScreenTraceCli.readLimited(new ByteArrayInputStream(new byte[ScreenTraceCli.MAX_OVERLAY_BYTES + 1])));
    assertTrue(ScreenTraceCli.REPORT_ADDRESS.isLoopbackAddress());
    assertTrue(ScreenTraceCli.hasMutationToken("session-token", "session-token"));
    assertFalse(ScreenTraceCli.hasMutationToken("wrong-token", "session-token"));
  }

  @Test void onlyAcceptsProjectPathWithoutOptions() {
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"capture"}));
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"serve"}));
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"analyze", "--serve"}));
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"analyze", "--output", "/tmp/output"}));
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"export", "--output", "/tmp/result.json"}));
  }
}
