package io.screentrace.core;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static io.screentrace.core.ApplicationGraph.*;
class PersonaFlowsTest {
 final SourceLocation source=new SourceLocation("fixture",1);
 GraphNode node(String id,NodeType t,Map<String,String> attrs){return new GraphNode(id,t,id,attrs,source,Confidence.INFERRED,List.of(new AnalysisEvidence(source,"Fixture",ResolutionStatus.INFERRED,null)));}
 Relationship edge(String id,EdgeType t,String a,String b){return new Relationship(id,t,a,b,Confidence.INFERRED,source);}
 Behavior behavior(String id,String trigger){return new Behavior(id,trigger,"click",BehaviorType.NAVIGATE,null,null,null,id,List.of());}
 ApplicationGraph graph(PersonaStatus nav,boolean redirect,boolean missing,List<String> starts){
  var nodes=List.of(node("E",NodeType.ENTRY_POINT,Map.of("path","/")),node("F",NodeType.ENTRY_POINT,Map.of("path","/x")),node("A",NodeType.SCREEN,Map.of()),node("B",NodeType.SCREEN,Map.of()),node("X",NodeType.SCREEN,Map.of()),node("Y",NodeType.SCREEN,Map.of()),node("c",NodeType.COMPONENT,Map.of("kind","LINK")));
  var edges=List.of(edge("e",EdgeType.RENDERS,"E","A"),edge("f",EdgeType.RENDERS,"F","X"),edge("c",EdgeType.CONTAINS,"A","c"));
  var navs=new ArrayList<PersonaNavigation>();navs.add(new PersonaNavigation("b1",nav,List.of(redirect?"X":"B")));if(redirect)navs.add(new PersonaNavigation("b2",PersonaStatus.APPLIES,List.of("Y")));
  var statuses=new HashMap<String,PersonaStatus>();statuses.put("A",PersonaStatus.APPLIES);statuses.put("B",PersonaStatus.APPLIES);statuses.put("X",PersonaStatus.EXCLUDED);statuses.put("Y",PersonaStatus.APPLIES);
  var p=new Persona("guest","訪客",List.of(new AudienceAtom("me",false,new SourceLocation("workspace:config.json",3))),starts,statuses,navs,null);
  var bs=new ArrayList<Behavior>();bs.add(behavior("b1","c"));if(redirect)bs.add(behavior("b2","F"));if(missing)bs.add(behavior("b3","B"));
  return new ApplicationGraph(new Application("x",".",List.of(),List.of(),List.of(),List.of(p)),nodes,edges,List.of(),List.of(),"2.4",bs,List.of());
 }
 PersonaFlow flow(ApplicationGraph g){return PersonaFlows.enrich(g).application().personas().get(0).flow();}
 @Test void reachableUsesShortestDepth(){var f=flow(graph(PersonaStatus.APPLIES,false,false,List.of("/")));assertTrue(f.reached().contains(new PersonaReach("A","REACHABLE",1)));assertTrue(f.reached().contains(new PersonaReach("B","REACHABLE",2)));}
 @Test void unknownMakesPossible(){assertTrue(flow(graph(PersonaStatus.UNKNOWN,false,false,List.of("/"))).reached().contains(new PersonaReach("B","POSSIBLE",2)));}
 @Test void excludedTargetContinuesViaEntryRedirect(){var f=flow(graph(PersonaStatus.APPLIES,true,false,List.of("/")));assertTrue(f.reached().contains(new PersonaReach("Y","REACHABLE",3)));assertTrue(f.steps().stream().anyMatch(s->s.from().equals("A")&&s.to().equals("F")&&s.kind().equals("NAVIGATE")&&s.behaviorId().equals("b1")));assertTrue(f.steps().stream().anyMatch(s->s.from().equals("F")&&s.to().equals("Y")&&s.kind().equals("REDIRECT")&&s.behaviorId().equals("b2")));assertTrue(f.reached().stream().noneMatch(r->r.screenId().equals("X")));assertFalse(f.unreached().contains("X"));}
 @Test void unevaluatedCountedOnce(){assertEquals(1,flow(graph(PersonaStatus.APPLIES,false,true,List.of("/"))).unevaluatedNavigations());}
 @Test void missingStartDiagnosed(){var g=PersonaFlows.enrich(graph(PersonaStatus.APPLIES,false,false,List.of("/missing")));assertTrue(g.diagnostics().stream().anyMatch(d->d.code().equals("PERSONA_START_UNRESOLVED")));var f=g.application().personas().get(0).flow();assertTrue(f.reached().isEmpty());assertEquals(List.of("A","B","Y"),f.unreached());}
 @Test void emptyPersonasReturnSame(){var g=graph(PersonaStatus.APPLIES,false,false,List.of("/"));var empty=new ApplicationGraph(new Application("x",".",List.of()),g.nodes(),g.relationships(),g.diagnostics(),g.apiContracts(),g.schemaVersion(),g.behaviors(),g.validationRules());assertSame(empty,PersonaFlows.enrich(empty));}
}
