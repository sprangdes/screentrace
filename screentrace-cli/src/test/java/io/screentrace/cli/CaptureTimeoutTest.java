package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** HC-004 / ADR 0143: the preview capture gets more time for more screens, within a cap. */
class CaptureTimeoutTest {
  @Test
  void timeoutGrowsWithScreensWithinThirtyMinutes() {
    assertEquals(120, ScreenTraceCli.captureTimeoutSeconds(0));
    assertEquals(120, ScreenTraceCli.captureTimeoutSeconds(-1));
    assertEquals(122, ScreenTraceCli.captureTimeoutSeconds(1));
    // The 80-screen synthetic project took 48.7 s alone and 52 s inside a full CLI run.
    assertEquals(280, ScreenTraceCli.captureTimeoutSeconds(80));
    assertEquals(1_120, ScreenTraceCli.captureTimeoutSeconds(500));
    assertEquals(1_800, ScreenTraceCli.captureTimeoutSeconds(840));
    assertEquals(1_800, ScreenTraceCli.captureTimeoutSeconds(100_000));
  }
}
