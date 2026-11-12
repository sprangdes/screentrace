package io.screentrace.scanner;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReservedEvidenceNameTest {
  @TempDir Path root;

  @Test
  void reservedTargetNamesCannotImpersonateWorkspaceEvidence() throws Exception {
    Path file;
    try {
      file = root.resolve("workspace:config.json");
    } catch (InvalidPathException reservedByFilesystem) {
      // Windows does not allow ':' in a file name, so no target file can carry the reserved
      // prefix; the scanner's own check only matters where the file system accepts the name.
      assertEquals("workspace:config.json", reservedByFilesystem.getInput());
      return;
    }
    Files.writeString(file, "{} ");
    assertThrows(
        java.io.IOException.class, () -> SafeProjectFiles.readUtf8Limited(root, file, 1024));
    assertFalse(new ProjectScanner().scan(root).files().contains(file));
  }
}
