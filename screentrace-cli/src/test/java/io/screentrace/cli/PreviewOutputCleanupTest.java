package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** RV-005: a run never reuses preview files left by an earlier run. */
class PreviewOutputCleanupTest {
  @TempDir Path output;

  @Test
  void earlierPreviewFilesAreRemovedAndOtherOutputsKept() throws Exception {
    Files.createDirectories(output.resolve("static-preview/assets/css"));
    Files.writeString(output.resolve("static-preview/manifest.json"), "{}");
    Files.writeString(output.resolve("static-preview/element-styles.json"), "{}");
    Files.writeString(output.resolve("static-preview/assets/css/site.css"), "body{}");
    Files.createDirectories(output.resolve("screenshots"));
    Files.writeString(output.resolve("screenshots/manifest.json"), "{}");
    Files.writeString(output.resolve("viewer-documents.json"), "{}");
    Files.writeString(output.resolve("application-graph.json"), "{}");
    ScreenTraceCli.clearPreviewOutputs(output);
    for (String name : ScreenTraceCli.PREVIEW_OUTPUTS)
      assertFalse(Files.exists(output.resolve(name), LinkOption.NOFOLLOW_LINKS), name);
    assertTrue(Files.exists(output.resolve("application-graph.json")));
    ScreenTraceCli.clearPreviewOutputs(output);
  }

  @Test
  void symbolicLinkIsRefusedAndItsTargetKept() throws Exception {
    Path outside =
        Files.createDirectories(output.resolveSibling(output.getFileName() + "-outside"));
    Files.writeString(outside.resolve("keep.txt"), "x");
    Files.createSymbolicLink(output.resolve("static-preview"), outside);
    assertThrows(IOException.class, () -> ScreenTraceCli.clearPreviewOutputs(output));
    assertTrue(Files.exists(outside.resolve("keep.txt")));
  }
}
