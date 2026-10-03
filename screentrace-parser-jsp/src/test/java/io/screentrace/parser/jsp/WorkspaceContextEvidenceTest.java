package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class WorkspaceContextEvidenceTest {
 @TempDir Path workspace;
 @Test void explicitWorkspaceContextEvidenceMustSurviveStrictGraphValidation() throws Exception {
  var project=workspace.resolve("target-project");Files.createDirectories(project);var settings=workspace.resolve("config.json");Files.writeString(settings,"{\"contextPaths\":{\"target-project\":[\"/shop\"]}}");
  var inventory=new ProjectScanner().scan(project).withContextPaths(List.of("/shop"),settings.toString());
  var context=UrlResolution.context(inventory,List.of());var result=UrlResolution.resolve("/shop/api","GET",context,List.of(new UrlResolution.Endpoint("api","/api","GET",List.of())),false);
  assertEquals(Confidence.CONFIRMED,result.confidence());assertFalse(result.evidence().isEmpty());
  var node=new GraphNode("api",NodeType.ENDPOINT,"GET /api",Map.of("path","/api","httpMethod","GET"),new SourceLocation("Controller.java",1),Confidence.CONFIRMED,result.evidence());
  var graph=new ApplicationGraph(new Application("sample",project.toString(),List.of()),List.of(node),List.of(),List.of(),List.of(),"2.2",List.of(),List.of());
  assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
 }
 @Test void serializedEvidenceDoesNotExposeExternalSettingsOrHome() throws Exception {
  var project=workspace.resolve("project");Files.createDirectories(project);String home="/Users/fixture-secret-home";
  var inventory=new ProjectScanner().scan(project).withContextPaths(List.of("/shop"),home+"/.screentrace/config.json");
  var result=UrlResolution.resolve("/shop/api","GET",UrlResolution.context(inventory,List.of()),List.of(new UrlResolution.Endpoint("api","/api","GET",List.of())),false);
  var node=new GraphNode("api",NodeType.ENDPOINT,"GET /api",Map.of("path","/api","httpMethod","GET"),new SourceLocation("Controller.java",1),Confidence.CONFIRMED,result.evidence());
  var graph=new ApplicationGraph(new Application("sample",project.toString(),List.of()),List.of(node),List.of(),List.of(),List.of(),"2.2",List.of(),List.of());
  String json=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(graph);
  assertFalse(json.contains(home));assertTrue(json.contains("workspace:config.json"));
  assertTrue(result.evidence().stream().anyMatch(e->e.detail().contains("contextPaths")&&e.detail().contains("採用值=/shop")));
 }
}
