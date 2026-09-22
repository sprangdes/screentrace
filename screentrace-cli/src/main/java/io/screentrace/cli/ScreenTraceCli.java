package io.screentrace.cli;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.screentrace.adapter.spring.SpringProjectAnalyzer;
import io.screentrace.adapter.struts.StrutsProjectAnalyzer;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraphMerger;
import io.screentrace.report.ReportGenerator;
import io.screentrace.report.ReviewResultGenerator;
import io.screentrace.scanner.ProjectScanner;
import java.awt.Desktop;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

/** Interactive entry point plus scriptable analyze, report, export, and config commands. */
public final class ScreenTraceCli {
  static final int MAX_OVERLAY_BYTES = 1_048_576;
  static final InetAddress REPORT_ADDRESS = InetAddress.getLoopbackAddress();
  private static final String INDEX_FILE = "index.html";
  private static final String JSON_CONTENT_TYPE = "application/json";
  private static final String HTML_CONTENT_TYPE = "text/html; charset=utf-8";
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
        AnalysisResult result = analyze(project);
        logAnalysis(result);
        serve(result.report());
      }
      else if (command.action() == Action.REPORT) serve(project.analysisDirectory().resolve("report"));
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
        AnalysisResult result = analyze(project);
        console.showAnalysisComplete(result.project(), result.technologies(), result.endpoints(), result.screens(),
            result.components(), result.output());
        report = result.report();
      } else {
        report = project.analysisDirectory().resolve("report");
      }
      try (RunningReport running = startReport(report)) {
        console.waitForReportClose(running.url());
      }
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
    WorkspaceSettings settings = new WorkspaceSettings(projectRoot, outputRoot);
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

  private static AnalysisResult analyze(ProjectCatalog.Project project) throws IOException, InterruptedException {
    Path output = project.analysisDirectory();
    var inventory = new ProjectScanner().scan(project.sourceDirectory());
    var graph = analyze(inventory);
    new ReportGenerator().write(graph, output);
    if (graph.application().technologies().contains("JSP")) {
      renderStaticJsp(project.sourceDirectory(), output);
      new ReportGenerator().write(graph, output);
    }
    long screens = graph.nodes().stream().filter(node -> node.type().name().equals("SCREEN")).count();
    long endpoints = graph.nodes().stream().filter(node -> node.type().name().equals("ENDPOINT")).count();
    long components = graph.nodes().stream().filter(node -> node.type().name().equals("COMPONENT")).count();
    return new AnalysisResult(output.resolve("report"), project.name(), graph.application().technologies(), endpoints,
        screens, components, output);
  }

  private static void logAnalysis(AnalysisResult result) {
    LOGGER.info(() -> "分析完成：\n  專案：" + result.project() + "\n  技術："
        + String.join(", ", result.technologies()) + "\n  Endpoints：" + result.endpoints()
        + "\n  Screens：" + result.screens() + "\n  Components：" + result.components()
        + "\n  輸出：" + result.output());
  }

  private static ApplicationGraph analyze(ProjectScanner.ProjectInventory inventory) throws IOException {
    boolean struts = inventory.technologies().contains("Struts 1");
    boolean springWeb = inventory.technologies().contains("Spring MVC") || inventory.technologies().contains("Spring Boot");
    if (struts && springWeb) return ApplicationGraphMerger.merge(new StrutsProjectAnalyzer().analyze(inventory), new SpringProjectAnalyzer().analyze(inventory));
    if (struts) return new StrutsProjectAnalyzer().analyze(inventory);
    return new SpringProjectAnalyzer().analyze(inventory);
  }

  @SuppressWarnings("java:S4036")
  private static void renderStaticJsp(Path target, Path output) throws IOException, InterruptedException {
    Process process = new ProcessBuilder("node", Path.of("screentrace-capture/capture-static-jsp.mjs").toAbsolutePath().toString(), target.toString(), output.toString()).inheritIO().start();
    if (process.waitFor() != 0) LOGGER.warning("無法建立 JSP 靜態預覽；報表會改用原始碼預覽。");
  }

  private static Path export(ProjectCatalog.Project project) throws IOException {
    Path destination = project.analysisDirectory().resolve("review-result.json");
    new ReviewResultGenerator().write(project.analysisDirectory(), destination);
    return destination;
  }

  private static void logExport(Path destination) {
    LOGGER.info(() -> "確認功能結果已匯出：\n  " + destination);
  }

  private static void serve(Path report) throws IOException {
    RunningReport running = startReport(report);
    LOGGER.info("ScreenTrace report running at:\n\n" + running.url());
  }

  private static RunningReport startReport(Path report) throws IOException {
    if (!Files.isDirectory(report)) throw new IllegalArgumentException("找不到報表：" + report);
    HttpServer server = HttpServer.create(new InetSocketAddress(REPORT_ADDRESS, 0), 0);
    int port = server.getAddress().getPort();
    Path analysis = report.getParent();
    Path overlay = analysis.resolve("edit-overlay.json");
    String sessionToken = UUID.randomUUID().toString();
    server.createContext("/edit-overlay.json", exchange -> handleOverlay(exchange, overlay, sessionToken));
    server.createContext("/review-result.json", exchange -> handleReviewResult(exchange, analysis, overlay, sessionToken));
    server.createContext("/", exchange -> serveStatic(exchange, report, analysis, sessionToken));
    server.start();
    String url = "http://localhost:" + port;
    openReport(url);
    return new RunningReport(server, url);
  }

  private record RunningReport(HttpServer server, String url) implements AutoCloseable {
    @Override public void close() { server.stop(0); }
  }

  private static void handleOverlay(HttpExchange exchange, Path overlay, String sessionToken) throws IOException {
    if (exchange.getRequestMethod().equals("PUT")) {
      if (!authorizedMutation(exchange, sessionToken) || !writeOverlay(exchange, overlay)) return;
      exchange.sendResponseHeaders(204, -1);
      exchange.close();
      return;
    }
    if (!exchange.getRequestMethod().equals("GET") || Files.isSymbolicLink(overlay)) {
      exchange.sendResponseHeaders(exchange.getRequestMethod().equals("GET") ? 404 : 405, -1);
      exchange.close();
      return;
    }
    sendFile(exchange, overlay, JSON_CONTENT_TYPE);
  }

  private static void handleReviewResult(HttpExchange exchange, Path analysis, Path overlay, String sessionToken) throws IOException {
    if (!exchange.getRequestMethod().equals("POST")) {
      exchange.sendResponseHeaders(405, -1);
      exchange.close();
      return;
    }
    if (!authorizedMutation(exchange, sessionToken) || !writeOverlay(exchange, overlay)) return;
    Path result = new ReviewResultGenerator().write(analysis, analysis.resolve("review-result.json"));
    exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=review-result.json");
    sendFile(exchange, result, JSON_CONTENT_TYPE);
  }

  private static boolean writeOverlay(HttpExchange exchange, Path overlay) throws IOException {
    try {
      if (Files.isSymbolicLink(overlay)) {
        exchange.sendResponseHeaders(404, -1);
        exchange.close();
        return false;
      }
      Files.write(overlay, readLimited(exchange.getRequestBody()));
      return true;
    } catch (RequestTooLargeException ignored) {
      exchange.sendResponseHeaders(413, -1);
      exchange.close();
      return false;
    }
  }

  private static boolean authorizedMutation(HttpExchange exchange, String sessionToken) throws IOException {
    if (hasMutationToken(exchange.getRequestHeaders().getFirst("X-ScreenTrace-Token"), sessionToken)) return true;
    exchange.sendResponseHeaders(403, -1);
    exchange.close();
    return false;
  }

  static boolean hasMutationToken(String suppliedToken, String sessionToken) { return sessionToken.equals(suppliedToken); }

  private static void serveStatic(HttpExchange exchange, Path report, Path analysis, String sessionToken) throws IOException {
    Path requested = staticFile(exchange.getRequestURI().getPath(), report, analysis);
    if (requested == null || !Files.isRegularFile(requested)) {
      exchange.sendResponseHeaders(404, -1);
      exchange.close();
      return;
    }
    if (requested.equals(report.resolve(INDEX_FILE))) {
      byte[] body = Files.readString(requested).replace("__SCREEN_TRACE_SESSION_TOKEN__", sessionToken).getBytes();
      exchange.getResponseHeaders().set("Content-Type", HTML_CONTENT_TYPE);
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
      return;
    }
    sendFile(exchange, requested, contentType(requested));
  }

  static Path staticFile(String uri, Path report, Path analysis) {
    if (uri.equals("/")) return report.resolve(INDEX_FILE);
    if (uri.equals("/application-graph.json") || uri.equals("/prototype-model.json") || uri.equals("/preview-model.json")) return resolveWithin(analysis, uri.substring(1));
    if (uri.startsWith("/static-preview/")) return resolveWithin(analysis.resolve("static-preview"), uri.substring("/static-preview/".length()));
    if (uri.startsWith("/screenshots/")) return resolveWithin(analysis.resolve("screenshots"), uri.substring("/screenshots/".length()));
    return resolveWithin(report, uri.substring(1));
  }

  static Path resolveWithin(Path root, String relativePath) {
    Path normalizedRoot = root.toAbsolutePath().normalize();
    Path resolved = normalizedRoot.resolve(relativePath).normalize();
    if (!resolved.startsWith(normalizedRoot)) return null;
    try {
      if (!Files.exists(resolved)) return resolved;
      Path realRoot = normalizedRoot.toRealPath();
      Path realResolved = resolved.toRealPath();
      return realResolved.startsWith(realRoot) ? resolved : null;
    } catch (IOException | SecurityException ignored) {
      return null;
    }
  }

  static byte[] readLimited(InputStream input) throws IOException {
    try (input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      long total = 0;
      int read;
      while ((read = input.read(buffer)) != -1) {
        total += read;
        if (total > MAX_OVERLAY_BYTES) throw new RequestTooLargeException();
        output.write(buffer, 0, read);
      }
      return output.toByteArray();
    }
  }

  private static void sendFile(HttpExchange exchange, Path file, String contentType) throws IOException {
    byte[] body = Files.readAllBytes(file);
    exchange.getResponseHeaders().set("Content-Type", contentType);
    exchange.sendResponseHeaders(200, body.length);
    exchange.getResponseBody().write(body);
    exchange.close();
  }

  private static String contentType(Path file) {
    String value = file.toString();
    if (value.endsWith(".json")) return JSON_CONTENT_TYPE;
    if (value.endsWith(".css")) return "text/css; charset=utf-8";
    if (value.endsWith(".js")) return "text/javascript; charset=utf-8";
    if (value.endsWith(".svg")) return "image/svg+xml";
    if (value.endsWith(".png")) return "image/png";
    if (value.endsWith(".jpg") || value.endsWith(".jpeg")) return "image/jpeg";
    if (value.endsWith(".gif")) return "image/gif";
    if (value.endsWith(".webp")) return "image/webp";
    if (value.endsWith(".woff")) return "font/woff";
    if (value.endsWith(".woff2")) return "font/woff2";
    if (value.endsWith(".ttf")) return "font/ttf";
    return HTML_CONTENT_TYPE;
  }

  private static void openReport(String url) {
    try {
      if (Desktop.isDesktopSupported()) Desktop.getDesktop().browse(URI.create(url));
    } catch (IOException ignored) {
      // Opening a browser is best effort and must not prevent report serving.
    }
  }

  static final class RequestTooLargeException extends IOException { }

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
