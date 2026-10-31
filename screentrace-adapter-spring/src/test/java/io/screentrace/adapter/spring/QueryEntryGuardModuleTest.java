package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

/** CR-008: a query-entry guard imported from its own module splits the route exactly as a guard in the route file does. */
class QueryEntryGuardModuleTest {
 @TempDir Path root;

 private static final String SESSION = """
   import {createContext,useContext,useState} from 'react';
   export const Session=createContext(null);
   export function Provider({children}){const [subject,store]=useState(null);return <Session.Provider value={{subject,store}}>{children}</Session.Provider>;}
   export function useSession(){return useContext(Session);}
   """;
 private static final String GATE = """
   import {Navigate,useLocation} from 'react-router-dom';import {useSession} from './Session';
   export function EntryGate({children}){const {subject}=useSession();const where=useLocation();const sso=new URLSearchParams(where.search).get('sso');if(sso==='ok'||sso==='err')return children;if(!subject)return children;return <Navigate to="/"/>;}
   """;
 private static final String APP = """
   import {createRoot} from 'react-dom/client';import {Routes,Route,Link} from 'react-router-dom';import {Provider} from './Session';%s
   function Home(){return <p>Home</p>;}
   function SignIn(){return <section><h1>Sign in</h1></section>;}
   function Elsewhere(){return <section><h1>Elsewhere</h1><Link to="/signin">Plain</Link><Link to="/signin?sso=ok">Callback</Link></section>;}
   function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/signin" element={<EntryGate><SignIn/></EntryGate>}/><Route path="/elsewhere" element={<Elsewhere/>}/></Routes>;}
   createRoot(document.getElementById('root')).render(<Provider><App/></Provider>);
   """;

 private ApplicationGraph analyze(boolean separateGate) throws Exception {
  Files.writeString(root.resolve("Session.tsx"), SESSION);
  if (separateGate) {
   Files.writeString(root.resolve("Gate.tsx"), GATE);
   Files.writeString(root.resolve("App.tsx"), APP.formatted("import {EntryGate} from './Gate';"));
  } else {
   Files.writeString(root.resolve("App.tsx"), APP.formatted(GATE.replace("import {useSession} from './Session';", "import {useSession} from './Session';\n").replace("export function", "function")));
  }
  return new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
 }

 private static List<String> signInEntries(ApplicationGraph graph) {
  return graph.nodes().stream().filter(n -> n.type() == NodeType.SCREEN && "/signin".equals(n.attributes().get("route")))
    .map(n -> n.attributes().getOrDefault("entryQuery", "plain")).sorted().toList();
 }

 @Test void sameFileGuardSplitsTheRoute() throws Exception {
  assertEquals(List.of("plain", "sso=err|ok"), signInEntries(analyze(false)));
 }

 @Test void importedGuardSplitsTheRouteToo() throws Exception {
  assertEquals(List.of("plain", "sso=err|ok"), signInEntries(analyze(true)));
 }

 @Test void linksIntoAnImportedGuardSelectTheVariantByQuery() throws Exception {
  ApplicationGraph graph = analyze(true);
  Map<String, GraphNode> nodes = new HashMap<>();
  graph.nodes().forEach(n -> nodes.put(n.id(), n));
  String elsewhere = graph.nodes().stream().filter(n -> n.type() == NodeType.SCREEN && "/elsewhere".equals(n.attributes().get("route"))).findFirst().orElseThrow().id();
  Map<String, Set<String>> targets = new TreeMap<>();
  for (var contains : graph.relationships()) if (contains.type() == EdgeType.CONTAINS && contains.from().equals(elsewhere))
   for (var navigation : graph.relationships()) if (navigation.type() == EdgeType.NAVIGATES_TO && navigation.from().equals(contains.to()))
    targets.computeIfAbsent(nodes.get(contains.to()).name(), k -> new TreeSet<>()).add(nodes.get(navigation.to()).attributes().getOrDefault("entryQuery", "plain"));
  assertEquals(Map.of("Callback", Set.of("sso=err|ok"), "Plain", Set.of("plain")), targets);
 }
}
