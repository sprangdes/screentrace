package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApiUsage;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StrutsR16ScreenLoadCallersTest {
  @TempDir Path root;

  private void file(String path,String text)throws Exception {
    Path target=root.resolve(path);Files.createDirectories(target.getParent());Files.writeString(target,text);
  }

  private ApplicationGraph analyze()throws Exception {
    return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  private void base(String actions)throws Exception {
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings>"+actions+"</action-mappings></struts-config>");
  }

  @Test void generatedActionUrlsAndJspForwardIncludeAreScreenLoadCallersWithStaticEvidence()throws Exception {
    base("<action path='/image' type='ImageAction'/><action path='/rewrite' type='RewriteAction'/><action path='/forward' type='ForwardAction'/><action path='/include' type='IncludeAction'/>");
    file("src/main/webapp/page.jsp","<html:img action='/image.do'/><html:image action='/image.do'/><html:rewrite action='/rewrite.do'/><jsp:forward page='/forward.do'/><jsp:include page='/include.do'/>");

    ApplicationGraph graph=analyze();
    GraphNode screen=graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&node.attributes().getOrDefault("view","").endsWith("page.jsp")).findFirst().orElseThrow();
    Map<String,GraphNode> endpoints=new TreeMap<>();
    graph.nodes().stream().filter(node->node.type()==NodeType.ENDPOINT).forEach(node->endpoints.put(node.attributes().get("path"),node));
    assertEquals(Set.of("/image.do","/rewrite.do","/forward.do","/include.do"),endpoints.keySet());

    for(String path:endpoints.keySet()) {
      GraphNode endpoint=endpoints.get(path);
      Relationship caller=graph.relationships().stream().filter(edge->edge.type()==EdgeType.CALLS&&edge.from().equals(screen.id())&&edge.to().equals(endpoint.id())).findFirst().orElseThrow(()->new AssertionError("missing screen-load caller for "+path+"\n"+graph.relationships()+"\n"+graph.diagnostics()));
      assertEquals(Confidence.CONFIRMED,caller.confidence());
      assertTrue(caller.evidence().stream().anyMatch(proof->proof.source().file().equals("src/main/webapp/page.jsp")&&proof.detail()!=null&&proof.detail().contains("basis=STATIC_URL")),path+" evidence="+caller.evidence());
    }

    Map<String,ApiUsage.Usage> usage=ApiUsage.derive(graph,Map.of(),Map.of());
    for(String path:Set.of("/image.do","/forward.do","/include.do"))assertEquals(1,usage.get(endpoints.get(path).id()).callers().size(),path);
    assertTrue(usage.get(endpoints.get("/rewrite.do").id()).callers().stream().anyMatch(caller->caller.screenId().equals(screen.id())),"rewrite page-load caller was not included");
  }

  @Test void escapedAndPreformattedMarkupExamplesDoNotCreateCallSources()throws Exception {
    base("<action path='/escaped' type='EscapedAction'/><action path='/preformatted' type='PreformattedAction'/><action path='/coded' type='CodedAction'/>");
    file("src/main/webapp/page.html","&lt;html:img action=\"/escaped.do\" /&gt;<pre><a href=\"/preformatted.do\">sample</a></pre><code><html:link action=\"/coded.do\">example</html:link></code><h1>Real page</h1>");

    ApplicationGraph graph=analyze();
    Set<String> targets=graph.relationships().stream().filter(edge->Set.of(EdgeType.CALLS,EdgeType.TRIGGERS).contains(edge.type())).map(Relationship::to).map(id->graph.nodes().stream().filter(node->node.id().equals(id)).findFirst().orElseThrow()).filter(node->node.type()==NodeType.ENDPOINT).map(node->node.attributes().get("path")).collect(java.util.stream.Collectors.toSet());
    assertTrue(targets.isEmpty(),"escaped or preformatted examples became call sources: "+targets);
  }
}
