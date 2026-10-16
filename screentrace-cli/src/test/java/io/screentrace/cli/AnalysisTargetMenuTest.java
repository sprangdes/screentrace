package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.jline.terminal.Size;
import org.jline.terminal.Terminal;
import org.jline.terminal.impl.DumbTerminal;
import org.jline.terminal.impl.ExternalTerminal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** "分析專案" covers both the project root's folders and any other path. */
class AnalysisTargetMenuTest {
  private static final String UP = "\u001b[A";
  @TempDir Path temp;

  @Test void listsTheProjectRootFoldersAndReturnsThePickedOne() throws Exception {
    List<ProjectCatalog.Project> projects = projects("alpha", "beta");
    // alpha, beta, 輸入其他路徑…, ← 返回功能選單; the cursor starts on the first
    assertEquals("beta", pick(projects, "\u001b[B\r").name());
  }

  @Test void backReturnsToTheMenu() {
    assertThrows(InteractiveConsole.SelectionCancelledException.class, () -> pick(projects("alpha"), UP + "\r"));
  }

  @Test void anotherPathAsksForAFolderOutsideTheRoot() throws Exception {
    Path other = Files.createDirectory(temp.resolve("elsewhere"));
    assertEquals(other, pick(projects("alpha"), UP + UP + "\r" + other + "\r").sourceDirectory());
  }

  @Test void withNothingToListItAsksForThePathStraightAway() throws Exception {
    Path other = Files.createDirectory(temp.resolve("solo"));
    var input = new ByteArrayInputStream((other + "\n").getBytes(StandardCharsets.UTF_8));
    Terminal terminal = new DumbTerminal("test", Terminal.TYPE_DUMB, input, new ByteArrayOutputStream(), StandardCharsets.UTF_8);
    try (InteractiveConsole console = new InteractiveConsole(terminal)) {
      assertEquals(other, ScreenTraceCli.selectAnalysisTarget(console, List.of()).sourceDirectory());
    }
  }

  private List<ProjectCatalog.Project> projects(String... names) throws Exception {
    List<ProjectCatalog.Project> projects = new java.util.ArrayList<>();
    for (String name : names)
      projects.add(new ProjectCatalog.Project(name, Files.createDirectories(temp.resolve("root").resolve(name)), temp.resolve("out").resolve(name)));
    return projects;
  }

  private static ProjectCatalog.Project pick(List<ProjectCatalog.Project> projects, String keys) throws Exception {
    var input = new ByteArrayInputStream(keys.getBytes(StandardCharsets.UTF_8));
    Terminal terminal = new ExternalTerminal("test", "xterm-256color", input, new ByteArrayOutputStream(), StandardCharsets.UTF_8);
    terminal.setSize(new Size(80, 24));
    try (InteractiveConsole console = new InteractiveConsole(terminal)) {
      return ScreenTraceCli.selectAnalysisTarget(console, projects);
    }
  }
}
