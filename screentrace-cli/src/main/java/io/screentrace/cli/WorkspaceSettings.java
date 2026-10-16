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
    var paths=canonicalPaths(projectRoot,outputRoot);
    writeAtomically(file,new StoredSettings(paths.projectRoot().toString(), paths.outputRoot().toString(),canonicalContextPaths(contextPaths),browser(file)));
  }

  /** The stored default browser id, or null when none is set (older config files have no such field). */
  static String browser(Path file) {
    try {
      if (!Files.isRegularFile(file) || Files.isSymbolicLink(file)) return null;
      var value = new ObjectMapper().readTree(file.toFile()).path("browser");
      return value.isTextual() && !value.asText().isBlank() ? value.asText() : null;
    } catch (IOException ignored) {
      return null;
    }
  }

  /** Stores the default browser while keeping every other setting; works before a project root is configured. */
  static void saveBrowser(Path file, String browser) throws IOException {
    if (Files.isSymbolicLink(file) || Files.isSymbolicLink(file.getParent())) throw new IOException("ScreenTrace config path must not contain a symbolic link: " + file);
    var mapper = new ObjectMapper();
    var tree = Files.isRegularFile(file) && mapper.readTree(file.toFile()) instanceof com.fasterxml.jackson.databind.node.ObjectNode existing
        ? existing : mapper.createObjectNode();
    if (browser == null) tree.remove("browser");
    else tree.put("browser", browser);
    writeAtomically(file, tree);
  }

  private static void writeAtomically(Path file, Object value) throws IOException {
    Files.createDirectories(file.getParent());
    Path temporary = Files.createTempFile(file.getParent(), "config-", ".json");
    new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT).writeValue(temporary.toFile(), value);
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
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public String browser;

    @SuppressWarnings("unused")
    public StoredSettings() { }

    private StoredSettings(String projectRoot, String outputRoot,java.util.Map<String,java.util.List<String>> contextPaths,String browser) {
      this.contextPaths=contextPaths;
      this.browser=browser;
      this.projectRoot = projectRoot;
      this.outputRoot = outputRoot;
    }
  }
}
