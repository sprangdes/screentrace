package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.jline.terminal.Terminal;
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
}
