package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;

class Wp18ControllerFlowTest {
  static ApplicationGraph graph;
  @BeforeAll static void analyze() throws Exception {
    graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(Path.of("../fixtures/r3/wp18").toAbsolutePath().normalize()));
  }
  GraphNode handler(String method) {return graph.nodes().stream().filter(n->n.type()==NodeType.HANDLER&&method.equals(n.attributes().get("method"))).findFirst().orElseThrow();}
  GraphNode screen(String view) {return graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&n.attributes().getOrDefault("view","").endsWith("records/"+view+".jsp")).findFirst().orElseThrow();}
  GraphNode component(String name) {return graph.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&n.name().equals(name)).findFirst().orElseThrow();}
  List<Relationship> returns(String method) {return graph.relationships().stream().filter(e->e.from().equals(handler(method).id())&&Set.of(EdgeType.RENDERS,EdgeType.FORWARDS_TO).contains(e.type())).toList();}
  @Test void concatenatedRedirectHasInferredTemplateAndActualReturnEvidence() {
    var edges=returns("save").stream().filter(e->e.type()==EdgeType.FORWARDS_TO).toList();assertEquals(1,edges.size());
    var edge=edges.get(0);assertEquals(screen("detail").id(),edge.to());assertEquals(Confidence.INFERRED,edge.confidence());
    assertEquals(11,edge.source().line());assertTrue(edge.source().file().endsWith("RecordController.java"));
    assertTrue(edge.evidence().stream().anyMatch(e->e.detail()!=null&&e.detail().contains("RecordController.save")&&e.detail().contains("record.identity()")&&e.detail().contains("/records/{")));
  }
  @Test void formSubmitPreservesErrorSelfReturnAndAddsSuccessDetailFlowWithCompleteChainEvidence() {
    var submit=component("Save record");
    for(String view:List.of("form","detail"))assertTrue(graph.relationships().stream().anyMatch(e->e.type()==EdgeType.NAVIGATES_TO&&e.from().equals(submit.id())&&e.to().equals(screen(view).id())&&e.confidence()==Confidence.INFERRED));
    var detail=graph.relationships().stream().filter(e->e.type()==EdgeType.NAVIGATES_TO&&e.from().equals(submit.id())&&e.to().equals(screen("detail").id())).findFirst().orElseThrow();
    assertTrue(detail.evidence().stream().anyMatch(e->e.source().file().endsWith("form.jsp")));
    assertTrue(detail.evidence().stream().anyMatch(e->e.source().file().endsWith("RecordController.java")&&e.source().line()==11));
  }
  @Test void getSearchKeepsEveryProvenReturnDestinationWithoutPredictingBranch() {
    assertEquals(3,returns("search").size());
    var search=component("Search records");
    for(String view:List.of("find","detail","list"))assertTrue(graph.relationships().stream().anyMatch(e->e.type()==EdgeType.NAVIGATES_TO&&e.from().equals(search.id())&&e.to().equals(screen(view).id())));
    assertEquals(Set.of(16,17,18),new HashSet<>(returns("search").stream().map(e->e.source().line()).toList()));
  }
  @Test void literalRedirectForwardModelAndViewAndRedirectViewResolveWithoutFakeScreens() {
    for(String method:List.of("literal","forward","mav","rv"))assertTrue(returns(method).stream().anyMatch(e->e.type()==EdgeType.FORWARDS_TO&&e.to().equals(screen("detail").id())&&e.confidence()==Confidence.INFERRED),method);
    assertTrue(graph.nodes().stream().noneMatch(n->n.type()==NodeType.SCREEN&&n.name().matches("^(redirect|forward):.*")));
    assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));assertEquals("2.2",graph.schemaVersion());
  }
  @Test void ambiguousDestinationKeepsBothCandidatesAndMarksAmbiguity() {
    var edges=returns("ambiguous");assertEquals(2,edges.size());
    assertEquals(Set.of(screen("detail").id(),screen("other").id()),new HashSet<>(edges.stream().map(Relationship::to).toList()));
    assertTrue(edges.stream().allMatch(e->e.confidence()==Confidence.AMBIGUOUS));
    assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("SPRING_RETURN_AMBIGUOUS")&&d.evidence().stream().anyMatch(e->e.detail()!=null&&e.detail().contains("/overlap/{first}")&&e.detail().contains("/overlap/{second}"))));
  }
  @Test void unknownVariablesCallsModifiedModelAndViewAndExternalTargetsAreNeverGuessed() {
    for(String method:List.of("dynamic","variable","changed","setter","external","missing","badForward")) {
      assertTrue(returns(method).isEmpty(),method);
      assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("SPRING_RETURN_UNRESOLVED")&&d.evidence().stream().anyMatch(e->e.detail()!=null&&e.detail().contains("RecordController."+method))),method);
    }
    assertTrue(graph.diagnostics().stream().anyMatch(d->d.message().contains("destinationName()")));
    assertTrue(graph.diagnostics().stream().anyMatch(d->d.message().contains("requested")));
  }
  @Test void redirectCyclesTerminateWithoutInventingRenderedScreens() {
    assertTrue(returns("cycleA").isEmpty());assertTrue(returns("cycleB").isEmpty());
    assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("SPRING_RETURN_UNRESOLVED")&&d.message().contains("循環")));
  }
  @Test void plainViewsRetainReturnLineProvenanceAndIgnoreNestedCallableReturns() {
    assertEquals(1,returns("callback").size());assertEquals(screen("detail").id(),returns("callback").get(0).to());
    assertEquals(46,returns("callback").get(0).source().line());
    assertTrue(returns("save").stream().anyMatch(e->e.type()==EdgeType.RENDERS&&e.to().equals(screen("form").id())&&e.source().line()==10));
  }
  @Test void ajaxResponsesNeverBecomeBrowserNavigation() {
    var ajax=graph.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&"ajax".equals(n.attributes().get("id"))).findFirst().orElseThrow();
    assertTrue(graph.behaviors().stream().anyMatch(b->ajax.id().equals(b.triggerId())&&b.type()==BehaviorType.CALL_API));
    assertTrue(graph.relationships().stream().noneMatch(e->e.type()==EdgeType.NAVIGATES_TO&&e.from().equals(ajax.id())));
  }
}
