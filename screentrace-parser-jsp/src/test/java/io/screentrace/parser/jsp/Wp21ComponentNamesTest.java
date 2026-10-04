package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
class Wp21ComponentNamesTest {
 private ApplicationGraph graph() throws Exception {
  Path root=Path.of("../fixtures/r5/wp21").toAbsolutePath().normalize();
  var jsp=new JspProjectParser().analyze(root,List.of(root.resolve("page.jsp")));
  var source=new SourceLocation("page.jsp",1);var proof=List.of(new AnalysisEvidence(source,"Fixture",ResolutionStatus.CONFIRMED,"synthetic"));
  return MarkupGraphContribution.enrich(new ApplicationGraph(new Application("synthetic",".",List.of()),List.of(new GraphNode("screen",NodeType.SCREEN,"Page",Map.of("view","page.jsp"),source,Confidence.CONFIRMED,proof)),List.of(),List.of(),List.of(),"2.2",List.of(),List.of()),jsp);
 }
 private GraphNode by(String key,String value) throws Exception{return graph().nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&value.equals(n.attributes().get(key))).findFirst().orElseThrow();}
 @Test void eachTagInvocationUsesItsOwnNestedBodyAndKeepsOriginalTitleAndEvidence() throws Exception {
  for(var row:Map.of("/home","Home","/find","Find records").entrySet()){
   var n=by("href",row.getKey());assertEquals(row.getValue(),n.name());assertNotNull(n.attributes().get("title"));assertTrue(n.evidence().stream().anyMatch(e->e.source().file().equals("page.jsp")));assertTrue(n.evidence().stream().anyMatch(e->e.source().file().endsWith("item.tag")));
  }
 }
 @Test void nestedTagBodyIsProvenWithoutPreviewDom(){assertDoesNotThrow(()->assertEquals("Nested body",by("href","/nested").name()));}
 @Test void dynamicAndEmptyBodiesFallBackWithoutElOrGuessing() throws Exception {assertEquals("Safe title",by("href","/dynamic").name());assertEquals("Empty title",by("href","/empty").name());assertEquals("Unknown fallback",by("id","unknown-wrapper").name());}
 @Test void accessibleTitleNameAndIdFollowDeclaredPriority() throws Exception {assertEquals("Accessible label",by("id","aria").name());assertEquals("Title label",by("id","title").name());assertEquals("Named",by("id","named").name());assertEquals("identified",by("id","identified").name());}
 @Test void unnamedDynamicControlsUseReadableKindAndOrdinal() throws Exception {assertTrue(graph().nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&"button".equals(n.attributes().get("tag"))).allMatch(n->n.name().matches("按鈕 [0-9]+")));assertTrue(by("href","/fallback").name().matches("連結 [0-9]+"));}
 @Test void onlyProvenWrappersSupplyText() throws Exception {assertEquals("Constant & label",by("id","literal").name());assertEquals("Literal message",by("id","message").name());assertEquals("Message fallback",by("id","message-code").name());assertEquals("Conditional fallback",by("id","conditional").name());}
 @Test void normalizationLimitsFortyCodePointsAndRetainsOriginalText() throws Exception {var n=by("id","normalization");assertEquals("This is a very long visible label with mo…",n.name());assertTrue(n.attributes().get("visibleText").contains("more than forty"));}
 @Test void hiddenTextIsNotVisibleAndStableIdsRemainUnchanged() throws Exception {assertEquals("Visible",by("id","hidden").name());var first=graph();assertEquals(first,graph());var root=Path.of("../fixtures/r5/wp21").toAbsolutePath().normalize();var expanded=new JspTagFileExpander().expand(root,"page.jsp",java.nio.file.Files.readString(root.resolve("page.jsp")));assertEquals(MarkupAnalysis.parse("page.jsp",expanded.text()).components().stream().map(MarkupAnalysis.Component::id).sorted().toList(),first.nodes().stream().filter(n->n.type()==NodeType.COMPONENT).map(GraphNode::id).sorted().toList());}
}
