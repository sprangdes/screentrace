package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WorkspaceSettingsTest {
  @TempDir Path root;

  @Test void persistsNormalizedWorkspaceLocations() throws Exception {
    Path file = root.resolve("settings/config.json");
    WorkspaceSettings settings = new WorkspaceSettings(root.resolve("projects/../projects"), root.resolve("output"));

    settings.save(file);
    WorkspaceSettings loaded = WorkspaceSettings.load(file);

    assertEquals(root.resolve("projects"), loaded.projectRoot());
    assertEquals(root.resolve("output"), loaded.outputRoot());
  }
}
