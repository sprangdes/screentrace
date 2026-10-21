package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import io.screentrace.scanner.ProjectScanner;
import org.junit.jupiter.api.Test;
class Batch4ThymeleafIdentityTest {
 @Test void repeatedProjectionPreservesAttributesAndComponentIds()throws Exception {
  String raw="<a href=\"fallback\" th:href=\"@{/items/delete/{id}(id=${item.id})}\" onclick=\"return confirm('Delete?')\">Delete</a><input name=\"fallback\" th:field=\"*{title}\">";
  String once=ThymeleafMarkup.normalize(raw);assertEquals(once,ThymeleafMarkup.normalize(once));
  Path r=Files.createTempDirectory("batch4-thymeleaf");Path f=r.resolve("page.html");Files.writeString(f,raw);var inventory=new ProjectScanner().scan(r);var markup=new JspProjectParser().analyze(inventory.root(),inventory.files());var scripts=ScriptSources.collect(inventory);
  String id=markup.markup().get("page.html").components().stream().filter(c->c.tag().equals("a")).findFirst().orElseThrow().id();
  assertEquals(id,scripts.scripts().stream().filter(s->s.event().equals("click")).findFirst().orElseThrow().componentId());
 }
 @Test void unknownFieldProjectionIsAlsoIdempotent(){String raw="<input name=\"fallback\" th:field=\"${dynamicField}\">";String once=ThymeleafMarkup.normalize(raw);assertEquals(once,ThymeleafMarkup.normalize(once));}
 @Test void stylesheetReferencesAreEvidenceArtifactsWithoutInflatingControlCounts()throws Exception {
  Path r=Files.createTempDirectory("batch4-resources");Files.writeString(r.resolve("page.html"),"<link rel=\"stylesheet\" th:href=\"@{/css/page.css}\"><link rel=\"stylesheet\" th:href=\"${dynamic}\"><button>Go</button>");var inventory=new ProjectScanner().scan(r);
  var graph=new io.screentrace.core.ApplicationGraph(new io.screentrace.core.ApplicationGraph.Application("test",inventory.root().toString(),java.util.List.of()),java.util.List.of(),java.util.List.of(),java.util.List.of());
  var enriched=ResourceGraphContribution.enrich(graph,inventory);assertEquals(2,enriched.nodes().size());assertTrue(enriched.nodes().stream().allMatch(n->n.type()==io.screentrace.core.ApplicationGraph.NodeType.SOURCE_ARTIFACT));assertTrue(enriched.nodes().stream().anyMatch(n->n.attributes().get("href").equals("/css/page.css")&&n.evidence().stream().anyMatch(e->e.parser().equals("StaticResourceParser"))));assertTrue(enriched.nodes().stream().anyMatch(n->n.confidence()==io.screentrace.core.ApplicationGraph.Confidence.UNRESOLVED));
 }

}
