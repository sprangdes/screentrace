package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertFalse;
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
    assertTrue(InteractiveConsole.supportsInPlaceRedraw("xterm-256color", 120, 40, true, true, true));
    assertFalse(InteractiveConsole.supportsInPlaceRedraw(Terminal.TYPE_DUMB, 120, 40, true, true, true));
    assertFalse(InteractiveConsole.supportsInPlaceRedraw(Terminal.TYPE_DUMB_COLOR, 120, 40, true, true, true));
    assertFalse(InteractiveConsole.supportsInPlaceRedraw("xterm", 0, 40, true, true, true));
    assertFalse(InteractiveConsole.supportsInPlaceRedraw("xterm", 120, 40, false, true, true));
  }

  @Test void enterOpensTheReportAndEscOrClosedInputReturnsToTheMenu() throws Exception {
    assertTrue(confirm("\r", true));
    assertFalse(confirm("\u001b", true));
    assertFalse(confirm("q", true));
    assertFalse(confirm("", true));
  }

  @Test void lineModeAcceptsEnterAndReturnsOnQOrClosedInput() throws Exception {
    assertTrue(confirm("\n", false));
    assertFalse(confirm("q\n", false));
    assertFalse(confirm("", false));
  }

  private static boolean confirm(String keys, boolean redraw) throws Exception {
    var output = new ByteArrayOutputStream();
    var input = new ByteArrayInputStream(keys.getBytes(StandardCharsets.UTF_8));
    Terminal terminal = redraw
        ? new ExternalTerminal("test", "xterm-256color", input, output, StandardCharsets.UTF_8)
        : new DumbTerminal("test", Terminal.TYPE_DUMB, input, output, StandardCharsets.UTF_8);
    if (redraw) terminal.setSize(new Size(80, 24));
    try (InteractiveConsole console = new InteractiveConsole(terminal)) {
      return console.confirmOpenReport("file:///out/report.html");
    }
  }
}
