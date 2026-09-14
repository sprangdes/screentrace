package io.screentrace.cli;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/** Finds direct-child projects and their independently stored analysis outputs. */
final class ProjectCatalog {
  record Project(String name, Path sourceDirectory, Path analysisDirectory) { }

  List<Project> allProjects(WorkspaceSettings settings) throws IOException {
    if (!Files.isDirectory(settings.projectRoot())) throw new IOException("Project root does not exist: " + settings.projectRoot());
    try (Stream<Path> children = Files.list(settings.projectRoot())) {
      return children.filter(path -> Files.isDirectory(path) && !Files.isSymbolicLink(path))
          .filter(path -> !path.getFileName().toString().startsWith("."))
          .filter(path -> !path.toAbsolutePath().normalize().equals(settings.outputRoot()))
          .map(path -> project(path, settings.outputRoot()))
          .sorted(Comparator.comparing(Project::name, String.CASE_INSENSITIVE_ORDER))
          .toList();
    }
  }

  List<Project> analyzedProjects(WorkspaceSettings settings) throws IOException {
    if (!Files.isDirectory(settings.outputRoot())) return List.of();
    try (Stream<Path> children = Files.list(settings.outputRoot())) {
      return children.filter(path -> Files.isDirectory(path) && !Files.isSymbolicLink(path))
          .filter(this::hasCompleteAnalysis)
          .map(path -> new Project(path.getFileName().toString(), settings.projectRoot().resolve(path.getFileName()), path))
          .sorted(Comparator.comparing(Project::name, String.CASE_INSENSITIVE_ORDER))
          .toList();
    }
  }

  Project named(List<Project> projects, String name) {
    return projects.stream().filter(project -> project.name().equals(name)).findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Project not found: " + name));
  }

  private Project project(Path source, Path outputRoot) {
    String name = source.getFileName().toString();
    return new Project(name, source, outputRoot.resolve(name));
  }

  private boolean hasCompleteAnalysis(Path analysis) {
    return regular(analysis.resolve("application-graph.json"))
        && regular(analysis.resolve("prototype-model.json"))
        && regular(analysis.resolve("preview-model.json"))
        && regular(analysis.resolve("report/index.html"));
  }

  private static boolean regular(Path path) {
    return Files.isRegularFile(path) && !Files.isSymbolicLink(path);
  }
}
