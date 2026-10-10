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
    assertTrue(inherited.evidence().stream().anyMatch(p->Objects.toString(p.detail(),"").contains("/start.do")&&p.detail().contains("/next.do")&&p.detail().contains("struts-config.xml")),inherited.evidence().toString());
    assertTrue(graph.relationships().stream().anyMatch(e->e.type()==EdgeType.TRIGGERS&&e.to().equals(start.id())));
  }

  @Test void ambiguousForwardDestinationDoesNotInheritCallers(){
    assertDoesNotThrow(()->{
      file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
      file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/start' type='sample.Start'><forward name='next' path='/next.do'/></action><action path='/next' type='sample.NextA'/><action path='/next' type='sample.NextB'/></action-mappings></struts-config>");file("src/main/webapp/index.jsp","<html:link action='/start.do'>Start</html:link>");
      var graph=analyze();assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_REDIRECT_AMBIGUOUS")),graph.diagnostics().toString());assertFalse(graph.relationships().stream().anyMatch(e->e.type()==EdgeType.CALLS&&e.evidence().stream().anyMatch(p->"RedirectInheritance".equals(p.parser()))));
    });
  }

  @Test void forwardCyclesAndChainsOverFiveHopsAreDiagnosed(){
    assertDoesNotThrow(()->{
      file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
      file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/cycleA' type='A'><forward name='n' path='/cycleB.do'/></action><action path='/cycleB' type='B'><forward name='n' path='/cycleA.do'/></action><action path='/deep0' type='D0'><forward name='n' path='/deep1.do'/></action><action path='/deep1' type='D1'><forward name='n' path='/deep2.do'/></action><action path='/deep2' type='D2'><forward name='n' path='/deep3.do'/></action><action path='/deep3' type='D3'><forward name='n' path='/deep4.do'/></action><action path='/deep4' type='D4'><forward name='n' path='/deep5.do'/></action><action path='/deep5' type='D5'/></action-mappings></struts-config>");file("src/main/webapp/index.jsp","<html:link action='/cycleA.do'>Cycle</html:link><html:link action='/deep0.do'>Deep</html:link>");
      var graph=analyze();assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_REDIRECT_CYCLE")||d.code().equals("STRUTS_FORWARD_CYCLE")),graph.diagnostics().toString());assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_REDIRECT_DEPTH_LIMIT")||d.code().equals("STRUTS_FORWARD_DEPTH")),graph.diagnostics().toString());
    });
  }

  @Test void actionReferencedOnlyByExtendsIsMarkedAsInheritedTemplate(){
    assertDoesNotThrow(()->{
      base("<action path='/BaseAction' type='sample.BaseAction'/><action path='/ChildAction' type='sample.ChildAction' extends='/BaseAction'/>");
      file("src/main/webapp/index.jsp","<h1>Home</h1>");var graph=analyze();var template=endpoint(graph,"/BaseAction.do");
      assertEquals("true",template.attributes().get("inheritedTemplate"));
      assertTrue(template.evidence().stream().anyMatch(p->Objects.toString(p.detail(),"").contains("extends")&&Objects.toString(p.detail(),"").contains("/ChildAction")));
    });
  }

  @Test void doubleSlashBaseActionIsShownAsInheritedTemplate(){
    assertDoesNotThrow(()->{
      base("<action path='//BaseAction' type='sample.BaseAction'/><action path='/Delete*' type='sample.DeleteAction' extends='//BaseAction'/><action path='/Edit*' type='sample.EditAction' extends='//BaseAction'/>");
      file("src/main/webapp/index.jsp","<h1>Home</h1>");var graph=analyze();var template=endpoint(graph,"//BaseAction.do");
      assertEquals("true",template.attributes().get("inheritedTemplate"));
      assertFalse(graph.relationships().stream().anyMatch(edge->edge.to().equals(template.id())&&Set.of(io.screentrace.core.ApplicationGraph.EdgeType.TRIGGERS,io.screentrace.core.ApplicationGraph.EdgeType.CALLS).contains(edge.type())));
    });
  }

  @Test void globalForwardAndExceptionActionTargetsInheritCallersAsInferred(){
    assertDoesNotThrow(()->{
      file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
      file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><global-forwards><forward name='next' path='/globalTarget.do'/></global-forwards><global-exceptions><exception key='failure' type='sample.Failure' path='/errorTarget.do'/></global-exceptions><action-mappings><action path='/start' type='sample.StartAction'/><action path='/globalTarget' type='sample.GlobalTarget'/><action path='/errorTarget' type='sample.ErrorTarget'/></action-mappings></struts-config>");
      file("src/main/java/sample/StartAction.java","package sample; class StartAction extends org.apache.struts.action.Action { public org.apache.struts.action.ActionForward execute(org.apache.struts.action.ActionMapping mapping, org.apache.struts.action.ActionForm form, javax.servlet.http.HttpServletRequest request, javax.servlet.http.HttpServletResponse response){ return mapping.findForward(\"next\"); } }");
      file("src/main/webapp/index.jsp","<html:link action='/start.do'>Start</html:link>");
      var graph=analyze();var global=endpoint(graph,"/globalTarget.do");var error=endpoint(graph,"/errorTarget.do");
      assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.CALLS&&edge.to().equals(global.id())&&edge.confidence()==Confidence.INFERRED&&edge.evidence().stream().anyMatch(proof->"RedirectInheritance".equals(proof.parser())&&Objects.toString(proof.detail(),"").contains("next"))));
      assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.CALLS&&edge.to().equals(error.id())&&edge.confidence()==Confidence.INFERRED&&edge.evidence().stream().anyMatch(proof->"RedirectInheritance".equals(proof.parser())&&Objects.toString(proof.detail(),"").contains("errorTarget"))));
    });
  }
}
