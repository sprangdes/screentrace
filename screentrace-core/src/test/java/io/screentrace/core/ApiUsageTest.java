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
  @Test void exhaustivelyDerivesSharedComponentAndLoadDecisionsWithoutMutatingInput() {
    for(boolean load: List.of(false,true)) for(var s1:ApiUsage.Decision.values()) for(var s2:ApiUsage.Decision.values()) for(var c1:ApiUsage.Decision.values()) for(var c2:ApiUsage.Decision.values()) {
      var decisions=Map.of("s1",s1,"s2",s2);
      var components=Map.of(new ApiUsage.ComponentKey("s1","c"),c1,new ApiUsage.ComponentKey("s2","c"),c2);
      var result=ApiUsage.derive(graph(load),decisions,components);
      boolean removed=(s1==ApiUsage.Decision.REMOVE||c1==ApiUsage.Decision.REMOVE)&&(s2==ApiUsage.Decision.REMOVE||c2==ApiUsage.Decision.REMOVE)&&(!load||s1==ApiUsage.Decision.REMOVE);
      assertEquals(removed?ApiUsage.Status.REMOVABLE:ApiUsage.Status.IN_USE,result.get("api").status(),decisions+" "+components);
      assertEquals(load?3:2,result.get("api").callers().size());
      assertEquals(ApiUsage.Status.UNREFERENCED,result.get("unused").status());
      assertEquals(s1,decisions.get("s1"));
      assertEquals(c1,components.get(new ApiUsage.ComponentKey("s1","c")));
      assertEquals(c2,components.get(new ApiUsage.ComponentKey("s2","c")));
    }
    assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph(false),Map.of(),Map.of()).get("api").status());
  }
  @Test void behaviorCallsFollowComponentOwnershipIncludingChildCallbacks() {
    var graph=graph(false);
    var evidence=List.of(new AnalysisEvidence(new SourceLocation("a.jsp",1),"Fixture",ResolutionStatus.CONFIRMED,null));
    var behaviors=List.of(new Behavior("ajax","c","click",BehaviorType.CALL_API,"api",null,null,null,evidence),new Behavior("child",null,"success",BehaviorType.CALL_API,"api",null,"ajax",null,evidence));
    var rich=new ApplicationGraph(graph.application(),graph.nodes(),graph.relationships(),List.of(),List.of(),"2.1",behaviors,List.of());
    var result=ApiUsage.derive(rich,Map.of(),Map.of(new ApiUsage.ComponentKey("s1","c"),ApiUsage.Decision.REMOVE,new ApiUsage.ComponentKey("s2","c"),ApiUsage.Decision.REMOVE));
    assertEquals(ApiUsage.Status.REMOVABLE,result.get("api").status());
    assertEquals(4,result.get("api").callers().size());
  }
  @Test void sharedComponentHasIndependentDecisionsOnEachScreen() {
    var first=new ApiUsage.ComponentKey("s1","c");
    var second=new ApiUsage.ComponentKey("s2","c");
    assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph(false),Map.of(),Map.of(first,ApiUsage.Decision.REMOVE,second,ApiUsage.Decision.KEEP)).get("api").status());
    assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph(false),Map.of(),Map.of(first,ApiUsage.Decision.REMOVE,second,ApiUsage.Decision.UNDECIDED)).get("api").status());
    assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph(false),Map.of(),Map.of(first,ApiUsage.Decision.REMOVE)).get("api").status());
    assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph(false),Map.of(),Map.of(second,ApiUsage.Decision.REMOVE)).get("api").status());
    assertEquals(ApiUsage.Status.REMOVABLE,ApiUsage.derive(graph(false),Map.of(),Map.of(first,ApiUsage.Decision.REMOVE,second,ApiUsage.Decision.REMOVE)).get("api").status());
  }
  @Test void callbackUsesItsCallerScreenComponentDecision() {
    var graph=graph(false);
    var evidence=List.of(new AnalysisEvidence(new SourceLocation("a.jsp",1),"Fixture",ResolutionStatus.CONFIRMED,null));
    var rich=new ApplicationGraph(graph.application(),graph.nodes(),graph.relationships(),List.of(),List.of(),"2.1",
        List.of(new Behavior("ajax","c","click",BehaviorType.CALL_API,"api",null,null,null,evidence),new Behavior("child",null,"success",BehaviorType.CALL_API,"api",null,"ajax",null,evidence)),List.of());
    var result=ApiUsage.derive(rich,Map.of(),Map.of(new ApiUsage.ComponentKey("s1","c"),ApiUsage.Decision.REMOVE,new ApiUsage.ComponentKey("s2","c"),ApiUsage.Decision.KEEP));
    assertEquals(ApiUsage.Status.IN_USE,result.get("api").status());
    assertEquals(4,result.get("api").callers().size());
    assertEquals(ApiUsage.Status.REMOVABLE,ApiUsage.derive(rich,Map.of("s2",ApiUsage.Decision.REMOVE),Map.of(new ApiUsage.ComponentKey("s1","c"),ApiUsage.Decision.REMOVE,new ApiUsage.ComponentKey("s2","c"),ApiUsage.Decision.KEEP)).get("api").status());
  }
  @Test void pageLoadApiBehaviorCannotBeUnreferencedOrRemovedByComponentDecisions() {
    var proof=List.of(new AnalysisEvidence(new SourceLocation("page.jsp",1),"AcornStaticAnalyzer",ResolutionStatus.CONFIRMED,"ready API"));
    var graph=new ApplicationGraph(new Application("sample",".",List.of()),List.of(node("screen",NodeType.SCREEN),node("api",NodeType.ENDPOINT)),List.of(),List.of(),List.of(),"2.1",List.of(new Behavior("load","screen","ready",BehaviorType.CALL_API,"api",null,null,"fetch('/api')",proof)),List.of());
    assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph,Map.of(),Map.of(new ApiUsage.ComponentKey("screen","missing"),ApiUsage.Decision.REMOVE)).get("api").status());
    assertEquals(ApiUsage.Status.REMOVABLE,ApiUsage.derive(graph,Map.of("screen",ApiUsage.Decision.REMOVE),Map.of()).get("api").status());
    assertEquals(1,ApiUsage.derive(graph,Map.of(),Map.of()).get("api").callers().size());
  }
  @Test void unresolvedEventBindingRetainsKnownScreenCallerAndApiUsage() {
    var proof=List.of(new AnalysisEvidence(new SourceLocation("app.js",4),"AcornStaticAnalyzer",ResolutionStatus.UNRESOLVED,"selector 原文：#missing"));
    var graph=new ApplicationGraph(new Application("sample",".",List.of()),List.of(node("screen",NodeType.SCREEN),node("api",NodeType.ENDPOINT)),List.of(),List.of(),List.of(),"2.1",List.of(new Behavior("failed","screen","click",BehaviorType.CALL_API,"api",null,null,"fetch('/api')",proof)),List.of());
    var usage=ApiUsage.derive(graph,Map.of(),Map.of()).get("api");
    assertEquals(ApiUsage.Status.IN_USE,usage.status());assertEquals("failed",usage.callers().get(0).behaviorId());assertEquals("screen",usage.callers().get(0).screenId());assertNull(usage.callers().get(0).componentId());
    assertEquals(ResolutionStatus.UNRESOLVED,graph.behaviors().get(0).evidence().get(0).resolution());assertTrue(graph.behaviors().get(0).evidence().get(0).detail().contains("#missing"));
  }
  @Test void simplifiedScreenEdgeDoesNotDuplicateItsCanonicalLoadBehavior() {
    var proof=List.of(new AnalysisEvidence(new SourceLocation("page.jsp",1),"AcornStaticAnalyzer",ResolutionStatus.CONFIRMED,"fetch"));
    var graph=new ApplicationGraph(new Application("sample",".",List.of()),List.of(node("screen",NodeType.SCREEN),node("api",NodeType.ENDPOINT)),List.of(edge("load-edge",EdgeType.CALLS,"screen","api")),List.of(),List.of(),"2.1",List.of(new Behavior("load","screen","load",BehaviorType.CALL_API,"api",null,null,"fetch('/api')",proof)),List.of());
    assertEquals(1,ApiUsage.derive(graph,Map.of(),Map.of()).get("api").callers().size());
  }
}
