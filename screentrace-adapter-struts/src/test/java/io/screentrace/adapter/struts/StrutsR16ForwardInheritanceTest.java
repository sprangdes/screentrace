package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApiUsage;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StrutsR16ForwardInheritanceTest {
  @TempDir Path root;
  private void file(String path,String text)throws Exception{Path target=root.resolve(path);Files.createDirectories(target.getParent());Files.writeString(target,text);}
  private io.screentrace.core.ApplicationGraph analyze()throws Exception{return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));}
  private void base(String actions)throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings>"+actions+"</action-mappings></struts-config>");
  }
  private GraphNode endpoint(io.screentrace.core.ApplicationGraph graph,String path){return graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&path.equals(n.attributes().get("path"))).findFirst().orElseThrow();}

  @Test void actionForwardInheritsItsConfirmedCallerAsInferredAndKeepsFullChainEvidence()throws Exception{
    base("<action path='/start' type='sample.Start'><forward name='next' path='/next.do'/></action><action path='/next' type='sample.Next'><forward name='page' path='/done.jsp'/></action>");
    file("src/main/webapp/index.jsp","<html:link action='/start.do'>Start</html:link>");file("src/main/webapp/done.jsp","<h1>Done</h1>");
    var graph=analyze();var start=endpoint(graph,"/start.do");var next=endpoint(graph,"/next.do");
    var inherited=graph.relationships().stream().filter(e->e.type()==EdgeType.CALLS&&e.to().equals(next.id())&&e.confidence()==Confidence.INFERRED&&e.evidence().stream().anyMatch(p->"RedirectInheritance".equals(p.parser()))).findFirst().orElseThrow();
    assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph,Map.of(),Map.of()).get(next.id()).status());
    assertTrue(inherited.evidence().stream().anyMatch(p->Objects.toString(p.detail(),"").contains("/start.do")&&p.detail().contains("/next.do")&&p.detail().contains("struts-config.xml")));
    assertTrue(graph.relationships().stream().anyMatch(e->e.type()==EdgeType.TRIGGERS&&e.to().equals(start.id())));
  }

  @Test void ambiguousForwardDestinationDoesNotInheritCallers(){
    assertDoesNotThrow(()->{
      file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
      file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/start' type='sample.Start'><forward name='next' path='/next.do'/></action><action path='/next' type='sample.NextA'/><action path='/next' type='sample.NextB'/></action-mappings></struts-config>");file("src/main/webapp/index.jsp","<html:link action='/start.do'>Start</html:link>");
      var graph=analyze();assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_REDIRECT_AMBIGUOUS")));assertFalse(graph.relationships().stream().anyMatch(e->e.type()==EdgeType.CALLS&&e.evidence().stream().anyMatch(p->"RedirectInheritance".equals(p.parser()))));
    });
  }

  @Test void forwardCyclesAndChainsOverFiveHopsAreDiagnosed(){
    assertDoesNotThrow(()->{
      file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
      file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/cycleA' type='A'><forward name='n' path='/cycleB.do'/></action><action path='/cycleB' type='B'><forward name='n' path='/cycleA.do'/></action><action path='/deep0' type='D0'><forward name='n' path='/deep1.do'/></action><action path='/deep1' type='D1'><forward name='n' path='/deep2.do'/></action><action path='/deep2' type='D2'><forward name='n' path='/deep3.do'/></action><action path='/deep3' type='D3'><forward name='n' path='/deep4.do'/></action><action path='/deep4' type='D4'><forward name='n' path='/deep5.do'/></action><action path='/deep5' type='D5'/></action-mappings></struts-config>");file("src/main/webapp/index.jsp","<html:link action='/cycleA.do'>Cycle</html:link><html:link action='/deep0.do'>Deep</html:link>");
      var graph=analyze();assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_REDIRECT_CYCLE")));assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_REDIRECT_DEPTH_LIMIT")));
    });
  }
}
