package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.jline.terminal.Size;
import org.jline.terminal.Terminal;
import org.jline.terminal.impl.DumbTerminal;
import org.jline.terminal.impl.ExternalTerminal;
import org.junit.jupiter.api.Test;

class InteractiveConsoleTest {
  @Test
  void enablesInPlaceRedrawOnlyWhenTerminalCapabilitiesAreAvailable() {
    assertTrue(
        InteractiveConsole.supportsInPlaceRedraw("xterm-256color", 120, 40, true, true, true));
    assertFalse(
        InteractiveConsole.supportsInPlaceRedraw(Terminal.TYPE_DUMB, 120, 40, true, true, true));
    assertFalse(
        InteractiveConsole.supportsInPlaceRedraw(
            Terminal.TYPE_DUMB_COLOR, 120, 40, true, true, true));
    assertFalse(InteractiveConsole.supportsInPlaceRedraw("xterm", 0, 40, true, true, true));
    assertFalse(InteractiveConsole.supportsInPlaceRedraw("xterm", 120, 40, false, true, true));
  }

  @Test
  void enterOpensTheReportAndEscOrClosedInputReturnsToTheMenu() throws Exception {
    assertTrue(confirm("\r", true));
    assertFalse(confirm("\u001b", true));
    assertFalse(confirm("q", true));
    assertFalse(confirm("", true));
  }

  @Test
  void lineModeAcceptsEnterAndReturnsOnQOrClosedInput() throws Exception {
    assertTrue(confirm("\n", false));
    assertFalse(confirm("q\n", false));
    assertFalse(confirm("", false));
  }

  private static boolean confirm(String keys, boolean redraw) throws Exception {
    var output = new ByteArrayOutputStream();
    var input = new ByteArrayInputStream(keys.getBytes(StandardCharsets.UTF_8));
    Terminal terminal =
        redraw
            ? new ExternalTerminal("test", "xterm-256color", input, output, StandardCharsets.UTF_8)
            : new DumbTerminal("test", Terminal.TYPE_DUMB, input, output, StandardCharsets.UTF_8);
    if (redraw) terminal.setSize(new Size(80, 24));
    try (InteractiveConsole console = new InteractiveConsole(terminal)) {
      return console.confirmOpenReport("file:///out/report.html");
    }
  }

  @Test
  void pathPromptsExpandHomeAndCancelOnClosedInput() throws Exception {
    // RV-116: '~' was taken literally and Ctrl-D crashed the session.
    String home = System.getProperty("user.home");
    try (InteractiveConsole console = lineConsole("~\n")) {
      assertEquals(
          java.nio.file.Path.of(home).toAbsolutePath().normalize(),
          console.existingDirectory("folder", java.nio.file.Path.of(".")));
    }
    try (InteractiveConsole console = lineConsole("")) {
      assertThrows(
          InteractiveConsole.SelectionCancelledException.class,
          () -> console.existingDirectory("folder", java.nio.file.Path.of(".")));
    }
  }

  @Test
  void aMenuWiderThanTheTerminalIsCutToItsWidth() throws Exception {
    var output = new ByteArrayOutputStream();
    var input = new ByteArrayInputStream("\r".getBytes(StandardCharsets.UTF_8));
    Terminal terminal =
        new ExternalTerminal("test", "xterm-256color", input, output, StandardCharsets.UTF_8);
    terminal.setSize(new Size(40, 24));
    try (InteractiveConsole console = new InteractiveConsole(terminal)) {
      console.select("Projects", java.util.List.of("x".repeat(120)), v -> v, 'q', "q 離開", -1);
    }
    for (String line : output.toString(StandardCharsets.UTF_8).split("\\R"))
      assertTrue(
          new org.jline.utils.AttributedString(line.replaceAll("\\u001b\\[[0-9;?]*[A-Za-z]", ""))
                  .columnLength()
              <= 40,
          line);
  }

  private static InteractiveConsole lineConsole(String keys) throws Exception {
    var input = new ByteArrayInputStream(keys.getBytes(StandardCharsets.UTF_8));
    return new InteractiveConsole(
        new DumbTerminal(
            "test",
            Terminal.TYPE_DUMB,
            input,
            new ByteArrayOutputStream(),
            StandardCharsets.UTF_8));
  }
}
