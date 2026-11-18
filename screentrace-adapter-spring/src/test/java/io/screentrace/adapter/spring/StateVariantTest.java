package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.ReactGraphContribution;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R80: a wizard whose steps are a proven page state becomes one screen variant per step. */
class StateVariantTest {
  @TempDir Path root;

  private static final String APP =
      """
   import {useState} from 'react';import {createRoot} from 'react-dom/client';import {Routes,Route,Link} from 'react-router-dom';
   type Step = 1 | 2 | 3;
   function Wizard(){const [step,setStep]=useState<Step>(1);
     const moveToStep=(nextStep: Step)=>{setStep(nextStep);};
     const submit=async()=>{try{await fetch('/api/reservations',{method:'POST'});}catch(e){if(e.status===409)setStep(2);}};
     return <div><h1>New reservation</h1>
       {step===1&&<section><button type="button" onClick={()=>moveToStep(2)}>To date</button></section>}
       {step===2&&<section><button type="button" onClick={()=>{fetch('/api/slots');}}>Slots</button><button type="button" onClick={()=>moveToStep(3)}>To confirm</button></section>}
       {step===3&&<section><button type="button" onClick={submit}>Submit</button></section>}
     </div>;}
   function Tabs(){const [tab,setTab]=useState('a');
     return <div><button type="button" onClick={()=>setTab('a')}>Tab A</button><button type="button" onClick={()=>setTab('b')}>Tab B</button>
       {tab==='a'&&<p>A</p>}{tab==='b'&&<button type="button" onClick={()=>{fetch('/api/b');}}>Load B</button>}</div>;}
   function Home(){return <section><Link to="/new">Book</Link><Link to="/tabs">Tabs</Link></section>;}
   function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/new" element={<Wizard/>}/><Route path="/tabs" element={<Tabs/>}/></Routes>;}
   createRoot(document.getElementById('root')).render(<App/>);
   """;

  private ApplicationGraph analyze() throws Exception {
    Files.writeString(root.resolve("App.tsx"), APP);
    return new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  private static Map<String, GraphNode> byState(ApplicationGraph graph, String route) {
    Map<String, GraphNode> result = new TreeMap<>();
    graph.nodes().stream()
        .filter(n -> n.type() == NodeType.SCREEN && route.equals(n.attributes().get("route")))
        .forEach(n -> result.put(n.attributes().getOrDefault("stateVariant", ""), n));
    return result;
  }

  private static String component(ApplicationGraph graph, String screenId, String label) {
    Map<String, GraphNode> nodes = new HashMap<>();
    graph.nodes().forEach(n -> nodes.put(n.id(), n));
    return graph.relationships().stream()
        .filter(e -> e.type() == EdgeType.CONTAINS && e.from().equals(screenId))
        .map(Relationship::to)
        .filter(id -> label.equals(nodes.get(id).name()))
        .findFirst()
        .orElseThrow(() -> new AssertionError("no " + label + " in " + screenId));
  }

  private static Set<String> targets(ApplicationGraph graph, String componentId) {
    Set<String> result = new TreeSet<>();
    graph.relationships().stream()
        .filter(e -> e.type() == EdgeType.NAVIGATES_TO && e.from().equals(componentId))
        .forEach(e -> result.add(e.to()));
    return result;
  }

  private static Set<String> contained(ApplicationGraph graph, String screenId) {
    Map<String, GraphNode> nodes = new HashMap<>();
    graph.nodes().forEach(n -> nodes.put(n.id(), n));
    Set<String> result = new TreeSet<>();
    graph.relationships().stream()
        .filter(e -> e.type() == EdgeType.CONTAINS && e.from().equals(screenId))
        .forEach(e -> result.add(nodes.get(e.to()).name()));
    return result;
  }

  @Test
  void eachStepIsAScreenAndTheFirstKeepsTheRouteScreenId() throws Exception {
    ApplicationGraph graph = analyze();
    var steps = byState(graph, "/new");
    assertEquals(Set.of("step = 1", "step = 2", "step = 3"), steps.keySet());
    GraphNode first = steps.get("step = 1");
    assertEquals(ReactGraphContribution.screenId("App.tsx", "/new"), first.id());
    assertFalse(first.attributes().containsKey("stateVariantOf"));
    assertEquals(first.id(), steps.get("step = 2").attributes().get("stateVariantOf"));
    assertEquals("new（step = 2）", steps.get("step = 2").name());
    assertEquals(Set.of("To date"), contained(graph, first.id()));
    assertEquals(Set.of("Slots", "To confirm"), contained(graph, steps.get("step = 2").id()));
    assertDoesNotThrow(() -> GraphIntegrityValidator.requireAnalysis(graph));
  }

  @Test
  void stepButtonsNavigateToTheNextStepAndLinksOpenTheFirstStep() throws Exception {
    ApplicationGraph graph = analyze();
    var steps = byState(graph, "/new");
    String one = steps.get("step = 1").id(),
        two = steps.get("step = 2").id(),
        three = steps.get("step = 3").id();
    assertEquals(Set.of(two), targets(graph, component(graph, one, "To date")));
    assertEquals(Set.of(three), targets(graph, component(graph, two, "To confirm")));
    assertEquals(Set.of(two), targets(graph, component(graph, three, "Submit")));
    String home = ReactGraphContribution.screenId("App.tsx", "/");
    assertEquals(Set.of(one), targets(graph, component(graph, home, "Book")));
    // Only the initial step is rendered by the URL entry point.
    assertEquals(
        Set.of(one),
        new TreeSet<>(
            graph.relationships().stream()
                .filter(
                    e -> e.type() == EdgeType.RENDERS && Set.of(one, two, three).contains(e.to()))
                .map(Relationship::to)
                .toList()));
  }

  @Test
  void apisBelongToTheStepThatCallsThem() throws Exception {
    ApplicationGraph graph = analyze();
    var steps = byState(graph, "/new");
    String submit = component(graph, steps.get("step = 3").id(), "Submit");
    assertTrue(
        graph.behaviors().stream()
            .anyMatch(
                b ->
                    b.triggerId().equals(submit)
                        && b.type() == BehaviorType.CALL_API
                        && b.targetId() != null));
    assertThrows(
        AssertionError.class, () -> component(graph, steps.get("step = 1").id(), "Submit"));
  }

  @Test
  void tabsWhoseButtonsAreAlwaysVisibleStayOneScreen() throws Exception {
    ApplicationGraph graph = analyze();
    assertEquals(Set.of(""), byState(graph, "/tabs").keySet());
  }
}
