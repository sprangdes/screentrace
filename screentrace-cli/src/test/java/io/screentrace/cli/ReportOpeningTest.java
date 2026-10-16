package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Which entry points open the report: `analyze` never does, the one-line path form always does, the menu asks. */
class ReportOpeningTest {
  @TempDir Path root;
  private final List<Path> opened = new ArrayList<>();
  private ScreenTraceCli.ReportOpener original;
  private String home;
  private String screenTraceHome;

  @BeforeEach void recordOpens() throws Exception {
    original = ScreenTraceCli.reportOpener;
    ScreenTraceCli.reportOpener = opened::add;
    home = System.getProperty("user.home");
    screenTraceHome = System.getProperty("screentrace.home");
    System.setProperty("user.home", Files.createDirectory(root.resolve("home")).toString());
    System.setProperty("screentrace.home", Files.createDirectory(root.resolve("screentrace")).toString());
  }

  @AfterEach void restore() {
    ScreenTraceCli.reportOpener = original;
    System.setProperty("user.home", home);
    if (screenTraceHome == null) System.clearProperty("screentrace.home");
    else System.setProperty("screentrace.home", screenTraceHome);
  }

  private Path project(Path parent) throws Exception {
    Path project = Files.createDirectories(parent.resolve("demo"));
    Files.writeString(project.resolve("pom.xml"), "<project><dependencies><dependency><artifactId>spring-webmvc</artifactId></dependency></dependencies></project>");
    return project;
  }

  @Test void analyzeCommandWritesTheReportWithoutOpeningIt() throws Exception {
    Path projects = Files.createDirectory(root.resolve("projects")), output = Files.createDirectory(root.resolve("output"));
    project(projects);
    new WorkspaceSettings(projects, output).save(WorkspaceSettings.defaultFile());
    assertEquals(0, ScreenTraceCli.run(new String[] {"analyze", "demo"}));
    assertTrue(Files.isRegularFile(output.resolve("demo/report/screentrace-report.html")));
    assertEquals(List.of(), opened);
  }

  @Test void projectPathFormOpensTheReport() throws Exception {
    Path project = project(Files.createDirectory(root.resolve("projects")));
    assertEquals(0, ScreenTraceCli.run(new String[] {project.toString()}));
    assertEquals(1, opened.size());
    assertTrue(opened.get(0).endsWith(Path.of("demo/report/screentrace-report.html")), opened.toString());
  }

  @Test void interactiveAnalysisOpensOnlyWhenTheUserAccepts() throws Exception {
    Path report = root.resolve("report.html");
    List<String> asked = new ArrayList<>();
    ScreenTraceCli.offerReport(url -> { asked.add(url); return true; }, report);
    assertEquals(List.of(report), opened);
    ScreenTraceCli.offerReport(url -> { asked.add(url); return false; }, report);
    assertEquals(List.of(report), opened);
    assertEquals(List.of(report.toUri().toString(), report.toUri().toString()), asked);
  }

  @Test void browserSettingListsOnlyDetectedBrowsersPlusTheSystemDefault() {
    var installed = List.of(new ReportBrowser.Choice(ReportBrowser.Kind.CHROME, Path.of("/a")),
        new ReportBrowser.Choice(ReportBrowser.Kind.SAFARI, Path.of("/b")));
    assertEquals(List.of("Google Chrome", "Safari（不支援自動存檔）", "系統預設", "← 返回設定"),
        ScreenTraceCli.browserOptions(installed).stream().map(ScreenTraceCli.BrowserOption::label).toList());
    assertEquals(List.of("系統預設", "← 返回設定"),
        ScreenTraceCli.browserOptions(List.of()).stream().map(ScreenTraceCli.BrowserOption::label).toList());
    assertEquals("Microsoft Edge", ScreenTraceCli.browserLabel("edge"));
    assertTrue(ScreenTraceCli.browserLabel(null).startsWith("自動"));
  }
}
