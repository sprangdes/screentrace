package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class ScreenTraceCliTest {

  @Test
  void rejectsRemovedCommandsAndCustomOutputOptions() throws Exception {
    for (String[] args :
        new String[][] {
          {"capture"},
          {"open"},
          {"serve"},
          {"analyze", "--serve"},
          {"analyze", "--output", "/tmp/output"},
          {"export", "--output", "/tmp/result.json"}
        }) {
      var bytes = new ByteArrayOutputStream();
      assertEquals(
          2,
          ScreenTraceCli.runReportingRefusals(
              args, new PrintStream(bytes, true, StandardCharsets.UTF_8)),
          String.join(" ", args));
      assertTrue(bytes.toString(StandardCharsets.UTF_8).startsWith("Usage: screentrace"));
    }
  }
}
