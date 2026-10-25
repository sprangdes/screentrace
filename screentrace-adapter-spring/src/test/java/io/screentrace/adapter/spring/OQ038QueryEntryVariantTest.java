package io.screentrace.adapter.spring;

import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import io.screentrace.parser.jsp.ReactGraphContribution;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

/** OQ-038: a guard that also admits a query-parameter entry splits the route into a plain-entry and a query-entry screen. */
class OQ038QueryEntryVariantTest {
 @TempDir Path root;

 private static final String APP = """
   import {createContext,useContext,useState} from 'react';import {createRoot} from 'react-dom/client';import {Routes,Route,Link,Navigate,useLocation} from 'react-router-dom';
   const Session=createContext(null);
   function Provider({children}){const [subject,store]=useState(null);return <Session.Provider value={{subject,store}}>{children}</Session.Provider>;}
   function useSession(){return useContext(Session);}
   function Guest(){return <p>Guest</p>;}function Lead(){return <p>Lead</p>;}
   function Home(){const {subject}=useSession();if(!subject)return <Guest/>;return <Lead/>;}
   function EntryGate({children}){const {subject}=useSession();const where=useLocation();const sso=new URLSearchParams(where.search).get('sso');if(sso==='ok'||sso==='err')return children;if(!subject)return children;return <Navigate to="/"/>;}
   function SignIn(){return <section><h1>Sign in</h1><Link to="/">Back home</Link></section>;}
   function Elsewhere(){return <section><h1>Elsewhere</h1><Link to="/signin">Plain</Link><Link to="/signin?sso=ok">Callback</Link><Link to="/signin?next=x">Other query</Link></section>;}
   function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/signin" element={<EntryGate><SignIn/></EntryGate>}/><Route path="/elsewhere" element={<Elsewhere/>}/></Routes>;}
   createRoot(document.getElementById('root')).render(<Provider><App/></Provider>);
   """;

 private ApplicationGraph analyze() throws Exception {
  Files.writeString(root.resolve("App.tsx"), APP);
  return new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
 }

 private static List<GraphNode> screens(ApplicationGraph graph, String route) {
  return graph.nodes().stream().filter(n -> n.type() == NodeType.SCREEN && route.equals(n.attributes().get("route"))).toList();
 }

 private static Set<String> targetsOf(ApplicationGraph graph, String screenId, String label) {
  Map<String, GraphNode> nodes = new HashMap<>();
  graph.nodes().forEach(n -> nodes.put(n.id(), n));
  Set<String> owned = new HashSet<>();
  graph.relationships().stream().filter(e -> e.type() == EdgeType.CONTAINS && e.from().equals(screenId)).forEach(e -> owned.add(e.to()));
  String component = owned.stream().filter(id -> label.equals(nodes.get(id).name())).findFirst().orElseThrow(() -> new AssertionError("no " + label + " in " + screenId));
  Set<String> targets = new TreeSet<>();
  graph.relationships().stream().filter(e -> e.type() == EdgeType.NAVIGATES_TO && e.from().equals(component)).forEach(e -> targets.add(e.to()));
  return targets;
 }

 @Test void queryEntrySplitsIntoPlainAndQueryVariantsAndThePlainVariantKeepsTheOriginalId() throws Exception {
  ApplicationGraph graph = analyze();
  List<GraphNode> signIn = screens(graph, "/signin");
  assertEquals(2, signIn.size(), signIn.toString());
  GraphNode plain = signIn.stream().filter(n -> !n.attributes().containsKey("entryQuery")).findFirst().orElseThrow();
  GraphNode query = signIn.stream().filter(n -> n.attributes().containsKey("entryQuery")).findFirst().orElseThrow();
  assertEquals(ReactGraphContribution.screenId("App.tsx", "/signin"), plain.id());
  assertFalse(plain.attributes().containsKey("supersedesScreenId"));
  assertEquals("sso=err|ok", query.attributes().get("entryQuery"));
  assertNotEquals(plain.id(), query.id());
  assertEquals(plain.attributes().get("entryPointId"), query.attributes().get("entryPointId"));
  assertDoesNotThrow(() -> GraphIntegrityValidator.requireAnalysis(graph));
 }

 @Test void thePlainVariantLinksHomeOnlyToTheGuestVariant() throws Exception {
  ApplicationGraph graph = analyze();
  List<GraphNode> signIn = screens(graph, "/signin");
  GraphNode plain = signIn.stream().filter(n -> !n.attributes().containsKey("entryQuery")).findFirst().orElseThrow();
  GraphNode query = signIn.stream().filter(n -> n.attributes().containsKey("entryQuery")).findFirst().orElseThrow();
  Set<String> home = new TreeSet<>(screens(graph, "/").stream().map(GraphNode::id).toList());
  assertEquals(2, home.size());
  Set<String> fromPlain = targetsOf(graph, plain.id(), "Back home");
  assertEquals(1, fromPlain.size(), fromPlain.toString());
  GraphNode target = graph.nodes().stream().filter(n -> n.id().equals(fromPlain.iterator().next())).findFirst().orElseThrow();
  assertTrue(target.audience().stream().anyMatch(a -> a.text().equals("subject") && !a.truth()), target.audience().toString());
  assertEquals(home, targetsOf(graph, query.id(), "Back home"));
 }

 @Test void linksSelectTheVariantByTheirQueryString() throws Exception {
  ApplicationGraph graph = analyze();
  List<GraphNode> signIn = screens(graph, "/signin");
  String plain = signIn.stream().filter(n -> !n.attributes().containsKey("entryQuery")).findFirst().orElseThrow().id();
  String query = signIn.stream().filter(n -> n.attributes().containsKey("entryQuery")).findFirst().orElseThrow().id();
  String elsewhere = screens(graph, "/elsewhere").get(0).id();
  assertEquals(Set.of(plain), targetsOf(graph, elsewhere, "Plain"));
  assertEquals(Set.of(query), targetsOf(graph, elsewhere, "Callback"));
  assertEquals(Set.of(plain), targetsOf(graph, elsewhere, "Other query"));
 }
}
