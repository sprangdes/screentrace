package io.screentrace.report;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class Wp29PreviewReasonTest {
 @TempDir Path root;
 @Test void readerPreservesFiveReasonsAndRejectsInvalidScope()throws Exception {
  var source=new SourceLocation("page.jsp",1);var proof=List.of(new AnalysisEvidence(source,"Fixture",ResolutionStatus.CONFIRMED,null));
  var nodes=List.of(new GraphNode("screen",NodeType.SCREEN,"Screen",Map.of("view","page.jsp"),source,Confidence.CONFIRMED,proof),new GraphNode("c",NodeType.COMPONENT,"C",Map.of("kind","LINK"),source,Confidence.CONFIRMED,proof));
  var graph=new ApplicationGraph(new Application("fixture",".",List.of()),nodes,List.of(new Relationship("owns",EdgeType.CONTAINS,"screen","c",Confidence.CONFIRMED,source,proof)),List.of(),List.of(),"2.2",List.of(),List.of());
  var mapper=new ObjectMapper();Files.createDirectories(root.resolve("static-preview"));var baseline=new PreviewModel("2",List.of(),List.of());
  for(String reason:List.of("NO_GRAPH_COMPONENT","AMBIGUOUS_CANDIDATES","ANCHOR_MISSING","DYNAMIC_OR_UNRESOLVED_SOURCE","OTHER")){
   var e=new LinkedHashMap<String,Object>(Map.of("tag","a","path","body>a[1]","styleId","s","defaultId","d","componentResolution",reason.equals("AMBIGUOUS_CANDIDATES")?"AMBIGUOUS":"UNRESOLVED","unmappedReason",reason));write(mapper,e);
   assertEquals(reason,mapper.valueToTree(new PreviewCaptureReader().read(graph,baseline,root)).path("elements").get(0).path("unmappedReason").asText());
  }
  for(String issue:List.of("unknown","mapped","non-operable")){var e=new LinkedHashMap<String,Object>(Map.of("tag","a","path","body>a[1]","styleId","s","defaultId","d","componentResolution","UNRESOLVED","unmappedReason","OTHER"));if(issue.equals("unknown"))e.put("unmappedReason","UNKNOWN");if(issue.equals("mapped")){e.put("componentResolution","INFERRED");e.put("graphComponentId","c");e.put("graphComponentCandidates",List.of("c"));}if(issue.equals("non-operable"))e.put("tag","div");write(mapper,e);assertThrows(java.io.IOException.class,()->new PreviewCaptureReader().read(graph,baseline,root),issue);}
 }
 private void write(ObjectMapper m,Map<String,Object> e)throws Exception{m.writeValue(root.resolve("static-preview/element-styles.json").toFile(),Map.of("version","2","schemaVersion","2.2","screens",Map.of("screen",Map.of("elements",List.of(e))),"styles",Map.of("s",Map.of()),"defaults",Map.of("d",Map.of())));}
}
