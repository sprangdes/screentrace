package io.screentrace.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** User-owned workspace locations, persisted outside analyzed source projects. */
final class WorkspaceSettings {
  private int contextPathsLine=1;
  private final Path projectRoot;
  private final Path outputRoot;
  private final java.util.Map<String,java.util.List<String>> contextPaths;

  WorkspaceSettings(Path projectRoot, Path outputRoot) {
    this(projectRoot,outputRoot,java.util.Map.of());
  }

  WorkspaceSettings(Path projectRoot,Path outputRoot,java.util.Map<String,java.util.List<String>> contextPaths) {
    var normalized=new java.util.TreeMap<String,java.util.List<String>>();
    contextPaths.forEach((project,values)->normalized.put(Path.of(project).toAbsolutePath().normalize().toString(),values.stream().distinct().sorted().toList()));
    this.contextPaths=java.util.Collections.unmodifiableMap(normalized);
    this.projectRoot = projectRoot.toAbsolutePath().normalize();
    this.outputRoot = outputRoot.toAbsolutePath().normalize();
  }

  Path projectRoot() {
    return projectRoot;
  }

  Path outputRoot() {
    return outputRoot;
  }

  int contextPathsLine() {return contextPathsLine;}

  java.util.Map<String,java.util.List<String>> contextPaths() { return contextPaths; }

  java.util.List<String> contextPathsFor(Path project) { return contextPaths.getOrDefault(project.toAbsolutePath().normalize().toString(),java.util.List.of()); }

  static Path defaultFile() {
    return Path.of(System.getProperty("user.home"), ".screentrace", "config.json");
  }

  static WorkspaceSettings load(Path file) throws IOException {
    if (Files.isSymbolicLink(file)) throw new IOException("ScreenTrace config must not be a symbolic link: " + file);
    StoredSettings stored = new ObjectMapper().readValue(file.toFile(), StoredSettings.class);
    if (stored.projectRoot == null || stored.outputRoot == null) throw new IOException("ScreenTrace settings are incomplete: " + file);
    var settings=new WorkspaceSettings(Path.of(stored.projectRoot), Path.of(stored.outputRoot),stored.contextPaths==null?java.util.Map.of():stored.contextPaths);
    try(var parser=new ObjectMapper().getFactory().createParser(file.toFile())){while(parser.nextToken()!=null)if(parser.currentToken()==com.fasterxml.jackson.core.JsonToken.FIELD_NAME&&"contextPaths".equals(parser.currentName())){settings.contextPathsLine=(int)parser.currentTokenLocation().getLineNr();break;}}
    return settings;
  }

  void save(Path file) throws IOException {
    if (Files.isSymbolicLink(file) || Files.isSymbolicLink(file.getParent())) throw new IOException("ScreenTrace config path must not contain a symbolic link: " + file);
    Files.createDirectories(file.getParent());
    Path temporary = Files.createTempFile(file.getParent(), "config-", ".json");
    new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT)
        .writeValue(temporary.toFile(), new StoredSettings(projectRoot.toString(), outputRoot.toString(),contextPaths));
    try {
      Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    } catch (AtomicMoveNotSupportedException ignored) {
      Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
    }
  }

  private static final class StoredSettings {
    public String projectRoot;
    public String outputRoot;
    public java.util.Map<String,java.util.List<String>> contextPaths;

    @SuppressWarnings("unused")
    public StoredSettings() { }

    private StoredSettings(String projectRoot, String outputRoot,java.util.Map<String,java.util.List<String>> contextPaths) {
      this.contextPaths=contextPaths;
      this.projectRoot = projectRoot;
      this.outputRoot = outputRoot;
    }
  }
}
