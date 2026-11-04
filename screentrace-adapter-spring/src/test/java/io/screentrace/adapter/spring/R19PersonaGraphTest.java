package io.screentrace.adapter.spring;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
class R19PersonaGraphTest {
 @TempDir Path root;
 void fixture() throws Exception {for(String name:List.of("auth.tsx","App.tsx","main.tsx")){Path p=root.resolve("src").resolve(name);Files.createDirectories(p.getParent());try(var in=getClass().getResourceAsStream("/r19/src/"+name)){Files.copy(in,p);}}}
 @Test void absentPersonasPreserveSchema() throws Exception {fixture();var graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));assertEquals("2.3",graph.schemaVersion());assertFalse(new ObjectMapper().writeValueAsString(graph).contains("persona"));}
 @Test void configuredEmptyPersonasProduceDimensions() throws Exception {fixture();var graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root).withPersonas(List.of(),3));assertEquals("2.4",graph.schemaVersion());assertFalse(graph.application().personaDimensions().isEmpty());assertTrue(graph.application().personas().isEmpty());}

 @Test void personaVerdictsMapToCanonicalIds() throws Exception {
  fixture();var settings=List.of(
   new io.screentrace.scanner.PersonaSetting("guest","訪客",List.of(new io.screentrace.scanner.PersonaSetting.Fact("loading",false),new io.screentrace.scanner.PersonaSetting.Fact("me",false)),List.of("/")),
   new io.screentrace.scanner.PersonaSetting("customer","顧客",List.of(new io.screentrace.scanner.PersonaSetting.Fact("loading",false),new io.screentrace.scanner.PersonaSetting.Fact("me",true),new io.screentrace.scanner.PersonaSetting.Fact("me.role === \"ROLE_USER\"",true)),List.of("/")),
   new io.screentrace.scanner.PersonaSetting("merchant","商家",List.of(new io.screentrace.scanner.PersonaSetting.Fact("loading",false),new io.screentrace.scanner.PersonaSetting.Fact("me",true),new io.screentrace.scanner.PersonaSetting.Fact("me.role === \"ROLE_BUSINESS\"",true)),List.of("/")));
  var inventory=new ProjectScanner().scan(root).withPersonas(settings,3);var g=new SpringBootAnalyzer().analyze(inventory);var json=new ObjectMapper();assertEquals(json.writeValueAsString(g),json.writeValueAsString(new SpringBootAnalyzer().analyze(inventory)));io.screentrace.core.GraphIntegrityValidator.requireAnalysis(g);
  var expected=java.util.Map.of("/",List.of("EXCLUDED","APPLIES","APPLIES"),"/login",List.of("APPLIES","APPLIES","APPLIES"),"/register",List.of("APPLIES","APPLIES","APPLIES"),"/dashboard",List.of("EXCLUDED","APPLIES","EXCLUDED"),"/reservations",List.of("EXCLUDED","APPLIES","EXCLUDED"),"/manage",List.of("EXCLUDED","EXCLUDED","APPLIES"),"/orphan",List.of("EXCLUDED","APPLIES","APPLIES"));
  var screens=g.nodes().stream().filter(n->n.type()==io.screentrace.core.ApplicationGraph.NodeType.SCREEN).toList();assertEquals(7,screens.size());for(int i=0;i<3;i++){var p=g.application().personas().get(i);assertEquals(7,p.screens().size());for(var screen:screens)assertEquals(expected.get(screen.attributes().get("route")).get(i),p.screens().get(screen.id()).name());}
  var dashboard=screens.stream().filter(n->"/dashboard".equals(n.attributes().get("route"))).findFirst().orElseThrow();var component=g.nodes().stream().filter(n->"Manage".equals(n.name())).filter(n->g.relationships().stream().anyMatch(e->e.from().equals(dashboard.id())&&e.to().equals(n.id()))).findFirst().orElseThrow();var behavior=g.behaviors().stream().filter(b->b.triggerId().equals(component.id())&&b.type()==io.screentrace.core.ApplicationGraph.BehaviorType.NAVIGATE).findFirst().orElseThrow();for(var p:g.application().personas()){var nav=p.navigations().stream().filter(n->n.behaviorId().equals(behavior.id())).findFirst().orElseThrow();assertEquals(io.screentrace.core.ApplicationGraph.PersonaStatus.APPLIES,nav.status());assertEquals(List.of(dashboard.id()),nav.targets());}
 }

 @Test void fixturePersonaFlowsMatchAppendixC() throws Exception {
  fixture();var settings=List.of(new io.screentrace.scanner.PersonaSetting("guest","訪客",List.of(new io.screentrace.scanner.PersonaSetting.Fact("loading",false),new io.screentrace.scanner.PersonaSetting.Fact("me",false)),List.of("/")),new io.screentrace.scanner.PersonaSetting("customer","顧客",List.of(new io.screentrace.scanner.PersonaSetting.Fact("loading",false),new io.screentrace.scanner.PersonaSetting.Fact("me",true),new io.screentrace.scanner.PersonaSetting.Fact("me.role === \"ROLE_USER\"",true)),List.of("/")),new io.screentrace.scanner.PersonaSetting("merchant","商家",List.of(new io.screentrace.scanner.PersonaSetting.Fact("loading",false),new io.screentrace.scanner.PersonaSetting.Fact("me",true),new io.screentrace.scanner.PersonaSetting.Fact("me.role === \"ROLE_BUSINESS\"",true)),List.of("/")));
  var g=io.screentrace.core.PersonaFlows.enrich(new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root).withPersonas(settings,3)));io.screentrace.core.GraphIntegrityValidator.requireAnalysis(g);
  var routes=new java.util.HashMap<String,String>();g.nodes().forEach(n->routes.put(n.id(),n.attributes().getOrDefault("route",n.attributes().get("path"))));
  var expected=List.of(java.util.Map.of("/login","REACHABLE:1","/register","REACHABLE:2"),java.util.Map.of("/","REACHABLE:1","/dashboard","REACHABLE:1","/reservations","REACHABLE:2"),java.util.Map.of("/","REACHABLE:1","/manage","REACHABLE:2"));
  var unreached=List.of(List.<String>of(),List.of("/login","/orphan","/register"),List.of("/login","/orphan","/register"));
  for(int i=0;i<3;i++){var f=g.application().personas().get(i).flow();var actual=new java.util.HashMap<String,String>();f.reached().forEach(r->actual.put(routes.get(r.screenId()),r.reach()+":"+r.depth()));assertEquals(expected.get(i),actual);assertEquals(unreached.get(i),f.unreached().stream().map(routes::get).sorted().toList());assertEquals(0,f.unevaluatedNavigations());}
  var steps=g.application().personas().get(2).flow().steps();assertTrue(steps.stream().anyMatch(s->"/".equals(routes.get(s.from()))&&"/dashboard".equals(routes.get(s.to()))&&s.kind().equals("REDIRECT")));assertTrue(steps.stream().anyMatch(s->"/dashboard".equals(routes.get(s.from()))&&"/manage".equals(routes.get(s.to()))&&s.kind().equals("REDIRECT")));
 }

 @Test void shellGuardRedirectLetsSetupPersonaReachSetup() throws Exception {
  fixture();Files.writeString(root.resolve("src/App.tsx"),"""
   import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
   import { useAuth } from './auth';
   
   function SetupGuard({ children }) {
     const { me } = useAuth();
     const location = useLocation();
     const allowPaths = ['/setup'];
     if (me?.role === 'ROLE_BUSINESS' && !me.business && !allowPaths.includes(location.pathname)) return <Navigate to="/setup" replace />;
     return children;
   }
   
   function LoginPage() {
     return <main><h1>Login</h1></main>;
   }
   
   function SetupPage() {
     return <main><h1>Setup</h1><Link to="/login">Login</Link></main>;
   }
   
   export default function App() {
     return (
       <SetupGuard>
         <Routes>
           <Route path="/login" element={<LoginPage />} />
           <Route path="/setup" element={<SetupPage />} />
         </Routes>
       </SetupGuard>
     );
   }
   """);
  var setting=new io.screentrace.scanner.PersonaSetting("merchant-setup","未開店商家",List.of(new io.screentrace.scanner.PersonaSetting.Fact("me.role === \"ROLE_BUSINESS\"",true),new io.screentrace.scanner.PersonaSetting.Fact("me.business",false)),List.of("/login"));
  var graph=io.screentrace.core.PersonaFlows.enrich(new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root).withPersonas(List.of(setting),3)));
  var setup=graph.nodes().stream().filter(n->n.type()==io.screentrace.core.ApplicationGraph.NodeType.SCREEN&&"/setup".equals(n.attributes().get("route"))).findFirst().orElseThrow();
  var login=graph.nodes().stream().filter(n->n.type()==io.screentrace.core.ApplicationGraph.NodeType.SCREEN&&"/login".equals(n.attributes().get("route"))).findFirst().orElseThrow();
  var entry=graph.nodes().stream().filter(n->n.type()==io.screentrace.core.ApplicationGraph.NodeType.ENTRY_POINT&&"/login".equals(n.attributes().get("path"))).findFirst().orElseThrow();
  var persona=graph.application().personas().get(0);assertEquals(io.screentrace.core.ApplicationGraph.PersonaStatus.APPLIES,persona.screens().get(setup.id()));assertEquals(io.screentrace.core.ApplicationGraph.PersonaStatus.EXCLUDED,persona.screens().get(login.id()));
  var flow=persona.flow();assertEquals(List.of(new io.screentrace.core.ApplicationGraph.PersonaReach(setup.id(),"REACHABLE",1)),flow.reached());assertTrue(flow.unreached().isEmpty());assertEquals(0,flow.unevaluatedNavigations());assertTrue(flow.steps().stream().anyMatch(step->step.from().equals(entry.id())&&step.to().equals(setup.id())&&step.kind().equals("REDIRECT")&&step.status()==io.screentrace.core.ApplicationGraph.PersonaStatus.APPLIES));assertDoesNotThrow(()->io.screentrace.core.GraphIntegrityValidator.requireAnalysis(graph));
 }
}
