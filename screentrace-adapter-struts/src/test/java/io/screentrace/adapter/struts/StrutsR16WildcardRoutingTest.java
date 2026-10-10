package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StrutsR16WildcardRoutingTest {
  @TempDir Path root;
  private void file(String path,String text)throws Exception{Path target=root.resolve(path);Files.createDirectories(target.getParent());Files.writeString(target,text);}
  private io.screentrace.core.ApplicationGraph analyze()throws Exception{return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));}
  private void base(String actions)throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings>"+actions+"</action-mappings></struts-config>");
  }

  @Test void wildcardMappingAggregatesConcreteCallersAndSubstitutesForwardCapture(){
    assertDoesNotThrow(()->{
      base("<action path='/View/**' type='sample.ViewAction'><forward name='page' path='/pages/{1}.jsp'/></action>");
      file("src/main/webapp/menu.jsp","<html:link action='/View/admin/item.do'>Admin</html:link><html:link action='/View/shop/list.do'>Shop</html:link>");
      file("src/main/webapp/pages/admin/item.jsp","<h1>Item</h1>");file("src/main/webapp/pages/shop/list.jsp","<h1>List</h1>");
      var graph=analyze();var endpoint=graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/View/**.do".equals(n.attributes().get("path"))).findFirst().orElseThrow();
      assertEquals(2,graph.relationships().stream().filter(e->e.type()==EdgeType.TRIGGERS&&e.to().equals(endpoint.id())).count());
      assertTrue(endpoint.attributes().getOrDefault("matchedPaths","").contains("/View/admin/item.do"));assertTrue(endpoint.attributes().getOrDefault("matchedPaths","").contains("/View/shop/list.do"));
      assertTrue(graph.nodes().stream().anyMatch(n->n.type()==NodeType.SCREEN&&n.attributes().getOrDefault("view","").endsWith("pages/admin/item.jsp")&&n.attributes().getOrDefault("routeAliases","").contains("/View/admin/item.do")),graph.nodes()+"\n"+graph.relationships()+"\n"+graph.diagnostics());
      assertFalse(graph.diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_FORWARD_UNRESOLVED")),graph.diagnostics().toString());
    });
  }

  @Test void exactRouteWinsBeforeFirstMatchingWildcardAndWildcardOrderIsStable(){
    assertDoesNotThrow(()->{
      base("<action path='/Edit*' type='sample.FirstWildcard'/><action path='/EditUser*' type='sample.SecondWildcard'/><action path='/EditUser42' type='sample.ExactAction'/>");
      file("src/main/webapp/menu.jsp","<html:link action='/EditUser42.do'>Exact</html:link><html:link action='/EditUser77.do'>Wildcard</html:link>");
      var graph=analyze();var exact=graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/EditUser42.do".equals(n.attributes().get("path"))).findFirst().orElseThrow();
      var wildcard=graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/Edit*.do".equals(n.attributes().get("path"))).findFirst().orElseThrow();
      assertEquals(1,graph.relationships().stream().filter(e->e.type()==EdgeType.TRIGGERS&&e.to().equals(exact.id())).count());
      assertEquals(1,graph.relationships().stream().filter(e->e.type()==EdgeType.TRIGGERS&&e.to().equals(wildcard.id())).count());
      assertEquals("/EditUser77.do",wildcard.attributes().get("matchedPaths"));
    });
  }

  @Test void singleStarExcludesSlashDoubleStarIncludesSlashAndBackslashEscapesWildcard(){
    assertDoesNotThrow(()->{
      base("<action path='/One*' type='sample.SingleStar'/><action path='/Tree**' type='sample.DoubleStar'/><action path='/Literal\\*' type='sample.LiteralStar'/>");
      file("src/main/webapp/menu.jsp","<html:link action='/One/a.do'>No</html:link><html:link action='/Tree/a/b.do'>Yes</html:link><html:link action='/Literal*.do'>Literal</html:link>");
      var graph=analyze();var endpoints=graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT).toList();
      assertFalse(endpoints.stream().anyMatch(n->"/One*.do".equals(n.attributes().get("path"))&&n.attributes().getOrDefault("matchedPaths","").contains("/One/a.do")));
      assertTrue(endpoints.stream().anyMatch(n->"/Tree**.do".equals(n.attributes().get("path"))&&n.attributes().getOrDefault("matchedPaths","").contains("/Tree/a/b.do")));
      assertTrue(endpoints.stream().anyMatch(n->"/Literal\\*.do".equals(n.attributes().get("path"))&&n.attributes().getOrDefault("matchedPaths","").contains("/Literal*.do")));
    });
  }

  @Test void wildcardCaptureSubstitutesActionTypeParameterInputAndForwardAction(){
    assertDoesNotThrow(()->{
      base("<action path='/Open*' type='sample.{1}Action' parameter='{1}' input='/pages/{1}.jsp'><forward name='next' path='/Target{1}.do'/></action><action path='/Target*' type='sample.TargetAction'/>");
      file("src/main/webapp/menu.jsp","<html:link action='/OpenWidget.do'>Open</html:link>");file("src/main/webapp/pages/Widget.jsp","<h1>Widget</h1>");
      var graph=analyze();var open=graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/Open*.do".equals(n.attributes().get("path"))).findFirst().orElseThrow();
      assertTrue(graph.relationships().stream().filter(e->e.type()==EdgeType.HANDLED_BY&&e.from().equals(open.id())).map(e->graph.nodes().stream().filter(n->n.id().equals(e.to())).findFirst().orElseThrow()).anyMatch(n->"sample.WidgetAction".equals(n.attributes().get("actionType"))&&"Widget".equals(n.attributes().get("parameter"))));
      assertTrue(graph.nodes().stream().anyMatch(n->n.type()==NodeType.SCREEN&&n.attributes().getOrDefault("view","").endsWith("pages/Widget.jsp")&&n.attributes().getOrDefault("routeAliases","").contains("/OpenWidget.do")));
      var target=graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/Target*.do".equals(n.attributes().get("path"))).findFirst().orElseThrow();
      assertEquals("/TargetWidget.do",target.attributes().get("matchedPaths"));
      assertTrue(graph.relationships().stream().anyMatch(e->e.type()==EdgeType.CALLS&&e.to().equals(target.id())&&e.confidence()==Confidence.INFERRED&&e.evidence().stream().anyMatch(p->"RedirectInheritance".equals(p.parser()))));
    });
  }
}
