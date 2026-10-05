package io.screentrace.report;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class Wp28PreviewBasisTest {
 @TempDir Path root;
 @Test void readerRejectsUnknownBasisAndIncompleteOrFalseAnchorCandidateLists()throws Exception {
  var source=new SourceLocation("page.jsp",1);var proof=List.of(new AnalysisEvidence(source,"FixtureParser",ResolutionStatus.CONFIRMED,null));
  var nodes=new ArrayList<GraphNode>();nodes.add(new GraphNode("screen",NodeType.SCREEN,"Screen",Map.of("view","page.jsp"),source,Confidence.CONFIRMED,proof));
  var edges=new ArrayList<Relationship>();for(String id:List.of("a","b")){nodes.add(new GraphNode(id,NodeType.COMPONENT,id,Map.of("kind","LINK","expansionAnchor","page.jsp:1"),source,Confidence.CONFIRMED,proof));edges.add(new Relationship("contains-"+id,EdgeType.CONTAINS,"screen",id,Confidence.CONFIRMED,source,proof));}
  var graph=new ApplicationGraph(new Application("fixture",".",List.of()),nodes,edges,List.of(),List.of(),"2.2",List.of(),List.of());
  var element=new LinkedHashMap<String,Object>(Map.of("path","body>a[1]","tag","a","styleId","s","defaultId","d","matchBasis","ANCHOR","expansionAnchor","page.jsp:1","graphComponentCandidates",List.of("a","b"),"componentResolution","AMBIGUOUS"));
  Files.createDirectories(root.resolve("static-preview"));var mapper=new ObjectMapper();var baseline=new PreviewModel("2",List.of(),List.of());
  for(String issue:List.of("basis","anchor","candidates")){
   var changed=new LinkedHashMap<>(element);if(issue.equals("basis"))changed.put("matchBasis","GUESSED");if(issue.equals("anchor"))changed.put("expansionAnchor","wrong");if(issue.equals("candidates"))changed.put("graphComponentCandidates",List.of("a"));
   mapper.writeValue(root.resolve("static-preview/element-styles.json").toFile(),Map.of("version","2","schemaVersion","2.2","screens",Map.of("screen",Map.of("elements",List.of(changed))),"styles",Map.of("s",Map.of()),"defaults",Map.of("d",Map.of())));
   assertThrows(java.io.IOException.class,()->new PreviewCaptureReader().read(graph,baseline,root),issue);
  }
  mapper.writeValue(root.resolve("static-preview/element-styles.json").toFile(),Map.of("version","2","schemaVersion","2.2","screens",Map.of("screen",Map.of("elements",List.of(element))),"styles",Map.of("s",Map.of()),"defaults",Map.of("d",Map.of())));
  var data=mapper.valueToTree(new PreviewCaptureReader().read(graph,baseline,root));assertEquals("ANCHOR",data.path("elements").get(0).path("matchBasis").asText());assertEquals("page.jsp:1",data.path("elements").get(0).path("expansionAnchor").asText());
 }
}
