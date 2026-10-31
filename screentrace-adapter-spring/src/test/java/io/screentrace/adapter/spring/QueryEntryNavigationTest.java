package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

/** CR-007: navigate(), a native anchor and a location assignment keep their query for query-entry selection, as Link does. */
class QueryEntryNavigationTest {
 @TempDir Path root;

 private static final String APP = """
   import {createContext,useContext,useState} from 'react';import {createRoot} from 'react-dom/client';import {Routes,Route,Link,Navigate,useLocation,useNavigate} from 'react-router-dom';
   const Session=createContext(null);
   function Provider({children}){const [subject,store]=useState(null);return <Session.Provider value={{subject,store}}>{children}</Session.Provider>;}
   function useSession(){return useContext(Session);}
   function Home(){return <p>Home</p>;}
   function EntryGate({children}){const {subject}=useSession();const where=useLocation();const sso=new URLSearchParams(where.search).get('sso');if(sso==='ok'||sso==='err')return children;if(!subject)return children;return <Navigate to="/"/>;}
   function SignIn(){return <section><h1>Sign in</h1></section>;}
   function Elsewhere(){const navigate=useNavigate();return <section><h1>Elsewhere</h1>
     <Link to="/signin?sso=ok">Link callback</Link>
     <button onClick={()=>navigate('/signin?sso=ok')}>Button callback</button>
     <a href="/signin?sso=ok">Anchor callback</a>
     <button onClick={()=>{window.location.href='/signin?sso=err';}}>Location callback</button>
     <button onClick={()=>navigate('/signin')}>Button plain</button>
     <a href="/signin?next=x">Anchor other query</a>
   </section>;}
   function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/signin" element={<EntryGate><SignIn/></EntryGate>}/><Route path="/elsewhere" element={<Elsewhere/>}/></Routes>;}
   createRoot(document.getElementById('root')).render(<Provider><App/></Provider>);
   """;

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

 @Test void everyNavigationFormSelectsTheVariantByItsQuery() throws Exception {
  Files.writeString(root.resolve("App.tsx"), APP);
  ApplicationGraph graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
  List<GraphNode> signIn = graph.nodes().stream().filter(n -> n.type() == NodeType.SCREEN && "/signin".equals(n.attributes().get("route"))).toList();
  assertEquals(2, signIn.size(), signIn.toString());
  String plain = signIn.stream().filter(n -> !n.attributes().containsKey("entryQuery")).findFirst().orElseThrow().id();
  String query = signIn.stream().filter(n -> n.attributes().containsKey("entryQuery")).findFirst().orElseThrow().id();
  String elsewhere = graph.nodes().stream().filter(n -> n.type() == NodeType.SCREEN && "/elsewhere".equals(n.attributes().get("route"))).findFirst().orElseThrow().id();
  Map<String, Set<String>> actual = new TreeMap<>(), expected = new TreeMap<>();
  for (String label : List.of("Link callback", "Button callback", "Anchor callback", "Location callback")) { actual.put(label, targetsOf(graph, elsewhere, label)); expected.put(label, Set.of(query)); }
  for (String label : List.of("Button plain", "Anchor other query")) { actual.put(label, targetsOf(graph, elsewhere, label)); expected.put(label, Set.of(plain)); }
  assertEquals(expected, actual);
 }
}
