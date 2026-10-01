package io.screentrace.report;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReportGeneratorSecurityTest {
  @TempDir Path output;

  @Test void sourceDerivedIframeDoesNotGrantScriptExecution() throws Exception {
    var graph = new ApplicationGraph(new ApplicationGraph.Application("sample", "/sample", List.of("JSP")), List.of(), List.of(), List.of());
    new ReportGenerator().write(graph, output);
    String html = Files.readString(output.resolve("report/index.html"));
    assertTrue(html.contains("embedded.setAttribute('sandbox','')"));
    assertFalse(html.contains("allow-scripts"));
  }
}
