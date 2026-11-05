package io.screentrace.core;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class ApiUsageTest {
  GraphNode node(String id, NodeType type) { return new GraphNode(id,type,id,Map.of(),null,Confidence.CONFIRMED); }
  Relationship edge(String id, EdgeType type, String from, String to) { return new Relationship(id,type,from,to,Confidence.CONFIRMED,null); }
  ApplicationGraph graph(boolean load) {
    var edges = new ArrayList<>(List.of(edge("a",EdgeType.CONTAINS,"s1","c"),edge("b",EdgeType.CONTAINS,"s2","c"),edge("c",EdgeType.TRIGGERS,"c","api")));
    if(load) edges.add(edge("d",EdgeType.CALLS,"s1","api"));
    return new ApplicationGraph(new Application("sample",".",List.of()),List.of(node("s1",NodeType.SCREEN),node("s2",NodeType.SCREEN),node("c",NodeType.COMPONENT),node("api",NodeType.ENDPOINT),node("unused",NodeType.ENDPOINT)),edges,List.of());
  }
  @Test void sharedComponentCallsComeFromEveryOwningScreenWithoutMutatingInput() {
    for(boolean load: List.of(false,true)) {
      var graph=graph(load);var before=graph.relationships();
      var result=ApiUsage.derive(graph);
      assertEquals(ApiUsage.Status.IN_USE,result.get("api").status());
      assertEquals(load?List.of(new ApiUsage.Caller("s1",null,null),new ApiUsage.Caller("s1","c",null),new ApiUsage.Caller("s2","c",null)):List.of(new ApiUsage.Caller("s1","c",null),new ApiUsage.Caller("s2","c",null)),result.get("api").callers());
      assertEquals(ApiUsage.Status.UNREFERENCED,result.get("unused").status());
      assertEquals(List.of(),result.get("unused").callers());
      assertEquals(before,graph.relationships());
    }
  }
  @Test void behaviorCallsFollowComponentOwnershipIncludingChildCallbacks() {
    var graph=graph(false);
    var evidence=List.of(new AnalysisEvidence(new SourceLocation("a.jsp",1),"Fixture",ResolutionStatus.CONFIRMED,null));
    var behaviors=List.of(new Behavior("ajax","c","click",BehaviorType.CALL_API,"api",null,null,null,evidence),new Behavior("child",null,"success",BehaviorType.CALL_API,"api",null,"ajax",null,evidence));
    var rich=new ApplicationGraph(graph.application(),graph.nodes(),graph.relationships(),List.of(),List.of(),"2.1",behaviors,List.of());
    var result=ApiUsage.derive(rich);
    assertEquals(ApiUsage.Status.IN_USE,result.get("api").status());
    assertEquals(List.of(new ApiUsage.Caller("s1","c","ajax"),new ApiUsage.Caller("s1","c","child"),new ApiUsage.Caller("s2","c","ajax"),new ApiUsage.Caller("s2","c","child")),result.get("api").callers());
  }
  @Test void pageLoadApiBehaviorIsOneScreenCaller() {
    var proof=List.of(new AnalysisEvidence(new SourceLocation("page.jsp",1),"AcornStaticAnalyzer",ResolutionStatus.CONFIRMED,"ready API"));
    var graph=new ApplicationGraph(new Application("sample",".",List.of()),List.of(node("screen",NodeType.SCREEN),node("api",NodeType.ENDPOINT)),List.of(),List.of(),List.of(),"2.1",List.of(new Behavior("load","screen","ready",BehaviorType.CALL_API,"api",null,null,"fetch('/api')",proof)),List.of());
    assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph).get("api").status());
    assertEquals(1,ApiUsage.derive(graph).get("api").callers().size());
  }
  @Test void unresolvedEventBindingRetainsKnownScreenCallerAndApiUsage() {
    var proof=List.of(new AnalysisEvidence(new SourceLocation("app.js",4),"AcornStaticAnalyzer",ResolutionStatus.UNRESOLVED,"selector 原文：#missing"));
    var graph=new ApplicationGraph(new Application("sample",".",List.of()),List.of(node("screen",NodeType.SCREEN),node("api",NodeType.ENDPOINT)),List.of(),List.of(),List.of(),"2.1",List.of(new Behavior("failed","screen","click",BehaviorType.CALL_API,"api",null,null,"fetch('/api')",proof)),List.of());
    var usage=ApiUsage.derive(graph).get("api");
    assertEquals(ApiUsage.Status.IN_USE,usage.status());assertEquals("failed",usage.callers().get(0).behaviorId());assertEquals("screen",usage.callers().get(0).screenId());assertNull(usage.callers().get(0).componentId());
    assertEquals(ResolutionStatus.UNRESOLVED,graph.behaviors().get(0).evidence().get(0).resolution());assertTrue(graph.behaviors().get(0).evidence().get(0).detail().contains("#missing"));
  }
  @Test void simplifiedScreenEdgeDoesNotDuplicateItsCanonicalLoadBehavior() {
    var proof=List.of(new AnalysisEvidence(new SourceLocation("page.jsp",1),"AcornStaticAnalyzer",ResolutionStatus.CONFIRMED,"fetch"));
    var graph=new ApplicationGraph(new Application("sample",".",List.of()),List.of(node("screen",NodeType.SCREEN),node("api",NodeType.ENDPOINT)),List.of(edge("load-edge",EdgeType.CALLS,"screen","api")),List.of(),List.of(),"2.1",List.of(new Behavior("load","screen","load",BehaviorType.CALL_API,"api",null,null,"fetch('/api')",proof)),List.of());
    assertEquals(1,ApiUsage.derive(graph).get("api").callers().size());
  }
  @Test void nullApiTargetWithoutOtherCallsIsUnreferenced() {
    var base=graph(false);
    var graph=new ApplicationGraph(base.application(),base.nodes(),List.of(),List.of(),List.of(),"2.2",
        List.of(new Behavior("null","s1","click",BehaviorType.CALL_API,null,null,null,null,List.of())),List.of());
    var usage=ApiUsage.derive(graph);
    assertEquals(ApiUsage.Status.UNREFERENCED,usage.get("api").status());
    assertEquals(List.of(),usage.get("api").callers());
  }
  @Test void nullApiTargetCoexistsWithValidCalls() {
    var base=graph(false);
    var graph=new ApplicationGraph(base.application(),base.nodes(),List.of(),List.of(),List.of(),"2.2",
        List.of(new Behavior("null","s1","click",BehaviorType.CALL_API,null,null,null,null,List.of()),
            new Behavior("valid","s2","ready",BehaviorType.CALL_API,"api",null,null,null,List.of())),List.of());
    assertEquals(new ApiUsage.Usage(ApiUsage.Status.IN_USE,List.of(new ApiUsage.Caller("s2",null,"valid"))),
        ApiUsage.derive(graph).get("api"));
  }
  @Test void nullRelationshipTargetsDoNotQueryCallerTreeMap() {
    var base=graph(false);
    var graph=new ApplicationGraph(base.application(),base.nodes(),List.of(
        edge("null-call",EdgeType.CALLS,"s1",null),edge("null-trigger",EdgeType.TRIGGERS,"c",null),
        edge("valid",EdgeType.CALLS,"s2","api")),List.of(),List.of(),"2.2",List.of(),List.of());
    assertEquals(new ApiUsage.Usage(ApiUsage.Status.IN_USE,List.of(new ApiUsage.Caller("s2",null,null))),
        ApiUsage.derive(graph).get("api"));
  }
  static Set<String> names(com.fasterxml.jackson.databind.JsonNode node) { var result=new TreeSet<String>();node.fieldNames().forEachRemaining(result::add);return result; }
  @Test void derivesSharedJavaAndTypeScriptVectors() throws Exception {
    var root=java.nio.file.Path.of("").toAbsolutePath();
    while(root!=null && !(java.nio.file.Files.isRegularFile(root.resolve("pom.xml")) && java.nio.file.Files.isDirectory(root.resolve("screentrace-core")))) root=root.getParent();
    assertNotNull(root,"Repository source root must exist without requiring .git");
    var mapper=new com.fasterxml.jackson.databind.ObjectMapper();
    var vectors=mapper.readTree(root.resolve("docs/examples/api-usage-vectors.json").toFile());
    assertEquals(1,vectors.path("format_version").asInt());
    var covered=new TreeSet<String>();
    assertFalse(vectors.path("cases").isEmpty());
    for(var vector:vectors.path("cases")) {
      String id=vector.path("id").asText();
      vector.path("rules").forEach(rule->covered.add(rule.asText()));
      var graph=mapper.treeToValue(vectors.path("graphs").path(vector.path("graph").asText()),ApplicationGraph.class);
      // Java derives callers only; the viewer applies decisions. Whatever the decisions, the callers are the same,
      // and an API is UNREFERENCED exactly when the shared expectation says so.
      var actual=ApiUsage.derive(graph);
      assertEquals(names(vector.path("expected")),actual.keySet(),id);
      for(var entry:actual.entrySet()) {
        var expected=vector.path("expected").path(entry.getKey());
        assertEquals(expected.path("callers"),mapper.valueToTree(entry.getValue().callers()),id+" "+entry.getKey());
        assertEquals("UNREFERENCED".equals(expected.path("status").asText()),entry.getValue().status()==ApiUsage.Status.UNREFERENCED,id+" "+entry.getKey());
      }
    }
    assertEquals(Set.of("R-API-1","R-API-2","R-API-3","R-API-4","R-API-5","R-API-6"),covered);
  }
}
