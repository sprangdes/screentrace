package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ScreenTraceCliTest {




  @Test void rejectsRemovedCommandsAndCustomOutputOptions() {
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"capture"}));
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"open"}));
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"serve"}));
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"analyze", "--serve"}));
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"analyze", "--output", "/tmp/output"}));
    assertThrows(IllegalArgumentException.class, () -> ScreenTraceCli.main(new String[] {"export", "--output", "/tmp/result.json"}));
  }


}
