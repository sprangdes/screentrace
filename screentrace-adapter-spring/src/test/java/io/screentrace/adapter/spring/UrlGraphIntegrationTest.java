package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class UrlGraphIntegrationTest {
 @TempDir Path root;
 ApplicationGraph graph(String page,String controller,String config) throws Exception {
  var web=root.resolve("src/main/webapp");Files.createDirectories(web);Files.writeString(web.resolve("page.jsp"),page);
  Files.writeString(root.resolve("Controller.java"),"import org.springframework.web.bind.annotation.*;@RestController class Controller {"+controller+"}");
  if(config!=null)Files.writeString(root.resolve("application.properties"),"server.servlet.context-path="+config);
  return new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
 }
 GraphNode endpoint(ApplicationGraph g,String path,String method){return g.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&!"javascript-request".equals(n.attributes().get("origin"))&&path.equals(n.attributes().get("path"))&&method.equals(n.attributes().get("httpMethod"))).findFirst().orElseThrow();}
 @Test void loadFailedBindingAndFormReachBackendEndpoints() throws Exception {
  var g=graph("<form action='/shop/form' method='post'><button type='submit'>Save</button></form><script>fetch('${pageContext.request.contextPath}/api');$('#missing').click(function(){fetch('/shop/api');});</script>","@GetMapping(\"/api\") String api(){return \"ok\";}@PostMapping(\"/form\") String save(){return \"ok\";}","/shop");
  var api=endpoint(g,"/api","GET");var form=endpoint(g,"/form","POST");
  assertEquals(2,g.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API&&api.id().equals(b.targetId())).count());
  assertTrue(g.relationships().stream().anyMatch(e->e.type()==EdgeType.CALLS&&e.to().equals(api.id())));
  assertTrue(g.relationships().stream().anyMatch(e->e.type()==EdgeType.TRIGGERS&&e.to().equals(form.id())));
  assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(g,Map.of(),Map.of()).get(api.id()).status());
  assertTrue(g.behaviors().stream().anyMatch(b->api.id().equals(b.targetId())&&b.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.UNRESOLVED&&e.detail().contains("#missing"))));
  assertDoesNotThrow(()->GraphIntegrityValidator.validate(g));
 }
 @Test void ambiguityListsAllCandidatesAndDoesNotChooseBehaviorTarget() throws Exception {
  var g=graph("<script>fetch('/api/7');</script>","@GetMapping(\"/api/{id}\") String one(){return \"a\";}@GetMapping(\"/api/*\") String two(){return \"b\";}","");
  var candidates=g.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&!n.attributes().containsKey("origin")).map(GraphNode::id).sorted().toList();
  var call=g.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).findFirst().orElseThrow();assertNull(call.targetId());
  assertTrue(call.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.AMBIGUOUS&&candidates.stream().allMatch(e.detail()::contains)));
  assertEquals(candidates,g.relationships().stream().filter(e->e.type()==EdgeType.CALLS&&e.confidence()==Confidence.AMBIGUOUS).map(Relationship::to).sorted().toList());
 }
 @Test void methodMismatchAndUnknownContextNeverReachBackend() throws Exception {
  var g=graph("<script>fetch('/api',{method:'POST'});fetch('${ctx}/api');</script>","@GetMapping(\"/api\") String api(){return \"ok\";}","/shop");var api=endpoint(g,"/api","GET");
  assertFalse(g.relationships().stream().anyMatch(e->Set.of(EdgeType.CALLS,EdgeType.TRIGGERS).contains(e.type())&&e.to().equals(api.id())));
  assertTrue(g.diagnostics().stream().anyMatch(d->d.code().equals("URL_METHOD_MISMATCH")));
  assertTrue(g.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).allMatch(b->b.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.UNRESOLVED)));
 }
 @Test void onlyProvenContextAliasIsExpanded() throws Exception {
  var g=graph("<c:set var='ctx' value='${pageContext.request.contextPath}'/><script>fetch('${ctx}/api');</script>","@GetMapping(\"/api\") String api(){return \"ok\";}","/shop");var api=endpoint(g,"/api","GET");
  assertTrue(g.behaviors().stream().anyMatch(b->api.id().equals(b.targetId())&&b.evidence().stream().anyMatch(e->e.detail().contains("context 別名")&&e.source().file().endsWith("page.jsp"))));
 }
 @Test void actualContextAbsentNeverResolvesStandardExpression() throws Exception {
  var g=graph("<script>fetch('${pageContext.request.contextPath}/api');</script>","@GetMapping(\"/api\") String api(){return \"ok\";}",null);var api=endpoint(g,"/api","GET");
  assertFalse(g.relationships().stream().anyMatch(e->e.type()==EdgeType.CALLS&&e.to().equals(api.id())));assertTrue(g.diagnostics().stream().anyMatch(d->d.code().equals("CONTEXT_PATH_UNSPECIFIED")));
 }
 @Test void graphNeverSerializesTheHomeDirectoryOrSettingsPath() throws Exception {
  String previous=System.getProperty("user.home");String fakeHome=root.toString();
  try {System.setProperty("user.home",fakeHome);var g=graph("<script>fetch('/api');</script>","@GetMapping(\"/api\") String api(){return \"ok\";}","");String json=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(g);assertFalse(json.contains(fakeHome));assertFalse(json.contains(fakeHome+"/.screentrace/config.json"));}
  finally {System.setProperty("user.home",previous);}
 }
 @Test void reassignedContextAliasesRemainUnresolved() throws Exception {
  var g=graph("<c:set var='ctx' value='${pageContext.request.contextPath}'/><c:set var='ctx' value='/other'/><script>fetch('${ctx}/api');</script>","@GetMapping(\"/api\") String api(){return \"ok\";}","/shop");var api=endpoint(g,"/api","GET");assertFalse(g.relationships().stream().anyMatch(e->e.type()==EdgeType.CALLS&&e.to().equals(api.id())));
 }
 @Test void workspaceCandidateChangesAreVisibleAndPrivacySafe() throws Exception {
  graph("<script>fetch('/shop/api');</script>","@GetMapping(\"/api\") String api(){return \"ok\";}",null);var inventory=new ProjectScanner().scan(root);
  var one=new SpringMvcAnalyzer().analyze(inventory.withContextPaths(List.of("/shop"),7));var two=new SpringMvcAnalyzer().analyze(inventory.withContextPaths(List.of("/other"),7));assertNotEquals(one,two);
  assertTrue(one.behaviors().stream().anyMatch(b->b.evidence().stream().anyMatch(e->e.source().file().equals("workspace:config.json")&&e.source().line()==7&&e.detail().contains("採用值=/shop"))));
 }
}
