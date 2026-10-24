package io.screentrace.adapter.spring;

import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import io.screentrace.parser.jsp.ReactGraphContribution;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class ReactAudienceGraphTest {
 @TempDir Path root;
 @Test void variantsShareAnEntryPointAndSingleScreenRetainsItsOriginalId() throws Exception {
  Files.writeString(root.resolve("App.tsx"),"""
   import {Routes,Route,Navigate} from 'react-router-dom';
   function Public(){return <a href="/single">Enter</a>;}
   function Private(){return <button>Save</button>;}
   function Switch(){if(!person)return <Public/>;if(person?.level==='CURATOR')return <Private/>;return <Navigate to="/single"/>;}
   export default function App(){return <Routes><Route path="/" element={<Switch/>}/><Route path="/single" element={<Public/>}/></Routes>;}
   """);
  var graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
  var screens=graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN).toList();
  assertEquals(3,screens.size());assertEquals(2,screens.stream().filter(n->"/".equals(n.attributes().get("route"))).count());
  assertEquals(1,screens.stream().filter(n->"/".equals(n.attributes().get("route"))).map(n->n.attributes().get("entryPointId")).distinct().count());
  assertTrue(screens.stream().anyMatch(n->n.id().equals(ReactGraphContribution.screenId("App.tsx","/single"))));
  for(var screen:screens) {
   assertNotNull(screen.attributes().get("audienceSummary"));
   if("/".equals(screen.attributes().get("route")))assertEquals(ReactGraphContribution.screenId("App.tsx","/"),screen.attributes().get("supersedesScreenId"));
   else assertFalse(screen.attributes().containsKey("supersedesScreenId"));
   for(var atom:screen.audience())assertTrue(screen.evidence().stream().anyMatch(e->e.detail().contains(atom.text())&&e.source().equals(atom.source())));
  }
  assertDoesNotThrow(()->GraphIntegrityValidator.requireAnalysis(graph));
 }

 @Test void sharedLinkProjectionUsesItsSourceContextAndRecordsExcludedTargets() throws Exception {
  Files.writeString(root.resolve("App.tsx"),"""
   import {createContext,useContext,useState} from 'react';import {createRoot} from 'react-dom/client';import {Routes,Route,Link} from 'react-router-dom';
   const Session=createContext(null);
   function Provider({children}){const [subject,store]=useState(null);return <Session.Provider value={{subject,store}}>{children}</Session.Provider>;}
   function useSession(){return useContext(Session);}
   function Toolbar(){return <Link to="/">Overview</Link>;}
   function Guest(){return <p>Guest</p>;}function Lead(){return <p>Lead</p>;}
   function Home(){const {subject}=useSession();if(!subject)return <Guest/>;return <Lead/>;}
   function Guard({children}){const {subject}=useSession();if(!subject)return null;return children;}
   function App(){return <><Toolbar/><Routes><Route path="/" element={<Home/>}/><Route path="/desk" element={<Guard><p/></Guard>}/><Route path="/free" element={<p/>}/></Routes></>;}
   createRoot(document.getElementById('root')).render(<Provider><App/></Provider>);
   """);
  var graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
  var desk=graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&"/desk".equals(n.attributes().get("route"))).findFirst().orElseThrow();
  var component=graph.relationships().stream().filter(e->e.type()==EdgeType.CONTAINS&&e.from().equals(desk.id())).map(e->e.to()).findFirst().orElseThrow();
  var targets=graph.relationships().stream().filter(e->e.type()==EdgeType.NAVIGATES_TO&&e.from().equals(component)).map(e->graph.nodes().stream().filter(n->n.id().equals(e.to())).findFirst().orElseThrow()).toList();
  assertEquals(1,targets.size());assertTrue(targets.get(0).audience().stream().anyMatch(a->a.text().equals("subject")&&a.truth()));
  var behavior=graph.behaviors().stream().filter(b->b.triggerId().equals(component)&&b.type()==BehaviorType.NAVIGATE).findFirst().orElseThrow();
  assertTrue(behavior.evidence().stream().anyMatch(e->e.detail().startsWith("排除身分變體：")));
  assertTrue(behavior.evidence().stream().anyMatch(e->e.parser().equals("ReactAudienceTarget")&&e.detail().contains("condition")));
  var free=graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&"/free".equals(n.attributes().get("route"))).findFirst().orElseThrow();
  var freeComponent=graph.relationships().stream().filter(e->e.type()==EdgeType.CONTAINS&&e.from().equals(free.id())).map(e->e.to()).findFirst().orElseThrow();
  var choices=graph.relationships().stream().filter(e->e.type()==EdgeType.NAVIGATES_TO&&e.from().equals(freeComponent)).map(e->e.to()).sorted().toList();
  assertEquals(2,choices.size());
  var ambiguous=graph.behaviors().stream().filter(b->b.triggerId().equals(freeComponent)&&b.type()==BehaviorType.NAVIGATE).findFirst().orElseThrow();
  assertTrue(ambiguous.evidence().stream().anyMatch(e->e.detail().contains("全部候選="+choices)),"Simulator requires canonical candidate IDs in ambiguous navigation evidence");
  assertDoesNotThrow(()->GraphIntegrityValidator.requireAnalysis(graph));
 }

 @Test void audienceProjectionIsDeterministicAcrossIndependentJvmProcesses() throws Exception {
  sharedLinkProjectionUsesItsSourceContextAndRecordsExcludedTargets();
  String expected=null;
  for(int i=0;i<6;i++){
   var process=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java").toString(),"-cp",System.getProperty("java.class.path"),getClass().getName(),root.toString()).redirectErrorStream(true).start();
   String output=new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
   assertEquals(0,process.waitFor(),output);
   if(expected==null)expected=output;else assertEquals(expected,output,"Context projection must not depend on JVM collection iteration order");
  }
 }
 @Test void unknownDispatchRetainsInferredApiResolution() throws Exception {
  Files.writeString(root.resolve("App.tsx"),"""
   import {Routes,Route} from 'react-router-dom';import {useEffect} from 'react';
   function Page(){useEffect(()=>{const dispatch={one:()=>fetch('/api/one'),two:()=>fetch('/api/two')};dispatch[selected]()},[]);return <p/>;}
   function App(){return <Routes><Route path="/" element={<Page/>}/></Routes>;}
   """);
  Files.writeString(root.resolve("Endpoint.java"),"""
   import org.springframework.web.bind.annotation.*;
   @RestController class Endpoint{@GetMapping("/api/one") String one(){return "ok";}@GetMapping("/api/two") String two(){return "ok";}}
   """);
  var graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
  var calls=graph.relationships().stream().filter(e->e.type()==EdgeType.CALLS).toList();assertEquals(2,calls.size());
  assertTrue(calls.stream().allMatch(e->e.confidence()==Confidence.INFERRED));
  assertTrue(calls.stream().allMatch(e->e.evidence().stream().anyMatch(p->p.detail().contains("分派表，key 未定"))));
 }
 public static void main(String[] args) throws Exception {
  var graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(Path.of(args[0])));
  System.out.print(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(graph));
 }
}
