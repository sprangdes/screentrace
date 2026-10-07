package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import org.junit.jupiter.api.Test;

class ScreenTraceCliSecurityTest {


  @Test void rejectsOutputWritesThroughSymlinks() throws Exception {
    Path root = Files.createTempDirectory("screentrace-output-root");
    Path outside = Files.createTempDirectory("screentrace-output-outside");
    Files.createSymbolicLink(root.resolve("linked"), outside);
    assertThrows(java.io.IOException.class, () -> io.screentrace.scanner.SafeProjectFiles.requireWritePathWithin(root, root.resolve("linked/file.json")));
  }

  @Test void outsidePreviewResourceHasConciseChineseCliFailureWithoutAbsolutePath() throws Exception {
    var error=io.screentrace.report.PreviewResourceBoundaryException.outside(Path.of("/Users/private/project/secret.svg"));
    var bytes=new ByteArrayOutputStream();
    int status=ScreenTraceCli.reportRejectedPreviewResource(error,new PrintStream(bytes, true, StandardCharsets.UTF_8));
    String message=bytes.toString(StandardCharsets.UTF_8);
    assertEquals(2,status);
    assertTrue(message.contains("預覽資源位於分析輸出目錄之外，已拒絕"));
    assertTrue(message.contains("輸出外資源/secret.svg"));
    assertTrue(message.contains("根目錄類型：分析輸出目錄"));
    assertFalse(message.contains("/Users/private"));
    assertFalse(message.contains("Exception"));
    assertFalse(message.contains("at "));
  }
}
