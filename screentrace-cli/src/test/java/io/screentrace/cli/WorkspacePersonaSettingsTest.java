package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class WorkspacePersonaSettingsTest {
  @TempDir Path root;
  final ObjectMapper json = new ObjectMapper();

  Path write(String personas) throws Exception {
    Path f = root.resolve("config.json");
    Files.writeString(
        f,
        "{\n\"projectRoot\":"
            + json.writeValueAsString(root.toString())
            + ",\n\"outputRoot\":"
            + json.writeValueAsString(root.resolve("out").toString())
            + ",\n\"personas\":"
            + personas
            + "\n}");
    return f;
  }

  String keyed(String value) throws Exception {
    return "{" + json.writeValueAsString(root.resolve("project").toString()) + ":" + value + "}";
  }

  @Test
  void readsOrderedAndDefaultStartPaths() throws Exception {
    var s =
        WorkspaceSettings.load(
            write(
                keyed(
                    "[{\"id\":\"guest\",\"name\":\"訪客\",\"facts\":[{\"text\":\"me\",\"truth\":false}]},{\"id\":\"customer\",\"name\":\"顧客\",\"facts\":[{\"text\":\"me\",\"truth\":true}]}]")));
    var p = s.personasFor(root.resolve("project")).orElseThrow();
    assertEquals(java.util.List.of("guest", "customer"), p.stream().map(x -> x.id()).toList());
    assertEquals(java.util.List.of("/"), p.get(0).startPaths());
    assertEquals(4, s.personasLine());
    assertTrue(s.personasFor(root.resolve("other")).isEmpty());
  }

  @Test
  void emptyArrayIsConfigured() throws Exception {
    assertEquals(
        java.util.List.of(),
        WorkspaceSettings.load(write(keyed("[]")))
            .personasFor(root.resolve("project"))
            .orElseThrow());
  }

  @Test
  void invalidFieldsThrow() throws Exception {
    for (String p :
        java.util.List.of(
            "{\"id\":\"Guest\",\"name\":\"x\",\"facts\":[{\"text\":\"x\",\"truth\":true}]}",
            "{\"id\":\"guest\",\"name\":\"x\\u0007\",\"facts\":[{\"text\":\"x\",\"truth\":true}]}",
            "{\"id\":\"guest\",\"name\":\"x\",\"facts\":[]}"))
      assertThrows(
          java.io.IOException.class, () -> WorkspaceSettings.load(write(keyed("[" + p + "]"))));
  }

  @Test
  void descriptionIsOptionalTrimmedAndChecked() throws Exception {
    var p =
        WorkspaceSettings.load(
                write(
                    keyed(
                        "[{\"id\":\"guest\",\"name\":\"訪客\",\"description\":\"  尚未登入的訪客 \",\"facts\":[{\"text\":\"me\",\"truth\":false}]},{\"id\":\"customer\",\"name\":\"顧客\",\"facts\":[{\"text\":\"me\",\"truth\":true}]}]")))
            .personasFor(root.resolve("project"))
            .orElseThrow();
    assertEquals("尚未登入的訪客", p.get(0).description());
    assertNull(p.get(1).description());
    for (String bad : java.util.List.of("\"\"", "1", "\"" + "x".repeat(81) + "\"", "\"x\\u0007\""))
      assertThrows(
          java.io.IOException.class,
          () ->
              WorkspaceSettings.load(
                  write(
                      keyed(
                          "[{\"id\":\"guest\",\"name\":\"訪客\",\"description\":"
                              + bad
                              + ",\"facts\":[{\"text\":\"me\",\"truth\":false}]}]"))));
  }

  @Test
  void savePreservesPersonas() throws Exception {
    Path f =
        write(
            keyed(
                "[{\"id\":\"guest\",\"name\":\"訪客\",\"facts\":[{\"text\":\"me\",\"truth\":false}]}]"));
    var before = json.readTree(f.toFile()).path("personas");
    var settings = WorkspaceSettings.load(f);
    settings.save(f);
    assertEquals(before, json.readTree(f.toFile()).path("personas"));
  }
}
