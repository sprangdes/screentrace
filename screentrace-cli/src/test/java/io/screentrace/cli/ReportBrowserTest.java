package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.screentrace.cli.ReportBrowser.Kind;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReportBrowserTest {
  @TempDir Path root;

  private static ReportBrowser.Detector only(Kind... kinds) {
    Set<Kind> present = Set.of(kinds);
    return kind -> present.contains(kind) ? Optional.of(Path.of("/apps", kind.label() + ".app")) : Optional.empty();
  }

  @Test void withoutAPreferenceChromeComesBeforeEdgeThenTheSystemDefault() {
    assertEquals(Kind.CHROME, ReportBrowser.choose(null, only(Kind.EDGE, Kind.CHROME, Kind.SAFARI)).kind());
    assertEquals(Kind.EDGE, ReportBrowser.choose(null, only(Kind.EDGE, Kind.FIREFOX, Kind.SAFARI)).kind());
    assertTrue(ReportBrowser.choose(null, only(Kind.FIREFOX, Kind.SAFARI)).systemDefault());
  }

  @Test void anInstalledPreferenceWinsAndAMissingOneFallsBackToTheDefaultOrder() {
    assertEquals(Kind.FIREFOX, ReportBrowser.choose("firefox", only(Kind.CHROME, Kind.FIREFOX)).kind());
    assertEquals(Kind.CHROME, ReportBrowser.choose("safari", only(Kind.CHROME, Kind.FIREFOX)).kind());
    assertEquals(Kind.EDGE, ReportBrowser.choose("unknown", only(Kind.EDGE)).kind());
    assertTrue(ReportBrowser.choose(ReportBrowser.SYSTEM, only(Kind.CHROME)).systemDefault());
  }

  @Test void commandsAreArgumentArraysForOpenOnMacAndTheExecutableElsewhere() {
    Path report = Path.of("/out/my report; rm -rf ~/screentrace-report.html");
    var chrome = new ReportBrowser.Choice(Kind.CHROME, Path.of("/Applications/Google Chrome.app"));
    assertEquals(List.of("open", "-a", "/Applications/Google Chrome.app", report.toString()), ReportBrowser.command(chrome, report, true));
    var edge = new ReportBrowser.Choice(Kind.EDGE, Path.of("C:/Edge/msedge.exe"));
    assertEquals(List.of(Path.of("C:/Edge/msedge.exe").toString(), report.toString()), ReportBrowser.command(edge, report, false));
  }

  @Test void macDetectionLooksInBothApplicationFolders() throws IOException {
    Path system = Files.createDirectory(root.resolve("Applications")), user = Files.createDirectories(root.resolve("home/Applications"));
    Files.createDirectory(system.resolve("Safari.app"));
    Files.createDirectory(user.resolve("Google Chrome.app"));
    var detector = ReportBrowser.macDetector(List.of(system, user));
    assertEquals(List.of(Kind.CHROME, Kind.SAFARI), ReportBrowser.installed(detector).stream().map(ReportBrowser.Choice::kind).toList());
    assertEquals(Optional.of(user.resolve("Google Chrome.app")), detector.locate(Kind.CHROME));
  }

  @Test void windowsDetectionPrefersAppPathsThenInstallFolders() throws IOException {
    Path registered = Files.createDirectories(root.resolve("custom")).resolve("chrome.exe");
    Files.createFile(registered);
    Path programFiles = root.resolve("Program Files");
    Path edge = Files.createDirectories(programFiles.resolve("Microsoft/Edge/Application")).resolve("msedge.exe");
    Files.createFile(edge);
    var detector = ReportBrowser.windowsDetector(
        exe -> exe.equals("chrome.exe") ? Optional.of(registered) : exe.equals("firefox.exe") ? Optional.of(root.resolve("gone.exe")) : Optional.empty(),
        ReportBrowser.windowsInstallRoots(Map.of("ProgramFiles", programFiles.toString())));
    assertEquals(Optional.of(registered), detector.locate(Kind.CHROME));
    assertEquals(Optional.of(edge), detector.locate(Kind.EDGE));
    assertEquals(Optional.empty(), detector.locate(Kind.FIREFOX));
    assertEquals(Optional.empty(), detector.locate(Kind.SAFARI));
  }

  @Test void parsesTheDefaultValueFromRegQuery() {
    String output = "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe\r\n"
        + "    (Default)    REG_SZ    \"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\"\r\n";
    assertEquals(Optional.of(Path.of("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")), ReportBrowser.registryDefaultValue(output));
    assertEquals(Optional.empty(), ReportBrowser.registryDefaultValue("ERROR: The system was unable to find the specified registry key"));
  }

  @Test void autosaveBrowsersOpenWithoutAHint() {
    var run = open("chrome", only(Kind.CHROME), true, true);
    assertEquals(1, run.launched.size());
    assertEquals(List.of(), run.browsed);
    assertEquals(List.of(), run.messages);
  }

  @Test void otherBrowsersOpenWithTheDownloadHint() {
    var run = open("firefox", only(Kind.CHROME, Kind.FIREFOX), true, true);
    assertTrue(run.launched.get(0).contains("/apps/Firefox.app"), run.launched.toString());
    assertTrue(run.messages.get(0).contains("不支援自動存檔，請用『下載 md』保存"), run.messages.toString());
  }

  @Test void aFailedLaunchFallsBackToTheSystemDefaultThenThePrintedPath() {
    var fallback = open(null, only(Kind.EDGE), false, true);
    assertEquals(1, fallback.launched.size());
    assertEquals(1, fallback.browsed.size());
    assertTrue(fallback.messages.get(0).contains("改用系統預設瀏覽器"), fallback.messages.toString());

    var manual = open(null, only(), false, false);
    assertEquals(List.of(), manual.launched);
    assertEquals("瀏覽器無法自動開啟，請直接開啟上述 HTML 檔案。", manual.messages.get(manual.messages.size() - 1));
  }

  private static Run open(String preference, ReportBrowser.Detector detector, boolean launches, boolean browses) {
    var run = new Run();
    ReportBrowser.open(Path.of("/out/report.html"), preference, detector,
        command -> { run.launched.add(command); return launches; },
        uri -> { run.browsed.add(uri); return browses; }, true, run.messages::add);
    return run;
  }

  private static final class Run {
    final List<List<String>> launched = new ArrayList<>();
    final List<URI> browsed = new ArrayList<>();
    final List<String> messages = new ArrayList<>();
  }
}
