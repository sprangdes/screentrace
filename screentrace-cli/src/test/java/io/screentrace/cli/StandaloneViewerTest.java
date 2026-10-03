package io.screentrace.cli;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;import io.screentrace.scanner.*;import io.screentrace.report.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;import java.util.*;import org.junit.jupiter.api.Test;
class StandaloneViewerTest {
 private static Path root(){for(Path path=Path.of("").toAbsolutePath();path!=null;path=path.getParent())if(Files.isRegularFile(path.resolve("pom.xml"))&&Files.isDirectory(path.resolve("screentrace-core")))return path;throw new IllegalStateException("Source root missing");}
 @Test void retiredServerAndInlineReportAreAbsent() throws Exception {var source=Files.readString(root().resolve("screentrace-cli/src/main/java/io/screentrace/cli/ScreenTraceCli.java"));assertFalse(source.contains("HttpServer"));assertFalse(source.contains("HttpExchange"));assertFalse(source.contains("X-ScreenTrace-Token"));assertFalse(source.contains("handleReviewResult"));assertFalse(Files.exists(root().resolve("screentrace-report/src/main/java/io/screentrace/report/ReportGenerator.java")));assertFalse(Files.exists(root().resolve("screentrace-report/src/main/resources/report/workflow-canvas.css")));assertTrue(source.contains("SingleHtmlAnalysisWriter"));assertTrue(source.contains("pack-preview.mjs"));}
 @Test void actualCliGraphProducesOnlyStrictStandaloneViewerAndLegacyJsonExportStillWorks() throws Exception {var project=Files.createTempDirectory("viewer-cli-project");Files.writeString(project.resolve("pom.xml"),"<project><dependencies><dependency><artifactId>spring-webmvc</artifactId></dependency></dependencies></project>");Files.writeString(project.resolve("Controller.java"),"import org.springframework.web.bind.annotation.*; @RestController class Controller { @GetMapping(\"/api\") String api(){return \"ok\";} }");var method=ScreenTraceCli.class.getDeclaredMethod("analyze",ProjectScanner.ProjectInventory.class);method.setAccessible(true);var graph=(ApplicationGraph)method.invoke(null,new ProjectScanner().scan(project));assertEquals("2.2",graph.schemaVersion());GraphIntegrityValidator.requireAnalysis(graph);var output=Files.createTempDirectory("viewer-cli-analysis");var result=new SingleHtmlAnalysisWriter().generate(graph,output);assertTrue(Files.exists(result.path()));assertEquals("screentrace-report.html",result.path().getFileName().toString());assertFalse(Files.exists(output.resolve("report/index.html")));assertEquals("2.2",new ObjectMapper().readTree(output.resolve("application-graph.json").toFile()).path("schemaVersion").asText());assertTrue(Files.readString(result.path()).contains("script-src 'sha256-"));new ReviewResultGenerator().write(output,output.resolve("review-result.json"));assertFalse(Files.readString(output.resolve("review-result.json")).contains("歷史資料,未經 2.2 證據驗證"));}
 @Test void actualProjectAnalysisPackagesCapturedJspIntoSingleFile() throws Exception {
  var source=Files.createTempDirectory("viewer-cli-jsp");Files.writeString(source.resolve("pom.xml"),"<project><dependencies><dependency><artifactId>spring-webmvc</artifactId></dependency></dependencies></project>");
  Files.writeString(source.resolve("Controller.java"),"import org.springframework.stereotype.Controller; import org.springframework.web.bind.annotation.*; @Controller class Controller { @GetMapping(\"/page\") String page(){return \"page\";} }");
  var web=Files.createDirectories(source.resolve("src/main/webapp/WEB-INF/views"));Files.writeString(web.resolve("page.jsp"),"<html><body><button style='color:red'>確認</button><script>fetch('https://target-probe.invalid/')</script></body></html>");
  var outputRoot=Files.createTempDirectory("viewer-cli-full");var output=outputRoot.resolve("project");var project=new ProjectCatalog.Project("project",source,output);
  var method=ScreenTraceCli.class.getDeclaredMethod("analyze",ProjectCatalog.Project.class,WorkspaceSettings.class);method.setAccessible(true);method.invoke(null,project,new WorkspaceSettings(source.getParent(),outputRoot));
  var json=new ObjectMapper();assertEquals("2.2",json.readTree(output.resolve("application-graph.json").toFile()).path("schemaVersion").asText());
  assertEquals("2",json.readTree(output.resolve("preview-model.json").toFile()).path("version").asText());
  assertTrue(json.readTree(output.resolve("preview-model.json").toFile()).path("elements").size()>0);
  assertTrue(Files.exists(output.resolve("viewer-documents.json")));assertTrue(Files.exists(output.resolve("report/screentrace-report.html")));
  assertFalse(json.readTree(output.resolve("viewer-documents.json").toFile()).path("documents").toString().contains("<script>"));
 }
 @Test void newReportEntryRejectsHistoricalArchiveBeforeCreatingHtml() throws Exception {
  var output=Files.createTempDirectory("viewer-historical-reject");
  Files.writeString(output.resolve("application-graph.json"),"{\"schemaVersion\":\"2.1\",\"application\":{\"name\":\"history\",\"path\":\".\",\"technologies\":[]},\"nodes\":[],\"relationships\":[],\"diagnostics\":[],\"apiContracts\":[],\"behaviors\":[],\"validationRules\":[]}");
  var error=assertThrows(IllegalArgumentException.class,()->new SingleHtmlAnalysisWriter().generate(output));assertTrue(error.getMessage().contains("2.2"));assertTrue(error.getMessage().contains("2.1"));assertFalse(Files.exists(output.resolve("report")));
 }
}
