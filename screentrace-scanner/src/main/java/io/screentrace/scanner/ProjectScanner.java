package io.screentrace.scanner;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

/** Locates source artifacts without interpreting a framework. */
public final class ProjectScanner {
  public ProjectInventory scan(Path project) throws IOException {
    Path root = project.toAbsolutePath().normalize();
    try (Stream<Path> stream = Files.walk(root)) {
      List<Path> files = stream.filter(Files::isRegularFile).filter(p -> !ignored(root.relativize(p))).sorted().toList();
      Set<String> technologies = new TreeSet<>();
      if (files.stream().anyMatch(p -> p.getFileName().toString().equals("pom.xml"))) technologies.add("Maven");
      if (files.stream().anyMatch(p -> p.getFileName().toString().equals("build.gradle") || p.getFileName().toString().equals("build.gradle.kts"))) technologies.add("Gradle");
      if (files.stream().anyMatch(p -> p.toString().endsWith(".java"))) technologies.add("Java");
      if (files.stream().anyMatch(p -> p.toString().endsWith(".tsx") || p.toString().endsWith(".jsx"))) technologies.add("React");
      if (files.stream().anyMatch(p -> p.toString().endsWith(".html"))) technologies.add("HTML");
      if (contains(root.resolve("pom.xml"), "spring-boot") || contains(root.resolve("pom.xml"), "spring-web")) technologies.add("Spring Boot");
      return new ProjectInventory(root, files, List.copyOf(technologies));
    }
  }
  private static boolean ignored(Path p) { for (Path x : p) if (Set.of("target","build","node_modules",".git",".screentrace").contains(x.toString())) return true; return false; }
  private static boolean contains(Path p, String text) { try { return Files.exists(p) && Files.readString(p).contains(text); } catch(IOException e) { return false; } }
  public record ProjectInventory(Path root, List<Path> files, List<String> technologies) { public List<Path> javaFiles() { return files.stream().filter(p -> p.toString().endsWith(".java")).toList(); } public List<Path> reactFiles() { return files.stream().filter(p -> p.toString().endsWith(".tsx") || p.toString().endsWith(".jsx")).toList(); } }
}
