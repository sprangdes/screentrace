package io.screentrace.core;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static io.screentrace.core.ApplicationGraph.*;

/** R27: an entry point does not render a screen that needs a URL parameter; only a navigation to it does. */
class R27QueryVersionFlowTest {
 final SourceLocation source=new SourceLocation("fixture",1);
 GraphNode node(String id,NodeType t,Map<String,String> attrs){return new GraphNode(id,t,id,attrs,source,Confidence.INFERRED,List.of(new AnalysisEvidence(source,"Fixture",ResolutionStatus.INFERRED,null)));}
 Relationship edge(String id,EdgeType t,String a,String b){return new Relationship(id,t,a,b,Confidence.INFERRED,source);}
 Behavior behavior(String id,String trigger){return new Behavior(id,trigger,"click",BehaviorType.NAVIGATE,null,null,null,id,List.of());}

 /** Home links to /login; /login has a plain version P (excluded for this persona) and a parameter version Q. */
 PersonaFlow flow(boolean linkToQuery){
  var nodes=List.of(node("H0",NodeType.ENTRY_POINT,Map.of("path","/")),node("L0",NodeType.ENTRY_POINT,Map.of("path","/login")),
   node("H",NodeType.SCREEN,Map.of()),node("P",NodeType.SCREEN,Map.of()),node("Q",NodeType.SCREEN,Map.of("entryQuery","sso=ok")),
   node("c",NodeType.COMPONENT,Map.of("kind","LINK")),node("d",NodeType.COMPONENT,Map.of("kind","LINK")));
  var edges=List.of(edge("r1",EdgeType.RENDERS,"H0","H"),edge("r2",EdgeType.RENDERS,"L0","P"),edge("r3",EdgeType.RENDERS,"L0","Q"),edge("k1",EdgeType.CONTAINS,"H","c"),edge("k2",EdgeType.CONTAINS,"H","d"));
  var navs=new ArrayList<PersonaNavigation>();navs.add(new PersonaNavigation("plain",PersonaStatus.APPLIES,List.of("P")));
  var behaviors=new ArrayList<Behavior>();behaviors.add(behavior("plain","c"));
  if(linkToQuery){navs.add(new PersonaNavigation("query",PersonaStatus.APPLIES,List.of("Q")));behaviors.add(behavior("query","d"));}
  var statuses=new HashMap<String,PersonaStatus>();statuses.put("H",PersonaStatus.APPLIES);statuses.put("P",PersonaStatus.EXCLUDED);statuses.put("Q",PersonaStatus.UNKNOWN);
  var p=new Persona("customer","顧客",null,List.of(new AudienceAtom("me",true,new SourceLocation("workspace:config.json",3))),List.of("/"),statuses,navs,null);
  var g=new ApplicationGraph(new Application("x",".",List.of(),List.of(),List.of(),List.of(p)),nodes,edges,List.of(),List.of(),"2.4",behaviors,List.of());
  return PersonaFlows.enrich(g).application().personas().get(0).flow();
 }

 @Test void entryReachedByAPlainLinkDoesNotRenderTheParameterVersion(){
  var f=flow(false);
  assertTrue(f.steps().stream().anyMatch(s->s.from().equals("H")&&s.to().equals("L0")),"the link to the excluded plain version still falls back to the entry");
  assertTrue(f.reached().stream().noneMatch(r->r.screenId().equals("Q")),"the parameter version is not reached through the entry");
  assertTrue(f.steps().stream().noneMatch(s->s.to().equals("Q")));
  assertTrue(f.unreached().contains("Q"));
 }

 @Test void aLinkThatCarriesTheParameterStillReachesIt(){
  var f=flow(true);
  assertTrue(f.reached().contains(new PersonaReach("Q","POSSIBLE",2)));
  assertTrue(f.steps().stream().anyMatch(s->s.from().equals("H")&&s.to().equals("Q")&&"query".equals(s.behaviorId())));
 }
}
