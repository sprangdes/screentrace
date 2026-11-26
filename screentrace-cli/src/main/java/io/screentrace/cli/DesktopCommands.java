package io.screentrace.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.screentrace.report.SingleHtmlAnalysisWriter;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Non-interactive commands for the desktop app (ADR 0190). Each prints one JSON line on standard
 * output, or opens a report; the analysis itself still runs through `screentrace analyze <path>`.
 */
final class DesktopCommands {
  static final String USAGE =
      "Usage: screentrace desktop status | desktop workspace <project-root> <output-root>"
          + " | desktop browser <id> | desktop report <analysis-folder>";

  private DesktopCommands() {}

  static int run(String[] args, PrintStream out) throws IOException {
    if (args.length < 2) throw new IllegalArgumentException(USAGE);
    switch (args[1]) {
      case "status" -> {
        expect(args, 2);
        out.println(status(ReportBrowser.installed(ReportBrowser.forCurrentOs())));
      }
      case "workspace" -> {
        expect(args, 4);
        saveWorkspace(args[2], args[3]);
        out.println(status(ReportBrowser.installed(ReportBrowser.forCurrentOs())));
      }
      case "browser" -> {
        expect(args, 3);
        saveBrowser(args[2], ReportBrowser.installed(ReportBrowser.forCurrentOs()));
        out.println(status(ReportBrowser.installed(ReportBrowser.forCurrentOs())));
      }
      case "report" -> {
        expect(args, 3);
        ScreenTraceCli.reportOpener.open(report(args[2]));
      }
      default -> throw new IllegalArgumentException(USAGE);
    }
    return 0;
  }

  private static void expect(String[] args, int length) {
    if (args.length != length) throw new IllegalArgumentException(USAGE);
  }

  /** The workspace, the detected browsers and every project the app can analyze or open. */
  static String status(List<ReportBrowser.Choice> installed) throws IOException {
    WorkspaceSettings configured = ScreenTraceCli.existingSettings();
    boolean hasRoot = configured != null && Files.isDirectory(configured.projectRoot());
    Path outputRoot = hasRoot ? configured.outputRoot() : ScreenTraceCli.defaultOutputRoot();
    WorkspaceSettings settings =
        hasRoot ? configured : new WorkspaceSettings(outputRoot, outputRoot, Map.of());

    ObjectMapper mapper = new ObjectMapper();
    ObjectNode root = mapper.createObjectNode();
    root.put("format", 1);
    root.put("home", ScreenTraceCli.screenTraceHome().toString());
    if (hasRoot) root.put("projectRoot", configured.projectRoot().toString());
    else root.putNull("projectRoot");
    root.put("outputRoot", outputRoot.toString());
    String browser = WorkspaceSettings.browser(WorkspaceSettings.defaultFile());
    if (browser == null) root.putNull("browser");
    else root.put("browser", browser);
    root.put("browserLabel", ScreenTraceCli.browserLabel(browser));
    ArrayNode browsers = root.putArray("browsers");
    for (ScreenTraceCli.BrowserOption option : ScreenTraceCli.browserOptions(installed))
      if (option.id() != null)
        browsers.addObject().put("id", option.id()).put("label", option.label());

    ProjectCatalog catalog = new ProjectCatalog();
    Map<String, ObjectNode> projects = new LinkedHashMap<>();
    if (hasRoot) {
      try {
        for (ProjectCatalog.Project project : catalog.allProjects(settings))
          projects.put(project.name(), project(mapper, project, false));
      } catch (IOException unreadable) {
        // An unreadable project root lists no folders; analysed projects are still shown.
      }
    }
    for (ProjectCatalog.Project analysed : catalog.analyzedProjects(settings)) {
      ObjectNode entry = projects.get(analysed.name());
      if (entry == null) {
        Path source = recordedSource(analysed.analysisDirectory());
        entry =
            project(
                mapper,
                new ProjectCatalog.Project(analysed.name(), source, analysed.analysisDirectory()),
                true);
        projects.put(analysed.name(), entry);
      }
      markAnalysed(entry, analysed.analysisDirectory());
    }
    ArrayNode list = root.putArray("projects");
    projects.values().stream()
        .sorted(
            java.util.Comparator.comparing(
                (ObjectNode node) -> node.path("name").asText(), String.CASE_INSENSITIVE_ORDER))
        .forEach(list::add);
    return mapper.writeValueAsString(root);
  }

  private static ObjectNode project(
      ObjectMapper mapper, ProjectCatalog.Project project, boolean outsideRoot) {
    ObjectNode node = mapper.createObjectNode();
    node.put("name", project.name());
    if (project.sourceDirectory() == null || !Files.isDirectory(project.sourceDirectory()))
      node.putNull("source");
    else node.put("source", project.sourceDirectory().toString());
    node.put("analysis", project.analysisDirectory().toString());
    node.put("outsideRoot", outsideRoot);
    node.put("analyzed", false);
    node.putNull("analyzedAt");
    node.putNull("report");
    return node;
  }

  private static void markAnalysed(ObjectNode entry, Path analysis) {
    Path report = analysis.resolve("report/screentrace-report.html");
    if (!Files.isRegularFile(report, LinkOption.NOFOLLOW_LINKS))
      report = analysis.resolve("report/index.html");
    entry.put("analyzed", true);
    entry.put("report", report.toString());
    entry.set("summary", summary(analysis));
    try {
      entry.put(
          "analyzedAt", Files.getLastModifiedTime(report, LinkOption.NOFOLLOW_LINKS).toString());
    } catch (IOException unreadable) {
      entry.putNull("analyzedAt");
    }
  }

  /** Technologies and screen / endpoint / component counts of a finished analysis, or null. */
  static ObjectNode summary(Path analysis) {
    try {
      var graph = new ObjectMapper().readTree(analysis.resolve("application-graph.json").toFile());
      ObjectNode summary = new ObjectMapper().createObjectNode();
      ArrayNode technologies = summary.putArray("technologies");
      graph.path("application").path("technologies").forEach(t -> technologies.add(t.asText()));
      Map<String, Long> counts = new java.util.HashMap<>();
      graph.path("nodes").forEach(n -> counts.merge(n.path("type").asText(), 1L, Long::sum));
      summary.put("screens", counts.getOrDefault("SCREEN", 0L));
      summary.put("endpoints", counts.getOrDefault("ENDPOINT", 0L));
      summary.put("components", counts.getOrDefault("COMPONENT", 0L));
      // Each role's flow, counted like the CLI's "角色 …：可達 …" line.
      ArrayNode personas = summary.putArray("personas");
      graph
          .path("application")
          .path("personas")
          .forEach(
              persona -> {
                long reachable = 0, possible = 0;
                for (var reached : persona.path("flow").path("reached"))
                  if ("REACHABLE".equals(reached.path("reach").asText())) reachable++;
                  else if ("POSSIBLE".equals(reached.path("reach").asText())) possible++;
                personas
                    .addObject()
                    .put("name", persona.path("name").asText())
                    .put("reachable", reachable)
                    .put("possible", possible)
                    .put("unreached", persona.path("flow").path("unreached").size());
              });
      long hints = 0;
      for (var diagnostic : graph.path("diagnostics"))
        if ("CONTEXT_PATH_HINT".equals(diagnostic.path("code").asText()))
          hints += diagnostic.path("evidence").size();
      summary.put("contextPathHints", hints);
      return summary;
    } catch (IOException | RuntimeException unreadable) {
      return null;
    }
  }

  /**
   * The source folder an analysis records; the graph hides the home folder as "[home]", which is
   * expanded again. Null when the folder is unknown or no longer exists.
   */
  static Path recordedSource(Path analysis) {
    try {
      String recorded =
          new ObjectMapper()
              .readTree(analysis.resolve("application-graph.json").toFile())
              .path("application")
              .path("path")
              .asText("");
      if (recorded.startsWith("[home]"))
        recorded = System.getProperty("user.home") + recorded.substring("[home]".length());
      if (recorded.isBlank()) return null;
      Path source = Path.of(recorded);
      return source.isAbsolute() && Files.isDirectory(source) ? source : null;
    } catch (IOException | RuntimeException unreadable) {
      return null;
    }
  }

  /** Saves both roots like the interactive "專案根目錄" setting, keeping every other setting. */
  static void saveWorkspace(String projectRoot, String outputRoot) throws IOException {
    Path project = ScreenTraceCli.projectPath(projectRoot);
    if (!Files.isDirectory(project))
      throw new ScreenTraceCli.CommandRefusedException("目錄不存在：" + project, 2, null);
    Path output = ScreenTraceCli.projectPath(outputRoot);
    try {
      Files.createDirectories(output);
    } catch (IOException failed) {
      throw new ScreenTraceCli.CommandRefusedException(
          "無法建立輸出目錄：" + failed.getMessage(), 1, failed);
    }
    WorkspaceSettings current = ScreenTraceCli.existingSettings();
    WorkspaceSettings.CanonicalPaths canonical = WorkspaceSettings.canonicalPaths(project, output);
    new WorkspaceSettings(
            canonical.projectRoot(),
            canonical.outputRoot(),
            current == null ? Map.of() : current.contextPaths())
        .save(WorkspaceSettings.defaultFile());
  }

  /** Accepts only a browser this computer has, or the system default. */
  static void saveBrowser(String id, List<ReportBrowser.Choice> installed) throws IOException {
    boolean known =
        ReportBrowser.SYSTEM.equals(id)
            || installed.stream().anyMatch(c -> c.kind() != null && c.kind().id().equals(id));
    if (!known) throw new ScreenTraceCli.CommandRefusedException("找不到這個瀏覽器：" + id, 2, null);
    WorkspaceSettings.saveBrowser(WorkspaceSettings.defaultFile(), id);
  }

  /**
   * Regenerates the report of one analysis folder directly inside the current output root, like
   * `screentrace report <name>`.
   */
  static Path report(String folder) throws IOException {
    WorkspaceSettings configured = ScreenTraceCli.existingSettings();
    Path outputRoot =
        configured != null && Files.isDirectory(configured.projectRoot())
            ? configured.outputRoot()
            : ScreenTraceCli.defaultOutputRoot();
    Path analysis = ScreenTraceCli.projectPath(folder);
    if (analysis.getParent() == null
        || !Files.isDirectory(analysis.getParent())
        || !io.screentrace.scanner.RealPaths.isSame(analysis.getParent(), outputRoot))
      throw new ScreenTraceCli.CommandRefusedException("分析結果不在分析結果根目錄內：" + analysis, 2, null);
    Path safe = SafeProjectFiles.requireWritePathWithin(outputRoot, analysis);
    if (!Files.isRegularFile(safe.resolve("application-graph.json"), LinkOption.NOFOLLOW_LINKS))
      throw new ScreenTraceCli.CommandRefusedException("找不到分析結果：" + analysis, 2, null);
    String name = safe.getFileName().toString();
    return new SingleHtmlAnalysisWriter()
        .generate(
            safe, new LibraryStore(WorkspaceSettings.defaultFile().getParent()).selected(name))
        .path();
  }
}
