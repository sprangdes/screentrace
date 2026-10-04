package io.screentrace.report;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class ReportApplicationPrivacyTest {
 @TempDir Path temp;
 @Test void reportRemovesActualProjectRootWithoutChangingCanonicalGraphOrFingerprint() throws Exception {
  Path project=temp.resolve("source-project"),output=temp.resolve("analysis-output");Files.createDirectories(project);
  var source=new SourceLocation("page.jsp",1);var evidence=List.of(new AnalysisEvidence(source,"Synthetic",ResolutionStatus.CONFIRMED,null));
  var graph=new ApplicationGraph(new Application("privacy fixture",project.toString(),List.of()),List.of(new GraphNode("screen",NodeType.SCREEN,"Page",Map.of(),source,Confidence.CONFIRMED,evidence)),List.of(),List.of(),List.of(),"2.2",List.of(),List.of());
  var writer=new SingleHtmlAnalysisWriter();writer.prepare(graph,output);byte[] canonical=Files.readAllBytes(output.resolve("application-graph.json"));
  String html=Files.readString(writer.generate(graph,output).path());
  for(String forbidden:List.of(project.toString(),output.toString(),System.getProperty("user.home"),"file://","/Users/","C:\\Users\\","C:\\\\Users\\\\"))assertFalse(html.contains(forbidden),"Local root leaked into report");
  var match=java.util.regex.Pattern.compile("<script id=\"st-data\" type=\"application/json\">(.*?)</script>",java.util.regex.Pattern.DOTALL).matcher(html);assertTrue(match.find());var data=new ObjectMapper().readTree(match.group(1));assertFalse(data.path("graph").path("application").has("path"));assertEquals("privacy fixture",data.path("graph").path("application").path("name").asText());
  var ordered=new ObjectMapper().enable(com.fasterxml.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);assertEquals(HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(ordered.writeValueAsBytes(graph))),data.path("fingerprint").asText());assertArrayEquals(canonical,Files.readAllBytes(output.resolve("application-graph.json")));
 }
}
