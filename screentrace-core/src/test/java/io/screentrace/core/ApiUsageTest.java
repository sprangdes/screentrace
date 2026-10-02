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
    for(boolean load: List.of(false,true)) for(var s1:ApiUsage.Decision.values()) for(var s2:ApiUsage.Decision.values()) for(var c:ApiUsage.Decision.values()) {
      var decisions=Map.of("s1",s1,"s2",s2,"c",c);
      var result=ApiUsage.derive(graph(load),decisions);
      boolean removed=(s1==ApiUsage.Decision.REMOVE||c==ApiUsage.Decision.REMOVE)&&(s2==ApiUsage.Decision.REMOVE||c==ApiUsage.Decision.REMOVE)&&(!load||s1==ApiUsage.Decision.REMOVE);
      assertEquals(removed?ApiUsage.Status.REMOVABLE:ApiUsage.Status.IN_USE,result.get("api").status(),decisions.toString());
      assertEquals(load?3:2,result.get("api").callers().size());
      assertEquals(ApiUsage.Status.UNREFERENCED,result.get("unused").status());
      assertEquals(s1,decisions.get("s1"));
    }
    assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph(false),Map.of()).get("api").status());
  }
  @Test void behaviorCallsFollowComponentOwnershipIncludingChildCallbacks() {
    var graph=graph(false);
    var evidence=List.of(new AnalysisEvidence(new SourceLocation("a.jsp",1),"Fixture",ResolutionStatus.CONFIRMED,null));
    var behaviors=List.of(new Behavior("ajax","c","click",BehaviorType.CALL_API,"api",null,null,null,evidence),new Behavior("child",null,"success",BehaviorType.CALL_API,"api",null,"ajax",null,evidence));
    var rich=new ApplicationGraph(graph.application(),graph.nodes(),graph.relationships(),List.of(),List.of(),"2.1",behaviors,List.of());
    var result=ApiUsage.derive(rich,Map.of("c",ApiUsage.Decision.REMOVE));
    assertEquals(ApiUsage.Status.REMOVABLE,result.get("api").status());
    assertEquals(4,result.get("api").callers().size());
  }
}
