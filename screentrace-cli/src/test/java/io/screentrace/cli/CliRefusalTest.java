package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** RV-010: usage and library errors print one message and exit non-zero, never a stack trace. */
class CliRefusalTest {
  @TempDir Path root;

  private int run(ByteArrayOutputStream bytes, String... args) throws Exception {
    String home = System.getProperty("user.home"),
        previous = System.getProperty("screentrace.home");
    System.setProperty("user.home", Files.createDirectories(root.resolve("home")).toString());
    System.setProperty(
        "screentrace.home", Files.createDirectories(root.resolve("screentrace")).toString());
    try {
      return ScreenTraceCli.runReportingRefusals(
          args, new PrintStream(bytes, true, StandardCharsets.UTF_8));
    } finally {
      System.setProperty("user.home", home);
      if (previous == null) System.clearProperty("screentrace.home");
      else System.setProperty("screentrace.home", previous);
    }
  }

  private void assertRefused(int status, String expected, String... args) throws Exception {
    var bytes = new ByteArrayOutputStream();
    assertEquals(status, run(bytes, args), String.join(" ", args));
    String error = bytes.toString(StandardCharsets.UTF_8);
    assertTrue(error.contains(expected), error);
    assertFalse(error.contains("Exception") || error.contains("\tat "), error);
  }

  @Test
  void usageErrorsExitTwo() throws Exception {
    assertRefused(2, "Usage: screentrace", "analyze", "a", "b");
    assertRefused(2, "Usage: screentrace", "--help");
  }

  @Test
  void invalidLibraryCommandsExitTwoAndFailedOnesExitOne() throws Exception {
    assertRefused(2, "library 指令無效", "library", "bad");
    assertRefused(2, "library 選項無效", "library", "unbind", "--force");
    assertRefused(1, "元件庫指令失敗", "library", "validate", root.resolve("absent.json").toString());
  }
}
