package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** A React full-page load of a server page (native link, location assignment) navigates to the screen its handler renders; fetch does not. */
class ReactServerPageNavigationTest {
 @TempDir Path root;

 private static final String APP = """
   import {createRoot} from 'react-dom/client';import {Routes,Route,Link} from 'react-router-dom';
   function Home(){return <section>
     <a href="/page">Anchor page</a>
     <button onClick={()=>{window.location.href='/page';}}>Location page</button>
     <button onClick={()=>fetch('/page')}>Fetch page</button>
     <Link to="/other">Client route</Link>
   </section>;}
   function Other(){return <p>Other</p>;}
   function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/other" element={<Other/>}/></Routes>;}
   createRoot(document.getElementById('root')).render(<App/>);
   """;

 private ApplicationGraph analyze() throws Exception {
  var jsp = root.resolve("src/main/webapp/WEB-INF/jsp/page.jsp");
  Files.createDirectories(jsp.getParent());
  Files.writeString(jsp, "<p>server page</p>");
  Files.writeString(root.resolve("C.java"), "@Controller class C { @GetMapping(\"/page\") String page(){return \"page\";} }");
  Files.writeString(root.resolve("App.tsx"), APP);
  return new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root));
 }

 private static Map<String, Set<String>> navigations(ApplicationGraph graph) {
  Map<String, GraphNode> nodes = new HashMap<>();
  graph.nodes().forEach(n -> nodes.put(n.id(), n));
  Map<String, Set<String>> result = new TreeMap<>();
  for (var edge : graph.relationships()) if (edge.type() == EdgeType.CONTAINS && nodes.get(edge.to()).type() == NodeType.COMPONENT) {
   var targets = result.computeIfAbsent(nodes.get(edge.to()).name(), k -> new TreeSet<>());
   for (var navigation : graph.relationships()) if (navigation.type() == EdgeType.NAVIGATES_TO && navigation.from().equals(edge.to())) targets.add(nodes.get(navigation.to()).name());
  }
  return result;
 }

 @Test void fullPageLoadsOfAServerPageNavigateToItsScreen() throws Exception {
  var graph = analyze();
  assertEquals(Map.of("Anchor page", Set.of("page"), "Location page", Set.of("page"), "Fetch page", Set.of(), "Client route", Set.of("other")), navigations(graph));
 }

 @Test void aResolvedFullPageLinkGetsNoPlaceholderNavigation() throws Exception {
  var graph = analyze();
  var anchor = graph.nodes().stream().filter(n -> n.type() == NodeType.COMPONENT && n.name().equals("Anchor page")).findFirst().orElseThrow().id();
  var unresolved = graph.behaviors().stream().filter(b -> anchor.equals(b.triggerId()) && b.type() == BehaviorType.NAVIGATE && b.targetId() == null).toList();
  assertEquals(List.of(), unresolved);
 }
}
