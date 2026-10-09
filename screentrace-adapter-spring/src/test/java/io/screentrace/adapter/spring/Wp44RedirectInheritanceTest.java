package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApiUsage;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Wp44RedirectInheritanceTest {
  @TempDir Path temp;

  private ApplicationGraph analyze(String controller, String views) throws Exception {
    Path root = Files.createTempDirectory(temp, "redirect-fixture-");
    Path jsp = root.resolve("src/main/webapp/WEB-INF/views");
    Files.createDirectories(jsp);
    Files.writeString(jsp.resolve("page.jsp"), views);
    Files.writeString(root.resolve("CartController.java"), controller);
    return new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  @Test void onlyRedirectedRouteInheritsTheOriginalScreenComponentAndCompleteInferredEvidence() throws Exception {
    var graph = analyze("""
        import org.springframework.stereotype.Controller;
        import org.springframework.web.bind.annotation.*;
        @Controller class CartController {
          @RequestMapping("/cart/") String get(){ return "redirect:/cart/{cartId}"; }
          @GetMapping("/cart/{cartId}") String getCart(){ return "page"; }
        }
        """, "<a href='/cart/'>View cart</a>");
    var source = graph.nodes().stream().filter(n -> n.type()==NodeType.ENDPOINT && "/cart/".equals(n.attributes().get("path"))).findFirst().orElseThrow();
    var destination = graph.nodes().stream().filter(n -> n.type()==NodeType.ENDPOINT && "/cart/{cartId}".equals(n.attributes().get("path"))).findFirst().orElseThrow();
    var usage = ApiUsage.derive(graph, Map.of(), Map.of()).get(destination.id());
    assertEquals(ApiUsage.Status.IN_USE, usage.status());
    assertEquals(1, usage.callers().size());
    assertEquals("View cart", graph.nodes().stream().filter(n -> n.id().equals(usage.callers().get(0).componentId())).findFirst().orElseThrow().name());
    var redirect = graph.relationships().stream().filter(e -> e.type()==EdgeType.CALLS && e.from().equals(graph.relationships().stream().filter(h->h.type()==EdgeType.HANDLED_BY&&h.from().equals(source.id())).findFirst().orElseThrow().to()) && e.to().equals(destination.id())).findFirst().orElseThrow();
    assertEquals(Confidence.INFERRED, redirect.confidence());
    String evidence = redirect.evidence().stream().map(AnalysisEvidence::detail).filter(Objects::nonNull).reduce("", (a,b)->a+"\n"+b);
    assertTrue(evidence.contains("/cart/"), evidence);
    assertTrue(evidence.contains("CartController.get"), evidence);
    assertTrue(evidence.contains("redirect:/cart/{cartId}"), evidence);
    assertTrue(evidence.contains("/cart/{cartId}"), evidence);
  }

  @Test void ambiguousRedirectDestinationDoesNotCreateInheritedCallersAndKeepsDiagnostic() throws Exception {
    var graph = analyze("""
        import org.springframework.stereotype.Controller;
        import org.springframework.web.bind.annotation.*;
        @Controller class CartController {
          @GetMapping("/start") String start(){ return "redirect:/items/7"; }
          @GetMapping("/items/{id}") String first(){ return "one"; }
          @GetMapping("/items/{name}") String second(){ return "two"; }
        }
        """, "<a href='/start'>Start</a>");
    assertFalse(graph.relationships().stream().anyMatch(e -> e.type()==EdgeType.CALLS && e.evidence().stream().anyMatch(p->"RedirectInheritance".equals(p.parser()))));
    assertTrue(graph.diagnostics().stream().anyMatch(d -> d.code().equals("SPRING_RETURN_AMBIGUOUS") || d.code().equals("SPRING_RETURN_UNRESOLVED")));
  }

  @Test void redirectCyclesAndChainsOverFiveHopsHaveExplicitDiagnostics() throws Exception {
    StringBuilder source = new StringBuilder("import org.springframework.stereotype.Controller;import org.springframework.web.bind.annotation.*;@Controller class CartController{");
    source.append("@GetMapping(\"/cycle/a\") String cycleA(){return \"redirect:/cycle/b\";}")
        .append("@GetMapping(\"/cycle/b\") String cycleB(){return \"redirect:/cycle/a\";}");
    for (int i=0;i<7;i++) source.append("@GetMapping(\"/step").append(i).append("\") String step").append(i).append("(){return \"redirect:/step").append(i+1).append("\";}");
    source.append("@GetMapping(\"/step7\") String end(){return \"page\";} }");
    var graph = analyze(source.toString(), "<a href='/cycle/a'>Cycle</a><a href='/step0'>Long chain</a>");
    assertTrue(graph.diagnostics().stream().anyMatch(d -> d.code().equals("API_REDIRECT_CYCLE")));
    assertTrue(graph.diagnostics().stream().anyMatch(d -> d.code().equals("API_REDIRECT_DEPTH_LIMIT")));
  }
}
