package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.report.MigrationTarget;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R78 (ADR 0156): migrationTargets in the workspace config, per project, kept on save. */
class WorkspaceMigrationTargetTest {
  @TempDir Path root;
  final ObjectMapper json = new ObjectMapper();

  Path write(String targets) throws Exception {
    Path f = root.resolve("config.json");
    Files.writeString(
        f,
        "{\"projectRoot\":"
            + json.writeValueAsString(root.toString())
            + ",\"outputRoot\":"
            + json.writeValueAsString(root.resolve("out").toString())
            + ",\"migrationTargets\":"
            + targets
            + "}");
    return f;
  }

  String keyed(String project, String value) throws Exception {
    return json.writeValueAsString(root.resolve(project).toString()) + ":" + value;
  }

  @Test
  void readsATargetOrNonePerProjectAndKeepsThemOnSave() throws Exception {
    Path file =
        write(
            "{"
                + keyed("a", "{\"backend\":\" Quarkus 3 \",\"frontend\":\"React\"}")
                + ","
                + keyed("b", "\"none\"")
                + "}");
    var settings = WorkspaceSettings.load(file);
    assertEquals(
        new MigrationTarget("Quarkus 3", "React"), settings.migrationTargetFor(root.resolve("a")));
    assertSame(MigrationTarget.NONE, settings.migrationTargetFor(root.resolve("b")));
    assertNull(settings.migrationTargetFor(root.resolve("c")));
    settings.save(file);
    assertEquals(
        new MigrationTarget("Quarkus 3", "React"),
        WorkspaceSettings.load(file).migrationTargetFor(root.resolve("a")));
  }

  @Test
  void invalidTargetsStopLoadingWithTheProjectNamed() throws Exception {
    for (String value :
        java.util.List.of(
            "\"Spring\"",
            "{\"backend\":\"x\"}",
            "{\"backend\":\"x\",\"frontend\":\"\"}",
            "{\"backend\":\"x\",\"frontend\":\"y\",\"extra\":\"z\"}")) {
      var error =
          assertThrows(
              java.io.IOException.class,
              () -> WorkspaceSettings.load(write("{" + keyed("a", value) + "}")));
      assertTrue(error.getMessage().contains("migrationTargets"), error.getMessage());
    }
    assertThrows(java.io.IOException.class, () -> WorkspaceSettings.load(write("[]")));
  }
}
