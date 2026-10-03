package io.screentrace.adapter.struts;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class UrlLinkingTest {
 @TempDir Path root;
 ApplicationGraph graph(String js) throws Exception {var web=root.resolve("src/main/webapp");Files.createDirectories(web.resolve("WEB-INF"));Files.writeString(web.resolve("page.jsp"),"<form action='/shop/save.do' method='post'><button type='submit'>Save</button></form><script>"+js+"</script>");Files.writeString(web.resolve("WEB-INF/struts-config.xml"),"<struts-config><action-mappings><action path='/save' type='SaveAction'/></action-mappings></struts-config>");Files.writeString(root.resolve("SaveAction.java"),"class SaveAction extends Action {public ActionForward execute(ActionMapping m, ActionForm f, HttpServletRequest req,HttpServletResponse res){return null;}}");Files.writeString(web.resolve("WEB-INF/web.xml"),"<web-app><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root).withContextPaths(List.of("/shop"),"/Users/private/.screentrace/config.json"));}
 @Test void actionsReceiveApiAndFormCallersWithAllExtensionCandidates() throws Exception {var g=graph("fetch('/shop/save.do');");var endpoints=g.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&!n.attributes().containsKey("origin")).map(GraphNode::id).sorted().toList();assertFalse(endpoints.isEmpty());assertTrue(g.relationships().stream().anyMatch(e->e.type()==EdgeType.TRIGGERS&&endpoints.contains(e.to())));assertEquals(endpoints,g.relationships().stream().filter(e->e.type()==EdgeType.CALLS&&e.confidence()==Confidence.AMBIGUOUS).map(Relationship::to).sorted().toList());assertDoesNotThrow(()->GraphIntegrityValidator.validate(g));assertFalse(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(g).contains("/Users/private"));}
 @Test void explicitUnknownHttpMethodNeverMatchesAnyAction() throws Exception {var g=graph("fetch('/shop/save.do',{method:input});");assertFalse(g.relationships().stream().anyMatch(e->e.type()==EdgeType.CALLS));assertTrue(g.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).allMatch(b->b.targetId()==null));}
}
