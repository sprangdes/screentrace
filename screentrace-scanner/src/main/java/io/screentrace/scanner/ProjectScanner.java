package io.screentrace.scanner;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/** Locates source artifacts without interpreting a framework. */
public final class ProjectScanner {
  private static final String POM_FILE = "pom.xml";
  private static final Set<String> IGNORED_DIRECTORIES = Set.of("target", "build", "node_modules", ".git", ".screentrace");

  public ProjectInventory scan(Path project) throws IOException {
    Path root = project.toRealPath();
    List<Path> files = new ArrayList<>();
    List<String> diagnostics = new ArrayList<>();
    long[] bytes = {0};
    int[] visited = {0};
    Files.walkFileTree(root, new SimpleFileVisitor<>() {
      @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
        if (++visited[0] > SafeProjectFiles.MAX_PROJECT_FILES) {
          diagnostics.add("Maximum project entry count exceeded; remaining paths skipped");
          return FileVisitResult.TERMINATE;
        }
        Path relative = root.relativize(dir);
        if(!dir.equals(root)&&dir.getFileName().toString().startsWith("workspace:")){diagnostics.add("Reserved workspace evidence directory skipped");return FileVisitResult.SKIP_SUBTREE;}
        if (relative.getNameCount() > SafeProjectFiles.MAX_DIRECTORY_DEPTH) {
          diagnostics.add("Maximum project directory depth exceeded; skipped " + relative);
          return FileVisitResult.SKIP_SUBTREE;
        }
        if (!dir.equals(root) && ignored(relative)) return FileVisitResult.SKIP_SUBTREE;
        return FileVisitResult.CONTINUE;
      }

      @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
        if (++visited[0] > SafeProjectFiles.MAX_PROJECT_FILES) {
          diagnostics.add("Maximum project entry count exceeded; remaining paths skipped");
          return FileVisitResult.TERMINATE;
        }
        if(file.getFileName().toString().startsWith("workspace:")){diagnostics.add("Reserved workspace evidence name skipped");return FileVisitResult.CONTINUE;}
        if (attrs.isSymbolicLink() || !attrs.isRegularFile()) {
          if (attrs.isSymbolicLink()) diagnostics.add("Symbolic link skipped: " + root.relativize(file));
          return FileVisitResult.CONTINUE;
        }
        if (files.size() >= SafeProjectFiles.MAX_PROJECT_FILES) {
          diagnostics.add("Maximum project file count exceeded; remaining files skipped");
          return FileVisitResult.TERMINATE;
        }
        if (attrs.size() > SafeProjectFiles.MAX_SOURCE_FILE_BYTES) {
          diagnostics.add("Source file exceeds 8 MiB and was skipped: " + root.relativize(file));
          return FileVisitResult.CONTINUE;
        }
        if (bytes[0] + attrs.size() > SafeProjectFiles.MAX_PROJECT_TOTAL_BYTES) {
          diagnostics.add("Maximum analyzed source bytes exceeded; remaining files skipped");
          return FileVisitResult.TERMINATE;
        }
        bytes[0] += attrs.size();
        files.add(file);
        return FileVisitResult.CONTINUE;
      }

      @Override public FileVisitResult visitFileFailed(Path file, IOException error) {
        diagnostics.add("Unable to inspect source path: " + root.relativize(file));
        return FileVisitResult.CONTINUE;
      }
    });
    files.sort(Path::compareTo);
    return new ProjectInventory(root, files, technologies(root, files), diagnostics);
  }

  private static List<String> technologies(Path root, List<Path> files) {
    Set<String> technologies = new TreeSet<>();
    if (files.stream().anyMatch(path -> path.getFileName().toString().equals(POM_FILE))) technologies.add("Maven");
    if (files.stream().anyMatch(path -> hasExtension(path, ".gradle") || hasExtension(path, ".gradle.kts"))) technologies.add("Gradle");
    if (files.stream().anyMatch(path -> hasExtension(path, ".java"))) technologies.add("Java");
    if (files.stream().anyMatch(path -> hasExtension(path, ".tsx") || hasExtension(path, ".jsx"))) technologies.add("React");
    if (files.stream().anyMatch(path -> hasExtension(path, ".html"))) technologies.add("HTML");
    boolean springBoot = files.stream().filter(path -> path.getFileName().toString().equals(POM_FILE)).anyMatch(path -> contains(root, path, "spring-boot"));
    boolean springMvc = files.stream().filter(path -> path.getFileName().toString().equals(POM_FILE)).anyMatch(path -> contains(root, path, "spring-webmvc"));
    boolean spring = files.stream().filter(path -> path.getFileName().toString().equals(POM_FILE)).anyMatch(path -> contains(root, path, "spring"))
        || files.stream().filter(path -> hasExtension(path, ".xml")).anyMatch(path -> contains(root, path, "<beans"));
    boolean struts = files.stream().anyMatch(path -> path.getFileName().toString().startsWith("struts-config") && hasExtension(path, ".xml"));
    if (springBoot) technologies.add("Spring Boot");
    if (springMvc) technologies.add("Spring MVC");
    if (spring) technologies.add("Spring");
    if (struts) technologies.add("Struts 1");
    if (files.stream().anyMatch(path -> hasExtension(path, ".jsp") || hasExtension(path, ".jspf"))) technologies.add("JSP");
    if (files.stream().filter(path -> hasExtension(path, ".xml")).anyMatch(path -> contains(root, path, "tiles-definitions"))) technologies.add("Tiles");
    return List.copyOf(technologies);
  }

  private static boolean ignored(Path path) {
    for (Path segment : path) if (IGNORED_DIRECTORIES.contains(segment.toString())) return true;
    return false;
  }
  private static boolean hasExtension(Path path, String extension) { return path.toString().endsWith(extension); }
  private static boolean contains(Path root, Path path, String text) {
    try { return SafeProjectFiles.readUtf8Limited(root, path, Math.min(SafeProjectFiles.MAX_XML_FILE_BYTES, SafeProjectFiles.MAX_SOURCE_FILE_BYTES)).contains(text); }
    catch (IOException | SecurityException ignored) { return false; }
  }

  public record ProjectInventory(Path root, List<Path> files, List<String> technologies, List<String> diagnostics,List<String> contextPaths,String contextSettingsFile,int contextSettingsLine) {
    public ProjectInventory(Path root,List<Path> files,List<String> technologies,List<String> diagnostics){this(root,files,technologies,diagnostics,List.of(),".",1);}
    public ProjectInventory withContextPaths(List<String> values,String source){return withContextPaths(values,1);}
    public ProjectInventory withContextPaths(List<String> values,int line){return new ProjectInventory(root,files,technologies,diagnostics,values,"workspace:config.json",Math.max(1,line));}
    public ProjectInventory(Path root, List<Path> files, List<String> technologies) { this(root, files, technologies, List.of()); }
    public ProjectInventory { files = List.copyOf(files); technologies = List.copyOf(technologies); diagnostics = List.copyOf(diagnostics); contextPaths=List.copyOf(contextPaths); contextSettingsFile=contextPaths.isEmpty()?".":"workspace:config.json"; }
    public List<Path> javaFiles() { return files.stream().filter(path -> hasExtension(path, ".java")).toList(); }
    public List<Path> reactFiles() { return files.stream().filter(path -> hasExtension(path, ".tsx") || hasExtension(path, ".jsx")).toList(); }
    public List<Path> jspFiles() { return files.stream().filter(path -> hasExtension(path, ".jsp")).toList(); }
    public List<Path> jspFragmentFiles() { return files.stream().filter(path -> hasExtension(path, ".jspf")).toList(); }
    public List<Path> tilesConfigFiles() { return files.stream().filter(path -> hasExtension(path, ".xml") && contains(root, path, "tiles-definitions")).toList(); }
    public List<Path> strutsConfigFiles() { return files.stream().filter(path -> path.getFileName().toString().startsWith("struts-config") && hasExtension(path, ".xml")).toList(); }
    public List<Path> springXmlFiles() { return files.stream().filter(path -> hasExtension(path, ".xml") && contains(root, path, "<beans")).toList(); }
  }
}
