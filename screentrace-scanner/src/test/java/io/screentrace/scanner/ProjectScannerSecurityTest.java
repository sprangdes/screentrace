package io.screentrace.scanner;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ProjectScannerSecurityTest {
  @TempDir Path temporary;

  @Test void scannerSkipsOutsideAndInternalSymlinks() throws Exception {
    Path root = Files.createDirectory(temporary.resolve("project"));
    Path outside = Files.writeString(temporary.resolve("outside.java"), "class Outside {}");
    Files.createSymbolicLink(root.resolve("Outside.java"), outside);
    Files.createSymbolicLink(root.resolve("linked-dir"), temporary);
    Files.writeString(root.resolve("Inside.java"), "class Inside {}");

    var inventory = new ProjectScanner().scan(root);
    assertEquals(1, inventory.javaFiles().size());
    assertEquals("Inside.java", inventory.javaFiles().get(0).getFileName().toString());
    assertEquals(2, inventory.diagnostics().stream().filter(message -> message.contains("Symbolic link")).count());
  }

  @Test void limitedReaderRejectsOversizedFiles() throws Exception {
    Path root = Files.createDirectory(temporary.resolve("limited"));
    Path file = Files.writeString(root.resolve("large.jsp"), "123456789");
    assertThrows(java.io.IOException.class, () -> SafeProjectFiles.readUtf8Limited(root, file, 8));
  }
}
