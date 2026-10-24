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
  assertDoesNotThrow(()->GraphIntegrityValidator.requireAnalysis(graph));
 }
}
