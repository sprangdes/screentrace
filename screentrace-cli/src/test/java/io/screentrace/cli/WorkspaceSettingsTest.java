package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Path;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

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
  @Test void persistsExplicitPerProjectContextCandidatesWithoutGuessing() throws Exception {
    Path file=root.resolve("settings/config.json");
    var project=root.resolve("projects/shop");
    var settings=new WorkspaceSettings(root.resolve("projects"),root.resolve("output"),java.util.Map.of(project.toString(),java.util.List.of("/shop","/alternate")));
    settings.save(file);var loaded=WorkspaceSettings.load(file);
    assertEquals(java.util.List.of("/alternate","/shop"),loaded.contextPathsFor(project));
    assertEquals(java.util.List.of(),loaded.contextPathsFor(root.resolve("projects/unknown")));
  }
  @Test void contextEvidenceUsesTheSettingKeyLine() throws Exception {
    Path file=root.resolve("config.json");Path project=root.resolve("projects/shop");
    Files.writeString(file,"{\n  \"projectRoot\": "+new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(root.resolve("projects").toString())+",\n  \"outputRoot\": "+new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(root.resolve("out").toString())+",\n  \"contextPaths\": {"+new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(project.toString())+":[\"/shop\"]}\n}");
    assertEquals(4,WorkspaceSettings.load(file).contextPathsLine());
  }

  @Test void savingAndLoadingWorkspaceAliasesUsesRealPaths() throws Exception {
    Path projectReal=Files.createDirectory(root.resolve("canonical-projects")),outputReal=Files.createDirectory(root.resolve("canonical-output"));
    Path projectAlias=root.resolve("project-alias"),outputAlias=root.resolve("output-alias");
    Files.createSymbolicLink(projectAlias,projectReal);Files.createSymbolicLink(outputAlias,outputReal);
    Path file=root.resolve("settings/config.json");new WorkspaceSettings(projectAlias,outputAlias).save(file);
    var saved=new com.fasterxml.jackson.databind.ObjectMapper().readTree(file.toFile());
    assertEquals(projectReal.toRealPath().toString(),saved.path("projectRoot").asText());
    assertEquals(outputReal.toRealPath().toString(),saved.path("outputRoot").asText());
    var loaded=WorkspaceSettings.load(file);assertEquals(projectReal.toRealPath(),loaded.projectRoot());assertEquals(outputReal.toRealPath(),loaded.outputRoot());
  }

  @Test void loadingLegacyWorkspaceConfigResolvesSymbolicLinkRoots() throws Exception {
    Path projectReal=Files.createDirectory(root.resolve("project-real")),outputReal=Files.createDirectory(root.resolve("output-real"));
    Path projectAlias=root.resolve("project-alias"),outputAlias=root.resolve("output-alias");
    Files.createSymbolicLink(projectAlias,projectReal);Files.createSymbolicLink(outputAlias,outputReal);
    Path file=root.resolve("legacy.json");var json=new com.fasterxml.jackson.databind.ObjectMapper();
    Files.writeString(file,json.writeValueAsString(java.util.Map.of("projectRoot",projectAlias.toString(),"outputRoot",outputAlias.toString())));
    var loaded=WorkspaceSettings.load(file);assertEquals(projectReal.toRealPath(),loaded.projectRoot());assertEquals(outputReal.toRealPath(),loaded.outputRoot());
  }

  @Test @EnabledOnOs(OS.WINDOWS) void windowsDriveCaseAndMixedSeparatorsResolveToTheSameWorkspace() throws Exception {
    Path actual=Files.createDirectories(root.resolve("WindowsRoot/nested")),output=Files.createDirectory(root.resolve("WindowsOutput"));
    String real=actual.toRealPath().toString(),driveVariant=(Character.isLowerCase(real.charAt(0))?Character.toUpperCase(real.charAt(0)):Character.toLowerCase(real.charAt(0)))+real.substring(1);
    Path mixed=Path.of(driveVariant.replace('\\','/'));Path file=root.resolve("windows.json");
    new WorkspaceSettings(mixed,output).save(file);
    assertEquals(actual.toRealPath().toString(),new com.fasterxml.jackson.databind.ObjectMapper().readTree(file.toFile()).path("projectRoot").asText());
  }
}
