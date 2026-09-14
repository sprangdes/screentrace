package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ProjectCatalogTest {
  @TempDir Path root;

  @Test void listsAllDirectProjectsButOnlyCompleteAnalysisOutputs() throws Exception {
    Path projects = Files.createDirectories(root.resolve("ocp"));
    Files.createDirectories(projects.resolve("alpha"));
    Files.createDirectories(projects.resolve("beta"));
    Files.createDirectories(projects.resolve(".hidden"));
    Path output = Files.createDirectories(projects.resolve("analyze"));
    complete(output.resolve("alpha"));
    Files.createDirectories(output.resolve("beta")).resolve("application-graph.json").toFile().createNewFile();

    ProjectCatalog catalog = new ProjectCatalog();
    WorkspaceSettings settings = new WorkspaceSettings(projects, output);

    assertEquals(List.of("alpha", "beta"), catalog.allProjects(settings).stream().map(ProjectCatalog.Project::name).toList());
    assertEquals(List.of("alpha"), catalog.analyzedProjects(settings).stream().map(ProjectCatalog.Project::name).toList());
    assertEquals(output.resolve("alpha"), catalog.named(catalog.analyzedProjects(settings), "alpha").analysisDirectory());
  }

  private static void complete(Path output) throws Exception {
    Files.createDirectories(output.resolve("report"));
    Files.writeString(output.resolve("application-graph.json"), "{}");
    Files.writeString(output.resolve("prototype-model.json"), "{}");
    Files.writeString(output.resolve("preview-model.json"), "{}");
    Files.writeString(output.resolve("report/index.html"), "report");
  }
}
