package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertTrue;

import io.screentrace.adapter.spring.SpringProjectAnalyzer;
import io.screentrace.adapter.struts.StrutsProjectAnalyzer;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.report.ReportGenerator;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FixtureReportContractTest {
  private final ProjectScanner scanner = new ProjectScanner();
  @TempDir Path output;

  @Test void everyServerRenderedFixtureUsesTheSameExplorerFlowPageTraceAndReviewContracts() throws Exception {
    for (String name : List.of("struts", "struts-spring", "spring-mvc-jsp", "spring-boot-jsp")) {
      ApplicationGraph graph = analyze(fixture(name));
      Path reportOutput = output.resolve(name);
      new ReportGenerator().write(graph, reportOutput);

      assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == ApplicationGraph.NodeType.SCREEN), name);
      assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == ApplicationGraph.NodeType.COMPONENT), name);
      String applicationGraph = Files.readString(reportOutput.resolve("application-graph.json"));
      String prototype = Files.readString(reportOutput.resolve("prototype-model.json"));
      String preview = Files.readString(reportOutput.resolve("preview-model.json"));
      String report = Files.readString(reportOutput.resolve("report/index.html"));
      assertTrue(applicationGraph.contains("SCREEN"), name);
      assertTrue(prototype.contains("graphScreenId"), name);
      assertTrue(preview.contains("graphScreenId"), name);
      assertTrue(preview.contains("targetScreenId"), name);
      assertTrue(report.contains("renderOverviewCanvas"), name); // Screen Explorer
      assertTrue(report.contains("renderFocusedCanvas"), name); // Flow View
      assertTrue(report.contains("renderPage"), name); // Page View
      assertTrue(report.contains("showDetail"), name); // Component Trace
      assertTrue(report.contains("reviewToolbar"), name); // Review/Edit Mode
    }
  }

  private ApplicationGraph analyze(Path root) throws Exception {
    ProjectScanner.ProjectInventory inventory = scanner.scan(root);
    return inventory.technologies().contains("Struts 1")
        ? new StrutsProjectAnalyzer().analyze(inventory)
        : new SpringProjectAnalyzer().analyze(inventory);
  }

  private static Path fixture(String name) {
    Path directory = Path.of("").toAbsolutePath();
    while (directory != null) {
      Path candidate = directory.resolve("fixtures").resolve(name);
      if (Files.isDirectory(candidate)) return candidate;
      directory = directory.getParent();
    }
    throw new IllegalStateException("Fixture not found: " + name);
  }
}
