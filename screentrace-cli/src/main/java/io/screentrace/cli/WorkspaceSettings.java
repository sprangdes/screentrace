package io.screentrace.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import io.screentrace.scanner.RealPaths;

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
    contextPaths.forEach((project,values)->normalized.put(canonicalKey(Path.of(project)),values.stream().distinct().sorted().toList()));
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

  java.util.List<String> contextPathsFor(Path project) { return contextPaths.getOrDefault(canonicalKey(project),java.util.List.of()); }

  private static String canonicalKey(Path path) {
    try { return RealPaths.resolveAllowMissing(path).toString(); }
    catch (IOException ignored) { return path.toAbsolutePath().normalize().toString(); }
  }

  static Path defaultFile() {
    return Path.of(System.getProperty("user.home"), ".screentrace", "config.json");
  }

  static WorkspaceSettings load(Path file) throws IOException {
    if (Files.isSymbolicLink(file)) throw new IOException("ScreenTrace config must not be a symbolic link: " + file);
    StoredSettings stored = new ObjectMapper().readValue(file.toFile(), StoredSettings.class);
    if (stored.projectRoot == null || stored.outputRoot == null) throw new IOException("ScreenTrace settings are incomplete: " + file);
    var paths=canonicalPaths(Path.of(stored.projectRoot),Path.of(stored.outputRoot));
    var settings=new WorkspaceSettings(paths.projectRoot(), paths.outputRoot(),canonicalContextPaths(stored.contextPaths==null?java.util.Map.of():stored.contextPaths));
    try(var parser=new ObjectMapper().getFactory().createParser(file.toFile())){while(parser.nextToken()!=null)if(parser.currentToken()==com.fasterxml.jackson.core.JsonToken.FIELD_NAME&&"contextPaths".equals(parser.currentName())){settings.contextPathsLine=(int)parser.currentTokenLocation().getLineNr();break;}}
    return settings;
  }

  void save(Path file) throws IOException {
    if (Files.isSymbolicLink(file) || Files.isSymbolicLink(file.getParent())) throw new IOException("ScreenTrace config path must not contain a symbolic link: " + file);
    Files.createDirectories(file.getParent());
    Path temporary = Files.createTempFile(file.getParent(), "config-", ".json");
    var paths=canonicalPaths(projectRoot,outputRoot);
    new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT)
        .writeValue(temporary.toFile(), new StoredSettings(paths.projectRoot().toString(), paths.outputRoot().toString(),canonicalContextPaths(contextPaths)));
    try {
      Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    } catch (AtomicMoveNotSupportedException ignored) {
      Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
    }
  }

  static CanonicalPaths canonicalPaths(Path projectRoot,Path outputRoot) throws IOException {
    Path project=RealPaths.resolveAllowMissing(projectRoot),output=RealPaths.resolveAllowMissing(outputRoot);
    var changes=new java.util.ArrayList<String>();
    Path originalProject=projectRoot.toAbsolutePath().normalize(),originalOutput=outputRoot.toAbsolutePath().normalize();
    if(!originalProject.equals(project))changes.add("專案根目錄「"+originalProject+"」校正為「"+project+"」");
    if(!originalOutput.equals(output))changes.add("輸出根目錄「"+originalOutput+"」校正為「"+output+"」");
    return new CanonicalPaths(project,output,changes.isEmpty()?null:"已將 "+String.join("；",changes));
  }

  private static java.util.Map<String,java.util.List<String>> canonicalContextPaths(java.util.Map<String,java.util.List<String>> values) throws IOException {
    var result=new java.util.TreeMap<String,java.util.List<String>>();
    for(var entry:values.entrySet())result.put(RealPaths.resolveAllowMissing(Path.of(entry.getKey())).toString(),entry.getValue().stream().distinct().sorted().toList());
    return java.util.Collections.unmodifiableMap(result);
  }

  record CanonicalPaths(Path projectRoot,Path outputRoot,String correctionMessage) { }

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
