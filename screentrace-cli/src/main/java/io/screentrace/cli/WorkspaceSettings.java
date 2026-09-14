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
  private final Path projectRoot;
  private final Path outputRoot;

  WorkspaceSettings(Path projectRoot, Path outputRoot) {
    this.projectRoot = projectRoot.toAbsolutePath().normalize();
    this.outputRoot = outputRoot.toAbsolutePath().normalize();
  }

  Path projectRoot() {
    return projectRoot;
  }

  Path outputRoot() {
    return outputRoot;
  }

  static Path defaultFile() {
    return Path.of(System.getProperty("user.home"), ".screentrace", "config.json");
  }

  static WorkspaceSettings load(Path file) throws IOException {
    StoredSettings stored = new ObjectMapper().readValue(file.toFile(), StoredSettings.class);
    if (stored.projectRoot == null || stored.outputRoot == null) throw new IOException("ScreenTrace settings are incomplete: " + file);
    return new WorkspaceSettings(Path.of(stored.projectRoot), Path.of(stored.outputRoot));
  }

  void save(Path file) throws IOException {
    Files.createDirectories(file.getParent());
    Path temporary = Files.createTempFile(file.getParent(), "config-", ".json");
    new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT)
        .writeValue(temporary.toFile(), new StoredSettings(projectRoot.toString(), outputRoot.toString()));
    try {
      Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    } catch (AtomicMoveNotSupportedException ignored) {
      Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
    }
  }

  private static final class StoredSettings {
    public String projectRoot;
    public String outputRoot;

    @SuppressWarnings("unused")
    public StoredSettings() { }

    private StoredSettings(String projectRoot, String outputRoot) {
      this.projectRoot = projectRoot;
      this.outputRoot = outputRoot;
    }
  }
}
