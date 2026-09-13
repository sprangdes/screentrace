package io.screentrace.scanner;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

/** Locates source artifacts without interpreting a framework. */
public final class ProjectScanner {
  private static final String POM_FILE = "pom.xml";
  private static final Set<String> IGNORED_DIRECTORIES = Set.of("target", "build", "node_modules", ".git", ".screentrace");

  public ProjectInventory scan(Path project) throws IOException {
    Path root = project.toAbsolutePath().normalize();
    try (Stream<Path> stream = Files.walk(root)) {
      List<Path> files = stream
          .filter(Files::isRegularFile)
          .filter(path -> !ignored(root.relativize(path)))
          .sorted()
          .toList();
      return new ProjectInventory(root, files, technologies(root, files));
    }
  }

  private static List<String> technologies(Path root, List<Path> files) {
    Set<String> technologies = new TreeSet<>();
    if (files.stream().anyMatch(path -> path.getFileName().toString().equals(POM_FILE))) technologies.add("Maven");
    if (files.stream().anyMatch(path -> hasExtension(path, ".gradle") || hasExtension(path, ".gradle.kts"))) technologies.add("Gradle");
    if (files.stream().anyMatch(path -> hasExtension(path, ".java"))) technologies.add("Java");
    if (files.stream().anyMatch(path -> hasExtension(path, ".tsx") || hasExtension(path, ".jsx"))) technologies.add("React");
    if (files.stream().anyMatch(path -> hasExtension(path, ".html"))) technologies.add("HTML");
    if (contains(root.resolve(POM_FILE), "spring-boot") || contains(root.resolve(POM_FILE), "spring-web")) technologies.add("Spring Boot");
    return List.copyOf(technologies);
  }

  private static boolean ignored(Path path) {
    for (Path segment : path) {
      if (IGNORED_DIRECTORIES.contains(segment.toString())) return true;
    }
    return false;
  }

  private static boolean hasExtension(Path path, String extension) {
    return path.toString().endsWith(extension);
  }

  private static boolean contains(Path path, String text) {
    try {
      return Files.exists(path) && Files.readString(path).contains(text);
    } catch (IOException ignored) {
      return false;
    }
  }

  public record ProjectInventory(Path root, List<Path> files, List<String> technologies) {
    public List<Path> javaFiles() {
      return files.stream().filter(path -> hasExtension(path, ".java")).toList();
    }

    public List<Path> reactFiles() {
      return files.stream().filter(path -> hasExtension(path, ".tsx") || hasExtension(path, ".jsx")).toList();
    }
  }
}
