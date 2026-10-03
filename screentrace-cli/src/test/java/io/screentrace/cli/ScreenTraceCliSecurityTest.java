package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ScreenTraceCliSecurityTest {


  @Test void rejectsOutputWritesThroughSymlinks() throws Exception {
    Path root = Files.createTempDirectory("screentrace-output-root");
    Path outside = Files.createTempDirectory("screentrace-output-outside");
    Files.createSymbolicLink(root.resolve("linked"), outside);
    assertThrows(java.io.IOException.class, () -> io.screentrace.scanner.SafeProjectFiles.requireWritePathWithin(root, root.resolve("linked/file.json")));
  }
}
