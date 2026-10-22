package io.screentrace.cli;

import io.screentrace.adapter.spring.SpringProjectAnalyzer;
import io.screentrace.adapter.struts.StrutsProjectAnalyzer;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraphMerger;
import io.screentrace.report.SingleHtmlAnalysisWriter;
import io.screentrace.report.PreviewResourceBoundaryException;
import io.screentrace.scanner.ProjectScanner;
import io.screentrace.scanner.SafeProjectFiles;
import java.awt.Desktop;
import java.awt.GraphicsEnvironment;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;

/** Interactive entry point plus scriptable analyze, report, and config commands. */
public final class ScreenTraceCli {
  private static final Logger LOGGER = Logger.getLogger(ScreenTraceCli.class.getName());

  public static void main(String[] args) throws IOException, InterruptedException {
    int status;
    try { status=run(args); }
    catch (PreviewResourceBoundaryException rejected) {
      status=reportRejectedPreviewResource(rejected,System.err);
    }
    if(status!=0)System.exit(status);
  }

  static int reportRejectedPreviewResource(PreviewResourceBoundaryException rejected, java.io.PrintStream error) {
    error.println(rejected.getMessage());
    return 2;
  }

  /** Opens a finished report; tests replace it to observe which entry points open one. */
  interface ReportOpener { void open(Path report) throws IOException; }

  static ReportOpener reportOpener = ScreenTraceCli::openReport;

  /** Asks whether to open a freshly analyzed report. */
  interface ReportPrompt { boolean confirmOpen(String url) throws IOException; }

  static int run(String[] args) throws IOException, InterruptedException {
    if(args.length>0&&args[0].equals("library")){System.out.println(LibraryCommands.run(args,WorkspaceSettings.defaultFile().getParent()));return 0;}
    Command command = Command.parse(args);
    if(command.action()==Action.PATH)return analyzePath(command.projectName(),true);
    // `analyze <path>` analyzes that folder like `screentrace <path>`, but only prints the report path.
    if(command.action()==Action.ANALYZE&&command.projectName()!=null&&looksLikePath(command.projectName()))return analyzePath(command.projectName(),false);
    if(command.action()==Action.INTERACTIVE||command.action()==Action.CONFIG){
      if(!interactiveTerminalAvailable())return command.action()==Action.CONFIG?failConfigWithoutTerminal():failForMissingTerminal();
      try(InteractiveConsole console=new InteractiveConsole()){
        if(command.action()==Action.CONFIG)settingsMenu(console);
        else runInteractive(console,new ProjectCatalog());
      }
      return 0;
    }
    boolean configured=hasConfiguredWorkspace();
    boolean needsPrompt=!configured||command.projectName()==null;
    if(needsPrompt&&!interactiveTerminalAvailable()){
      if(!configured)return failForMissingTerminal();
      System.err.println("此指令需要選擇專案；請在終端機執行，或指定專案名稱。");
      return 2;
    }
    if(needsPrompt){
      try(InteractiveConsole console=new InteractiveConsole()){
        return runCommand(console,loadOrConfigure(console),command);
      }
    }else return runCommand(null,WorkspaceSettings.load(WorkspaceSettings.defaultFile()),command);
  }

  private static int failForMissingTerminal(){
    System.err.println("尚未設定專案根目錄。可直接執行 `./bin/screentrace <專案路徑>` 分析單一專案，或在終端機執行 `./bin/screentrace config` 設定專案根目錄");
    return 2;
  }

  /** `screentrace <project path>`: analyze one folder directly, without requiring a configured project root. */
  /** A project argument with a separator, or starting with ~ or ., names a folder rather than a project in the workspace. */
  static boolean looksLikePath(String argument){
    return argument.contains("/")||argument.contains("\\")||argument.startsWith("~")||argument.startsWith(".");
  }

  private static int analyzePath(String argument,boolean openReport) throws IOException, InterruptedException {
    Path source=projectPath(argument);
    if(!Files.isDirectory(source)){
      System.err.println("找不到專案資料夾："+argument);
      return 2;
    }
    WorkspaceSettings settings=settingsFor(source);
    AnalysisResult result=analyze(projectAt(source,settings),settings);
    logAnalysis(result);
    if(openReport)reportOpener.open(result.report());else printReportPath(result.report());
    return 0;
  }

  static Path projectPath(String argument){
    String expanded=argument.equals("~")||argument.startsWith("~/")?System.getProperty("user.home")+argument.substring(1):argument;
    return Path.of(expanded).toAbsolutePath().normalize();
  }

  private static ProjectCatalog.Project projectAt(Path source,WorkspaceSettings settings){
    String name=source.getFileName()==null?"project":source.getFileName().toString();
    return new ProjectCatalog.Project(name,source,settings.outputRoot().resolve(name));
  }

  /** The configured workspace when there is one; otherwise results go to `<ScreenTrace>/analyze/`. */
  private static WorkspaceSettings settingsFor(Path source){
    WorkspaceSettings configured=existingSettings();
    if(configured!=null&&Files.isDirectory(configured.projectRoot()))return configured;
    return new WorkspaceSettings(source.getParent()==null?source:source.getParent(),defaultOutputRoot(),java.util.Map.of());
  }

  /** The launcher's ScreenTrace home, then the checkout that contains the running classes. */
  private static List<Path> toolRoots() {
    List<Path> roots = new java.util.ArrayList<>(List.of(screenTraceHome()));
    try {
      for (Path root = Path.of(ScreenTraceCli.class.getProtectionDomain().getCodeSource().getLocation().toURI()); root != null; root = root.getParent())
        if (Files.isDirectory(root.resolve("screentrace-capture"), java.nio.file.LinkOption.NOFOLLOW_LINKS)) { roots.add(root); break; }
    } catch (java.net.URISyntaxException | SecurityException | NullPointerException ignored) { /* fall back to the working directory */ }
    return roots;
  }

  static Path defaultOutputRoot(){return screenTraceHome().resolve("analyze");}

  /** Set by the launcher; falls back to the nearest ancestor that contains the ScreenTrace sources. */
  static Path screenTraceHome(){
    String configured=System.getProperty("screentrace.home");
    if(configured!=null&&Files.isDirectory(Path.of(configured)))return Path.of(configured).toAbsolutePath().normalize();
    for(Path root=Path.of("").toAbsolutePath();root!=null;root=root.getParent())
      if(Files.isDirectory(root.resolve("screentrace-capture"))&&Files.isRegularFile(root.resolve("pom.xml")))return root;
    return Path.of("").toAbsolutePath();
  }

  private static int failConfigWithoutTerminal(){
    System.err.println("config 需要互動式終端機");
    return 2;
  }

  private static boolean hasConfiguredWorkspace(){
    try{Path file=WorkspaceSettings.defaultFile();return Files.isRegularFile(file)&&Files.isDirectory(WorkspaceSettings.load(file).projectRoot());}
    catch(IOException|RuntimeException ignored){return false;}
  }

  private static boolean interactiveTerminalAvailable() throws IOException {
    if(System.console()==null)return false;
    try(Terminal terminal=TerminalBuilder.builder().system(true).build()){
      return !Terminal.TYPE_DUMB.equals(terminal.getType())&&!Terminal.TYPE_DUMB_COLOR.equals(terminal.getType());
    }
  }

  private static int runCommand(InteractiveConsole console,WorkspaceSettings settings,Command command) throws IOException,InterruptedException {
    ProjectCatalog catalog=new ProjectCatalog();
    List<ProjectCatalog.Project> projects=command.action()==Action.ANALYZE?catalog.allProjects(settings):catalog.analyzedProjects(settings);
    ProjectCatalog.Project project;
    try{project=selectProject(console,catalog,projects,command.projectName());}
    catch(InteractiveConsole.SelectionCancelledException ignored){return 0;}
    // An unknown project name is the user's to fix; print why instead of a stack trace.
    catch(IllegalArgumentException unknown){System.err.println(unknown.getMessage());return 2;}
    if(command.action()==Action.ANALYZE){AnalysisResult result=analyze(project,settings);logAnalysis(result);printReportPath(result.report());}
    else if(command.action()==Action.REPORT)reportOpener.open(new SingleHtmlAnalysisWriter().generate(project.analysisDirectory(),new LibraryStore(WorkspaceSettings.defaultFile().getParent()).selected(project.name())).path());

    return 0;
  }

  private static void runInteractive(InteractiveConsole console, ProjectCatalog catalog)
      throws IOException, InterruptedException {
    while (true) {
      WorkspaceSettings configured = existingSettings();
      boolean hasRoot = configured != null && Files.isDirectory(configured.projectRoot());
      WorkspaceSettings settings = hasRoot ? configured
          : new WorkspaceSettings(Path.of("").toAbsolutePath(), defaultOutputRoot(), java.util.Map.of());
      Action action;
      try {
        action = chooseCommand(console, hasRoot, !catalog.analyzedProjects(settings).isEmpty());
      } catch (InteractiveConsole.SelectionCancelledException ignored) {
        return;
      }
      if (action == Action.EXIT) return;
      if (action == Action.CONFIG) { settingsMenu(console); continue; }
      ProjectCatalog.Project project;
      try {
        project = action == Action.ANALYZE
            ? selectAnalysisTarget(console, hasRoot ? catalog.allProjects(settings) : List.of())
            : selectProject(console, catalog, catalog.analyzedProjects(settings), null);
      } catch (InteractiveConsole.SelectionCancelledException ignored) {
        continue;
      }
      if (action == Action.REPORT) {
        Path report = new SingleHtmlAnalysisWriter().generate(project.analysisDirectory(),new LibraryStore(WorkspaceSettings.defaultFile().getParent()).selected(project.name())).path();
        reportOpener.open(report);
        console.waitForMenuReturn(report.toUri().toString());
      } else {
        AnalysisResult result = analyze(project, hasRoot ? settings : settingsFor(project.sourceDirectory()));
        console.showAnalysisComplete(result.project(), result.technologies(), result.endpoints(), result.screens(),
            result.components(), result.output(), result.contextPathHintCount());
        offerReport(console::confirmOpenReport, result.report());
      }
    }
  }

  /** After an interactive analysis: open the report only when asked; either way the menu comes back. */
  static void offerReport(ReportPrompt prompt, Path report) throws IOException {
    if (prompt.confirmOpen(report.toUri().toString())) reportOpener.open(report);
  }

  private static void settingsMenu(InteractiveConsole console) throws IOException {
    List<String> items = List.of("專案根目錄", "預設瀏覽器（目前：" + browserLabel(WorkspaceSettings.browser(WorkspaceSettings.defaultFile())) + "）", "← 返回功能選單");
    String choice;
    try {
      choice = console.select("設定", items, item -> item, 'b', "b / Esc 返回", items.size() - 1);
    } catch (InteractiveConsole.SelectionCancelledException ignored) {
      return;
    }
    if (choice.equals(items.get(0))) configure(console);
    else if (choice.equals(items.get(1))) configureBrowser(console, ReportBrowser.forCurrentOs());
  }

  /** Lists only the browsers found on this computer, plus the system default. */
  private static void configureBrowser(InteractiveConsole console, ReportBrowser.Detector detector) throws IOException {
    List<BrowserOption> options = browserOptions(ReportBrowser.installed(detector));
    BrowserOption choice;
    try {
      choice = console.select("預設瀏覽器", options, BrowserOption::label, 'b', "b / Esc 返回", options.size() - 1);
    } catch (InteractiveConsole.SelectionCancelledException ignored) {
      return;
    }
    if (choice.id() == null) return;
    WorkspaceSettings.saveBrowser(WorkspaceSettings.defaultFile(), choice.id());
    LOGGER.info(() -> "預設瀏覽器已設定為：" + browserLabel(choice.id()));
  }

  static List<BrowserOption> browserOptions(List<ReportBrowser.Choice> installed) {
    List<BrowserOption> options = new java.util.ArrayList<>();
    for (ReportBrowser.Choice browser : installed)
      options.add(new BrowserOption(browser.kind().id(), browser.label() + (browser.kind().autosave() ? "" : "（不支援自動存檔）")));
    options.add(new BrowserOption(ReportBrowser.SYSTEM, "系統預設"));
    options.add(new BrowserOption(null, "← 返回設定"));
    return options;
  }

  static String browserLabel(String preference) {
    if (preference == null) return "自動（Chrome → Edge → 系統預設）";
    if (ReportBrowser.SYSTEM.equals(preference)) return "系統預設";
    return ReportBrowser.Kind.byId(preference).map(ReportBrowser.Kind::label).orElse(preference);
  }

  private static WorkspaceSettings loadOrConfigure(InteractiveConsole console) throws IOException {
    Path settingsFile = WorkspaceSettings.defaultFile();
    WorkspaceSettings settings = Files.isRegularFile(settingsFile) ? existingSettings() : null;
    return settings != null && Files.isDirectory(settings.projectRoot()) ? settings : configure(console);
  }

  private static WorkspaceSettings configure(InteractiveConsole console) throws IOException {
    WorkspaceSettings current = existingSettings();
    Path projectDefault = current == null ? Path.of(".").toAbsolutePath().normalize() : current.projectRoot();
    Path projectRoot = console.existingDirectory("所有專案的根目錄", projectDefault);
    Path outputDefault = current == null ? projectRoot.resolve("analyze") : current.outputRoot();
    Path outputRoot = console.outputDirectory("分析結果根目錄", outputDefault);
    WorkspaceSettings.CanonicalPaths canonical=WorkspaceSettings.canonicalPaths(projectRoot,outputRoot);
    if(canonical.correctionMessage()!=null)LOGGER.info(canonical.correctionMessage());
    WorkspaceSettings settings = new WorkspaceSettings(canonical.projectRoot(), canonical.outputRoot(),current==null?java.util.Map.of():current.contextPaths());
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

  /** Without a configured project root the first item asks for a folder path; the settings item is always offered. */
  static List<Action> menu(boolean hasRoot, boolean hasReports) {
    List<Action> actions = new java.util.ArrayList<>();
    actions.add(Action.ANALYZE);
    if (hasReports) actions.add(Action.REPORT);
    actions.add(Action.CONFIG);
    actions.add(Action.EXIT);
    return actions;
  }

  private static Action chooseCommand(InteractiveConsole console, boolean hasRoot, boolean hasReports) throws IOException {
    List<Action> actions = menu(hasRoot, hasReports);
    return console.select("請選擇功能", actions, Action::label, 'q', "q / Esc 結束", actions.size() - 1);
  }

  /**
   * One entry for analysing: the project root's folders plus "another path", or straight to the path prompt when
   * there is nothing to list (no project root yet, or an empty one).
   */
  static ProjectCatalog.Project selectAnalysisTarget(InteractiveConsole console,
      List<ProjectCatalog.Project> projects) throws IOException {
    if (!projects.isEmpty()) {
      List<ProjectChoice> choices = new java.util.ArrayList<>(projects.stream()
          .map(project -> new ProjectChoice(project, project.name())).toList());
      ProjectChoice otherPath = new ProjectChoice(null, "輸入其他路徑…"), back = new ProjectChoice(null, "← 返回功能選單");
      choices.add(otherPath);
      choices.add(back);
      ProjectChoice choice = console.select("請選擇專案", choices, ProjectChoice::label, 'b', "b / Esc 返回",
          choices.size() - 1);
      if (choice == back) throw new InteractiveConsole.SelectionCancelledException();
      if (choice != otherPath) return choice.project();
    }
    Path source = console.existingDirectory("專案資料夾路徑", Path.of("").toAbsolutePath());
    return projectAt(source, settingsFor(source));
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
    boolean reactScreens = graph.nodes().stream().anyMatch(n -> n.type() == ApplicationGraph.NodeType.SCREEN && "static-reconstruction".equals(n.attributes().get("rendering")));
    if (reactScreens) io.screentrace.parser.jsp.ReactGraphContribution.writePreview(inventory, output);
    if (reactScreens || graph.application().technologies().contains("JSP") || graph.nodes().stream().anyMatch(n -> n.type() == ApplicationGraph.NodeType.SCREEN && n.attributes().getOrDefault("view", "").endsWith(".html"))) {
      renderStaticJsp(project.sourceDirectory(), output);
      packPreview(output);
    }
    var report = writer.generate(graph, output,new LibraryStore(WorkspaceSettings.defaultFile().getParent()).selected(project.name()));
    if (report.warning()) LOGGER.warning("單一 HTML 超過 100 MB，仍完整產出：" + report.bytes() + " bytes");
    long screens = graph.nodes().stream().filter(node -> node.type().name().equals("SCREEN")).count();
    long endpoints = graph.nodes().stream().filter(node -> node.type().name().equals("ENDPOINT")).count();
    long components = graph.nodes().stream().filter(node -> node.type().name().equals("COMPONENT")).count();
    long contextPathHintCount=graph.diagnostics().stream().filter(d->"CONTEXT_PATH_HINT".equals(d.code())).mapToLong(d->d.evidence().size()).sum();
    return new AnalysisResult(report.path(), project.name(), graph.application().technologies(), endpoints,
        screens, components, output,contextPathHintCount);
  }

  static String contextPathHintSummary(long count) {
    return count>0?"提示："+count+" 個網址可能缺少 context path，請使用 ./bin/screentrace config 設定後重新分析":null;
  }

  private static void logAnalysis(AnalysisResult result) {
    LOGGER.info(() -> "分析完成：\n  專案：" + result.project() + "\n  技術："
        + String.join(", ", result.technologies()) + "\n  Endpoints：" + result.endpoints()
        + "\n  Screens：" + result.screens() + "\n  Components：" + result.components()
        + "\n  輸出：" + result.output()
        + (contextPathHintSummary(result.contextPathHintCount())==null?"":"\n  "+contextPathHintSummary(result.contextPathHintCount())));
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

  private static Path captureTool(String name) throws IOException {
    for (Path root : toolRoots()) {
      Path tool = root.resolve("screentrace-capture").resolve(name);
      if (Files.isRegularFile(tool, java.nio.file.LinkOption.NOFOLLOW_LINKS)) return SafeProjectFiles.requireExistingRegularFileWithin(root, tool);
    }
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

  private static Path printReportPath(Path file) throws IOException {
    Path safe = SafeProjectFiles.requireExistingRegularFileWithin(file.getParent(), file);
    LOGGER.info("單一 HTML 報表：" + safe.toUri());
    return safe;
  }

  /** The configured browser, else Chrome, Edge, then the system default; headless runs only print the path. */
  private static void openReport(Path file) throws IOException {
    Path safe = printReportPath(file);
    if (GraphicsEnvironment.isHeadless()) return;
    ReportBrowser.open(safe, WorkspaceSettings.browser(WorkspaceSettings.defaultFile()), ReportBrowser.forCurrentOs(),
        ReportBrowser::startProcess, ScreenTraceCli::browseWithSystemDefault, ReportBrowser.isMac(), LOGGER::info);
  }

  private static boolean browseWithSystemDefault(java.net.URI uri) throws IOException {
    if (!Desktop.isDesktopSupported() || !Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) return false;
    Desktop.getDesktop().browse(uri);
    return true;
  }

  private static final java.util.Set<String> RETIRED_COMMANDS = java.util.Set.of("capture", "open", "serve", "export");

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
      if (arguments.length == 1 && !RETIRED_COMMANDS.contains(arguments[0])) return new Command(Action.PATH, arguments[0]);
      throw usage();
    }

    private static IllegalArgumentException usage() {
      return new IllegalArgumentException("Usage: screentrace <project-path> | screentrace [analyze|report] [project-name] | screentrace config");
    }
  }

  private record ProjectChoice(ProjectCatalog.Project project, String label) { }

  record BrowserOption(String id, String label) { }

  private record AnalysisResult(Path report, String project, List<String> technologies, long endpoints, long screens,
      long components, Path output,long contextPathHintCount) { }

  enum Action {
    INTERACTIVE(null, null), ANALYZE("analyze", "分析專案"), PATH(null, null), REPORT("report", "開啟報表"),
    EXIT(null, "結束 ScreenTrace"), CONFIG("config", "設定");

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
