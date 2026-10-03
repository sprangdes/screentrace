package io.screentrace.cli;

import io.screentrace.adapter.spring.SpringProjectAnalyzer;
import io.screentrace.adapter.struts.StrutsProjectAnalyzer;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraphMerger;
import io.screentrace.report.SingleHtmlAnalysisWriter;
import io.screentrace.report.ReviewResultGenerator;
import io.screentrace.scanner.ProjectScanner;
import io.screentrace.scanner.SafeProjectFiles;
import java.awt.Desktop;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

/** Interactive entry point plus scriptable analyze, report, export, and config commands. */
public final class ScreenTraceCli {
  private static final Logger LOGGER = Logger.getLogger(ScreenTraceCli.class.getName());

  public static void main(String[] args) throws IOException, InterruptedException {
    Command command = Command.parse(args);
    try (InteractiveConsole console = new InteractiveConsole()) {
      WorkspaceSettings settings = command.action() == Action.CONFIG ? configure(console) : loadOrConfigure(console);
      if (command.action() == Action.CONFIG) return;
      ProjectCatalog catalog = new ProjectCatalog();
      if (command.action() == Action.INTERACTIVE) {
        runInteractive(console, settings, catalog);
        return;
      }
      List<ProjectCatalog.Project> projects = command.action() == Action.ANALYZE
          ? catalog.allProjects(settings) : catalog.analyzedProjects(settings);
      ProjectCatalog.Project project;
      try {
        project = selectProject(console, catalog, projects, command.projectName());
      } catch (InteractiveConsole.SelectionCancelledException ignored) {
        return;
      }
      if (command.action() == Action.ANALYZE) {
        AnalysisResult result = analyze(project,settings);
        logAnalysis(result);
        openReport(result.report());
      }
      else if (command.action() == Action.REPORT) openReport(new SingleHtmlAnalysisWriter().generate(project.analysisDirectory()).path());
      else logExport(export(project));
    }
  }

  private static void runInteractive(InteractiveConsole console, WorkspaceSettings settings, ProjectCatalog catalog)
      throws IOException, InterruptedException {
    while (true) {
      Action action;
      try {
        action = chooseCommand(console);
      } catch (InteractiveConsole.SelectionCancelledException ignored) {
        return;
      }
      if (action == Action.EXIT) return;
      List<ProjectCatalog.Project> projects = action == Action.ANALYZE
          ? catalog.allProjects(settings) : catalog.analyzedProjects(settings);
      ProjectCatalog.Project project;
      try {
        project = selectProject(console, catalog, projects, null);
      } catch (InteractiveConsole.SelectionCancelledException ignored) {
        continue;
      }
      if (action == Action.EXPORT) {
        console.showExportComplete(export(project));
        continue;
      }
      Path report;
      if (action == Action.ANALYZE) {
        AnalysisResult result = analyze(project,settings);
        console.showAnalysisComplete(result.project(), result.technologies(), result.endpoints(), result.screens(),
            result.components(), result.output());
        report = result.report();
      } else {
        report = new SingleHtmlAnalysisWriter().generate(project.analysisDirectory()).path();
      }
      openReport(report);
      console.waitForMenuReturn(report.toUri().toString());
    }
  }

  private static WorkspaceSettings loadOrConfigure(InteractiveConsole console) throws IOException {
    Path settingsFile = WorkspaceSettings.defaultFile();
    if (!Files.isRegularFile(settingsFile)) return configure(console);
    WorkspaceSettings settings = WorkspaceSettings.load(settingsFile);
    return Files.isDirectory(settings.projectRoot()) ? settings : configure(console);
  }

  private static WorkspaceSettings configure(InteractiveConsole console) throws IOException {
    WorkspaceSettings current = existingSettings();
    Path projectDefault = current == null ? Path.of(".").toAbsolutePath().normalize() : current.projectRoot();
    Path projectRoot = console.existingDirectory("所有專案的根目錄", projectDefault);
    Path outputDefault = current == null ? projectRoot.resolve("analyze") : current.outputRoot();
    Path outputRoot = console.outputDirectory("分析結果根目錄", outputDefault);
    WorkspaceSettings settings = new WorkspaceSettings(projectRoot, outputRoot,current==null?java.util.Map.of():current.contextPaths());
    settings.save(WorkspaceSettings.defaultFile());
    LOGGER.info(() -> "設定已儲存：\n  專案根目錄：" + settings.projectRoot() + "\n  輸出根目錄：" + settings.outputRoot());
    return settings;
  }

  private static WorkspaceSettings existingSettings() {
    try {
      Path file = WorkspaceSettings.defaultFile();
      return Files.isRegularFile(file) ? WorkspaceSettings.load(file) : null;
    } catch (IOException ignored) {
      return null;
    }
  }

  private static Action chooseCommand(InteractiveConsole console) throws IOException {
    return console.select("請選擇功能", List.of(Action.ANALYZE, Action.REPORT, Action.EXPORT, Action.EXIT),
        Action::label, 'q', "q / Esc 結束", 3);
  }

  private static ProjectCatalog.Project selectProject(InteractiveConsole console, ProjectCatalog catalog,
      List<ProjectCatalog.Project> projects, String projectName) throws IOException {
    if (projectName != null) return catalog.named(projects, projectName);
    if (projects.isEmpty()) throw new IllegalArgumentException("沒有可操作的專案。");
    List<ProjectChoice> choices = new java.util.ArrayList<>(projects.stream()
        .map(project -> new ProjectChoice(project, project.name())).toList());
    choices.add(new ProjectChoice(null, "← 返回功能選單"));
    ProjectChoice choice = console.select("請選擇專案", choices, ProjectChoice::label, 'b', "b / Esc 返回",
        choices.size() - 1);
    if (choice.project() == null) throw new InteractiveConsole.SelectionCancelledException();
    return choice.project();
  }

  private static AnalysisResult analyze(ProjectCatalog.Project project,WorkspaceSettings settings) throws IOException, InterruptedException {
    Path outputRoot = project.analysisDirectory().getParent();
    Files.createDirectories(outputRoot);
    Path safeOutput = SafeProjectFiles.requireWritePathWithin(outputRoot, project.analysisDirectory());
    Files.createDirectories(safeOutput);
    Path output = project.analysisDirectory();
    var inventory = new ProjectScanner().scan(project.sourceDirectory()).withContextPaths(settings.contextPathsFor(project.sourceDirectory()),settings.contextPathsLine());
    var graph = io.screentrace.core.GraphIntegrityValidator.requireAnalysis(analyze(inventory));
    var writer = new SingleHtmlAnalysisWriter();
    writer.prepare(graph, output);
    if (graph.application().technologies().contains("JSP") || graph.nodes().stream().anyMatch(n -> n.type() == ApplicationGraph.NodeType.SCREEN && n.attributes().getOrDefault("view", "").endsWith(".html"))) {
      renderStaticJsp(project.sourceDirectory(), output);
      packPreview(output);
    }
    var report = writer.generate(graph, output);
    if (report.warning()) LOGGER.warning("單一 HTML 超過 100 MB，仍完整產出：" + report.bytes() + " bytes");
    long screens = graph.nodes().stream().filter(node -> node.type().name().equals("SCREEN")).count();
    long endpoints = graph.nodes().stream().filter(node -> node.type().name().equals("ENDPOINT")).count();
    long components = graph.nodes().stream().filter(node -> node.type().name().equals("COMPONENT")).count();
    return new AnalysisResult(report.path(), project.name(), graph.application().technologies(), endpoints,
        screens, components, output);
  }

  private static void logAnalysis(AnalysisResult result) {
    LOGGER.info(() -> "分析完成：\n  專案：" + result.project() + "\n  技術："
        + String.join(", ", result.technologies()) + "\n  Endpoints：" + result.endpoints()
        + "\n  Screens：" + result.screens() + "\n  Components：" + result.components()
        + "\n  輸出：" + result.output());
  }

  private static ApplicationGraph analyze(ProjectScanner.ProjectInventory inventory) throws IOException {
    var unsupported = io.screentrace.adapter.struts.StrutsFrameworkDetector.unsupported(inventory);
    if (unsupported.isPresent()) throw new IOException(unsupported.get().code() + ": " + unsupported.get().message());
    boolean struts = inventory.technologies().contains("Struts 1");
    boolean springWeb = inventory.technologies().contains("Spring MVC") || inventory.technologies().contains("Spring Boot");
    if (struts && springWeb) return io.screentrace.parser.jsp.UrlGraphContribution.enrich(ApplicationGraphMerger.merge(new StrutsProjectAnalyzer().analyze(inventory), new SpringProjectAnalyzer().analyze(inventory)),inventory);
    if (struts) return new StrutsProjectAnalyzer().analyze(inventory);
    return new SpringProjectAnalyzer().analyze(inventory);
  }

  @SuppressWarnings("java:S4036")
  private static void renderStaticJsp(Path target, Path output) throws IOException, InterruptedException {
    Process process = new ProcessBuilder("node", captureTool("capture-static-jsp.mjs").toString(), target.toString(), output.toString(), "--preview-v2").inheritIO().start();
    if (!process.waitFor(120, TimeUnit.SECONDS)) {
      process.destroy();
      if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly();
      LOGGER.warning("JSP 靜態預覽逾時；未取得預覽的畫面將明確標記。");
    } else if (process.exitValue() != 0) LOGGER.warning("無法建立 JSP 靜態預覽；未取得預覽的畫面將明確標記。");
  }

  private static Path export(ProjectCatalog.Project project) throws IOException {
    Path destination = project.analysisDirectory().resolve("review-result.json");
    new ReviewResultGenerator().write(project.analysisDirectory(), destination);
    return destination;
  }

  private static void logExport(Path destination) {
    LOGGER.info(() -> "確認功能結果已匯出：\n  " + destination);
  }

  private static Path captureTool(String name) throws IOException {
    for (Path root = Path.of("").toAbsolutePath(); root != null; root = root.getParent()) {
      Path tool = root.resolve("screentrace-capture").resolve(name);
      if (Files.isRegularFile(tool)) return SafeProjectFiles.requireExistingRegularFileWithin(root, tool);
    }
    throw new IOException("找不到預覽工具：" + name);
  }

  private static void packPreview(Path output) throws IOException, InterruptedException {
    if (!Files.exists(output.resolve("static-preview/manifest.json"))) return;
    Process process = new ProcessBuilder("node", captureTool("pack-preview.mjs").toString(), output.toString()).inheritIO().start();
    if (!process.waitFor(120, TimeUnit.SECONDS)) {
      process.destroy();
      if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly();
      throw new IOException("預覽資源封裝逾時");
    }
    if (process.exitValue() != 0) throw new IOException("預覽資源封裝失敗");
  }

  private static void openReport(Path file) throws IOException {
    Path safe = SafeProjectFiles.requireExistingRegularFileWithin(file.getParent(), file);
    LOGGER.info("單一 HTML 報表：" + safe.toUri());
    try {
      if (Desktop.isDesktopSupported()) Desktop.getDesktop().browse(safe.toUri());
    } catch (IOException ignored) {
      LOGGER.info("瀏覽器無法自動開啟，請直接開啟上述 HTML 檔案。");
    }
  }

  private record Command(Action action, String projectName) {
    static Command parse(String[] arguments) {
      if (arguments.length == 0) return new Command(Action.INTERACTIVE, null);
      if (arguments.length > 2) throw usage();
      for (String argument : arguments) {
        if (argument.startsWith("--")) throw usage();
      }
      for (Action candidate : Action.values()) {
        if (candidate.command() != null && candidate.command().equals(arguments[0])) {
          if (candidate == Action.CONFIG && arguments.length > 1) throw usage();
          return new Command(candidate, arguments.length == 2 ? arguments[1] : null);
        }
      }
      throw usage();
    }

    private static IllegalArgumentException usage() {
      return new IllegalArgumentException("Usage: screentrace [analyze|report|export] [project-name] | screentrace config");
    }
  }

  private record ProjectChoice(ProjectCatalog.Project project, String label) { }

  private record AnalysisResult(Path report, String project, List<String> technologies, long endpoints, long screens,
      long components, Path output) { }

  private enum Action {
    INTERACTIVE(null, null), ANALYZE("analyze", "分析專案"), REPORT("report", "開啟報表"),
    EXPORT("export", "匯出確認結果"), EXIT(null, "結束 ScreenTrace"), CONFIG("config", "設定");

    private final String command;
    private final String label;

    Action(String command, String label) {
      this.command = command;
      this.label = label;
    }

    String command() { return command; }
    String label() { return label; }
  }
}
