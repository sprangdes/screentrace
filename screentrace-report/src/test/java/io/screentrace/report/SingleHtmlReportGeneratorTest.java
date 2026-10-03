package io.screentrace.report;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class SingleHtmlReportGeneratorTest {
 static final String EVIL="</script><script>globalThis.targetProbe=1</script><img src='https://example.invalid/probe' onerror='globalThis.targetProbe=2'>\u2028\u2029";
 static ApplicationGraph graph(String version){var source=new SourceLocation("page.jsp",1);var proof=List.of(new AnalysisEvidence(source,"FixtureParser",ResolutionStatus.CONFIRMED,null));return new ApplicationGraph(new Application("fixture",".",List.of()),List.of(new GraphNode("screen",NodeType.SCREEN,EVIL,Map.of("route",EVIL,"view","page.jsp"),source,Confidence.CONFIRMED,proof)),List.of(),List.of(),List.of(),version,List.of(),List.of());}
 @Test void generatesOfflineEscapedStrictDataWithBuildHashAndSizeReport() throws Exception {
  var output=Path.of("target/viewer-fixtures").toAbsolutePath();Files.createDirectories(output);
  var preview=new PreviewModel("2",List.of(new PreviewModel.PreviewScreen("screen",null,null,1440,900,new PreviewModel.Rendering("reconstructed",null),List.of("${name}"),null,List.of())),List.of(),List.of(),Map.of(),Map.of(),List.of());
  var result=new SingleHtmlReportGenerator().generate(graph("2.2"),preview,Map.of("screen","<html><body><button>示例</button><script>parent.targetProbe=3</script></body></html>"),Map.of(),output);
  var html=Files.readString(result.path());assertEquals("screentrace-report.html",result.path().getFileName().toString());
  assertTrue(html.contains("\\u003c/script>"));assertFalse(html.contains(EVIL));assertTrue(html.contains("\\u2028\\u2029"));
  assertTrue(html.contains("script-src 'sha256-"));assertFalse(html.contains("script-src 'unsafe-inline'"));assertTrue(html.contains("style-src 'unsafe-inline'"));
  assertEquals(Files.size(result.path()),result.bytes());assertFalse(result.warning());
  assertTrue(Files.exists(output.resolve("report-size.json")));assertTrue(html.contains("id=\"st-data\""));
 }
 @Test void refusesHistoricalGraphBeforeWriting() throws Exception {var dir=Files.createTempDirectory("single-report-reject");var error=assertThrows(IllegalArgumentException.class,()->new SingleHtmlReportGenerator().generate(graph("2.1"),new PreviewModel("1",List.of(),List.of()),Map.of(),Map.of(),dir));assertTrue(error.getMessage().contains("2.2"));assertFalse(Files.exists(dir.resolve("report")));}
 @Test void sizeWarningDoesNotRejectLargeOutput(){assertFalse(SingleHtmlReportGenerator.sizeWarning(100_000_000));assertTrue(SingleHtmlReportGenerator.sizeWarning(100_000_001));}
 @Test void actualHtmlOverOneHundredMegabytesIsWrittenAndOnlyWarns() throws Exception {
  var root=Files.createTempDirectory("viewer-large-output");
  try {var output=new SingleHtmlReportGenerator().generate(graph("2.2"),new PreviewModel("2",List.of(),List.of()),Map.of(),Map.of("largeFixture","x".repeat(100_000_001)),root);
   assertTrue(output.warning());assertTrue(output.bytes()>100_000_000);assertEquals(Files.size(output.path()),output.bytes());assertTrue(Files.readString(root.resolve("report-size.json")).contains("超過 100 MB"));
  } finally {try(var files=Files.walk(root)){for(var file:files.sorted(Comparator.reverseOrder()).toList())Files.delete(file);}}
 }
 @Test void injectsBuildToolVersionForMarkdownHeader() throws Exception {var root=Files.createTempDirectory("viewer-tool-version");var result=new SingleHtmlReportGenerator().generate(graph("2.2"),new PreviewModel("2",List.of(),List.of()),Map.of(),Map.of(),root);var html=Files.readString(result.path());var match=java.util.regex.Pattern.compile("<script id=\"st-data\" type=\"application/json\">(.*?)</script>",java.util.regex.Pattern.DOTALL).matcher(html);assertTrue(match.find());assertEquals("0.1.0-SNAPSHOT",new com.fasterxml.jackson.databind.ObjectMapper().readTree(match.group(1)).path("toolVersion").asText());}
}
