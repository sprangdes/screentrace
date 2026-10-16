package io.screentrace.cli;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Function;

/** Picks and launches the browser for the single-HTML report; only Chrome and Edge support the report's autosave. */
final class ReportBrowser {
  /** Stored preference meaning "let the operating system decide". */
  static final String SYSTEM = "system";

  private ReportBrowser() { }

  enum Kind {
    CHROME("chrome", "Google Chrome", "Google Chrome", "chrome.exe", "Google/Chrome/Application/chrome.exe", true),
    EDGE("edge", "Microsoft Edge", "Microsoft Edge", "msedge.exe", "Microsoft/Edge/Application/msedge.exe", true),
    FIREFOX("firefox", "Firefox", "Firefox", "firefox.exe", "Mozilla Firefox/firefox.exe", false),
    SAFARI("safari", "Safari", "Safari", null, null, false);

    private final String id;
    private final String label;
    private final String macApp;
    private final String windowsExecutable;
    private final String windowsInstallPath;
    private final boolean autosave;

    Kind(String id, String label, String macApp, String windowsExecutable, String windowsInstallPath, boolean autosave) {
      this.id = id;
      this.label = label;
      this.macApp = macApp;
      this.windowsExecutable = windowsExecutable;
      this.windowsInstallPath = windowsInstallPath;
      this.autosave = autosave;
    }

    String id() { return id; }
    String label() { return label; }
    boolean autosave() { return autosave; }

    static Optional<Kind> byId(String id) {
      for (Kind kind : values()) if (kind.id.equals(id)) return Optional.of(kind);
      return Optional.empty();
    }
  }

  /** Finds an installed browser: a macOS .app bundle or a Windows executable. */
  interface Detector { Optional<Path> locate(Kind kind); }

  /** Starts a browser command; false means it could not open the report. */
  interface Launcher { boolean launch(List<String> command) throws IOException; }

  /** The operating system's default browser; false means the platform cannot browse. */
  interface SystemBrowser { boolean browse(URI uri) throws IOException; }

  /** A detected browser, or the system default when {@code kind} is null. */
  record Choice(Kind kind, Path location) {
    static final Choice SYSTEM_DEFAULT = new Choice(null, null);
    boolean systemDefault() { return kind == null; }
    String label() { return kind == null ? "系統預設" : kind.label(); }
  }

  /** The browsers this computer has, in preference order. */
  static List<Choice> installed(Detector detector) {
    List<Choice> found = new java.util.ArrayList<>();
    for (Kind kind : Kind.values()) detector.locate(kind).ifPresent(location -> found.add(new Choice(kind, location)));
    return found;
  }

  /** The configured browser when it is installed; otherwise Chrome, then Edge, then the system default. */
  static Choice choose(String preference, Detector detector) {
    if (SYSTEM.equals(preference)) return Choice.SYSTEM_DEFAULT;
    Optional<Kind> preferred = preference == null ? Optional.empty() : Kind.byId(preference);
    if (preferred.isPresent()) {
      Optional<Path> location = detector.locate(preferred.get());
      if (location.isPresent()) return new Choice(preferred.get(), location.get());
    }
    for (Kind kind : List.of(Kind.CHROME, Kind.EDGE)) {
      Optional<Path> location = detector.locate(kind);
      if (location.isPresent()) return new Choice(kind, location.get());
    }
    return Choice.SYSTEM_DEFAULT;
  }

  /** An argument array, never a shell string: `open -a <App> <file>` on macOS, `<browser.exe> <file>` elsewhere. */
  static List<String> command(Choice choice, Path file, boolean mac) {
    if (mac) return List.of("open", "-a", choice.location().toString(), file.toString());
    return List.of(choice.location().toString(), file.toString());
  }

  /** Opens with the chosen browser, falls back to the system default, and finally leaves the printed path to the user. */
  static void open(Path file, String preference, Detector detector, Launcher launcher, SystemBrowser system, boolean mac,
      Consumer<String> log) {
    Choice choice = choose(preference, detector);
    if (!choice.systemDefault()) {
      try {
        if (launcher.launch(command(choice, file, mac))) {
          if (!choice.kind().autosave()) log.accept("這個瀏覽器（" + choice.label() + "）不支援自動存檔，請用『下載 md』保存。");
          return;
        }
      } catch (IOException ignored) {
        // Fall through to the system default below.
      }
      log.accept("無法用 " + choice.label() + " 開啟報表，改用系統預設瀏覽器。");
    }
    try {
      if (system.browse(file.toUri())) {
        log.accept("已用系統預設瀏覽器開啟；若它不是 Chrome／Edge，這個瀏覽器不支援自動存檔，請用『下載 md』保存。");
        return;
      }
    } catch (IOException ignored) {
      // Report the manual fallback below.
    }
    log.accept("瀏覽器無法自動開啟，請直接開啟上述 HTML 檔案。");
  }

  static boolean isMac() { return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("mac"); }

  private static boolean isWindows() { return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("windows"); }

  static Detector forCurrentOs() {
    if (isMac()) return macDetector(List.of(Path.of("/Applications"), Path.of(System.getProperty("user.home"), "Applications")));
    if (isWindows()) return windowsDetector(ReportBrowser::registeredAppPath, windowsInstallRoots(System.getenv()));
    return kind -> Optional.empty();
  }

  /** macOS: `<App>.app` in /Applications or ~/Applications. */
  static Detector macDetector(List<Path> applicationDirectories) {
    return kind -> applicationDirectories.stream().map(directory -> directory.resolve(kind.macApp + ".app"))
        .filter(Files::isDirectory).findFirst();
  }

  /** Windows: the App Paths registration first, then the usual install folders. */
  static Detector windowsDetector(Function<String, Optional<Path>> appPaths, List<Path> installRoots) {
    return kind -> {
      if (kind.windowsExecutable == null) return Optional.empty();
      Optional<Path> registered = appPaths.apply(kind.windowsExecutable).filter(Files::isRegularFile);
      if (registered.isPresent()) return registered;
      return installRoots.stream().map(root -> root.resolve(kind.windowsInstallPath)).filter(Files::isRegularFile).findFirst();
    };
  }

  static List<Path> windowsInstallRoots(Map<String, String> environment) {
    List<Path> roots = new java.util.ArrayList<>();
    for (String variable : List.of("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA")) {
      String value = environment.get(variable);
      if (value != null && !value.isBlank()) roots.add(Path.of(value));
    }
    return roots;
  }

  private static Optional<Path> registeredAppPath(String executable) {
    for (String hive : List.of("HKCU", "HKLM")) {
      String key = hive + "\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\" + executable;
      try {
        Process process = new ProcessBuilder("reg", "query", key, "/ve").redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        if (!process.waitFor(5, TimeUnit.SECONDS)) { process.destroyForcibly(); continue; }
        Optional<Path> path = registryDefaultValue(output);
        if (process.exitValue() == 0 && path.isPresent()) return path;
      } catch (IOException ignored) {
        // Try the next hive, then the install folders.
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        return Optional.empty();
      }
    }
    return Optional.empty();
  }

  /** The `(Default)` value from `reg query <key> /ve` output. */
  static Optional<Path> registryDefaultValue(String output) {
    for (String line : output.split("\\R")) {
      for (String type : List.of("REG_EXPAND_SZ", "REG_SZ")) {
        int index = line.indexOf(type);
        if (index < 0) continue;
        String value = line.substring(index + type.length()).trim();
        if (value.length() > 1 && value.startsWith("\"") && value.endsWith("\"")) value = value.substring(1, value.length() - 1);
        if (!value.isEmpty()) return Optional.of(Path.of(value));
      }
    }
    return Optional.empty();
  }

  /** Starts the browser without a shell; a quick nonzero exit (such as `open -a` without the app) is a failure. */
  static boolean startProcess(List<String> command) throws IOException {
    Process process = new ProcessBuilder(command).redirectOutput(ProcessBuilder.Redirect.DISCARD)
        .redirectError(ProcessBuilder.Redirect.DISCARD).start();
    try {
      if (!process.waitFor(isMac() ? 10 : 1, TimeUnit.SECONDS)) return true;
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      return true;
    }
    return process.exitValue() == 0;
  }
}
