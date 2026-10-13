package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Tiles template slots for the static preview, action-level forwards, and c:url form actions. */
class StrutsTilesForwardActionTest {
  @TempDir Path root;

  private void file(String path,String text)throws Exception{Path target=root.resolve(path);Files.createDirectories(target.getParent());Files.writeString(target,text);}
  private ApplicationGraph analyze()throws Exception{return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));}
  private GraphNode screen(ApplicationGraph graph,String definition){return graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&definition.equals(node.attributes().get("tilesDefinitionName"))).findFirst().orElseThrow(()->new AssertionError(definition));}

  private void project(String actions)throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><form-beans><form-bean name='loginForm' type='sample.LoginForm'/></form-beans><action-mappings>"+actions+"</action-mappings></struts-config>");
    file("src/main/webapp/WEB-INF/tiles-defs.xml","<tiles-definitions>"
        +"<definition name='layout' template='/WEB-INF/view/layout.jsp'><put name='header' value='/WEB-INF/view/header.jsp'/><put name='body' value='/WEB-INF/view/empty.jsp'/><put name='title' value='Sample'/><put name='menu' value='menu.def'/></definition>"
        +"<definition name='menu.def' template='/WEB-INF/view/menu.jsp'><put name='items' value='/WEB-INF/view/items.jsp'/></definition>"
        +"<definition name='page.logon' extends='layout'><put name='body' value='/WEB-INF/view/login.jsp'/></definition>"
        +"<definition name='page.home' extends='layout'><put name='body' value='/WEB-INF/view/home.jsp'/></definition></tiles-definitions>");
    file("src/main/webapp/WEB-INF/view/layout.jsp","<html><head><title><tiles:getAsString name='title'/></title></head><body><tiles:insert name='header'/><tiles:insert attribute='menu'/><tiles:insert name='body'/></body></html>");
    for(String name:List.of("header","empty","menu","items","home"))file("src/main/webapp/WEB-INF/view/"+name+".jsp","<p>"+name+"</p>");
    file("src/main/webapp/WEB-INF/view/login.jsp","<form action=\"<c:url value='/postLogin.do' />\" method='post'><input name='username'/><button type='submit'>Login</button></form>");
  }

  @Test void pageDefinitionScreensCarryResolvedTilesSlotsForThePreview()throws Exception{
    project("<action path='/home' forward='page.home'/>");
    var screen=screen(analyze(),"page.home");
    assertEquals("src/main/webapp/WEB-INF/view/layout.jsp",screen.attributes().get("view"));
    Map<?,?> context=new ObjectMapper().readValue(screen.attributes().get("tilesAttributes"),Map.class);
    assertEquals("src/main/webapp/WEB-INF/view/layout.jsp",context.get("template"));
    Map<?,?> attributes=(Map<?,?>)context.get("attributes");
    assertEquals(Map.of("path","src/main/webapp/WEB-INF/view/home.jsp"),attributes.get("body"),"child put overrides the inherited body");
    assertEquals(Map.of("path","src/main/webapp/WEB-INF/view/header.jsp"),attributes.get("header"));
    assertEquals(Map.of("value","Sample"),attributes.get("title"));
    Map<?,?> menu=(Map<?,?>)((Map<?,?>)attributes.get("menu")).get("definition");
    assertEquals("src/main/webapp/WEB-INF/view/menu.jsp",menu.get("template"));
    assertEquals(Map.of("items",Map.of("path","src/main/webapp/WEB-INF/view/items.jsp")),menu.get("attributes"));
  }

  @Test void actionForwardAttributeRendersItsTargetAndResolvesForwardChainsToIt()throws Exception{
    project("<action path='/login' type='org.apache.struts.actions.ForwardAction' forward='page.logon'/>"
        +"<action path='/home' type='sample.Home'><forward name='login' path='/login.do'/><forward name='success' path='page.home'/></action>");
    file("src/main/java/sample/Home.java","package sample;import org.apache.struts.action.*;import javax.servlet.http.*;public class Home extends Action{public ActionForward execute(ActionMapping m,ActionForm f,HttpServletRequest q,HttpServletResponse r){return q.getSession(false)==null?m.findForward(\"login\"):m.findForward(\"success\");}}");
    var graph=analyze();var logon=screen(graph,"page.logon");
    assertTrue(Arrays.asList(logon.attributes().getOrDefault("routeAliases","").split("\u001f")).contains("/login.do"),logon.attributes().toString());
    Set<String> sources=new TreeSet<>();graph.relationships().stream().filter(edge->edge.type()==EdgeType.FORWARDS_TO&&edge.to().equals(logon.id())).forEach(edge->sources.add(edge.from()));
    assertEquals(2,sources.size(),"both /login and the /home login forward reach the logon screen: "+sources);
    assertFalse(graph.diagnostics().stream().anyMatch(d->"STRUTS_FORWARD_UNRESOLVED".equals(d.code())),graph.diagnostics().toString());
  }

  @Test void builtInForwardActionUsesItsParameterAsTheTarget()throws Exception{
    project("<action path='/login' type='org.apache.struts.actions.ForwardAction' parameter='page.logon'/>");
    var graph=analyze();var logon=screen(graph,"page.logon");
    assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.FORWARDS_TO&&edge.to().equals(logon.id())));
  }

  @Test void formActionWrittenAsLiteralCUrlTagTargetsTheProvenRoute()throws Exception{
    project("<action path='/login' forward='page.logon'/><action path='/postLogin' type='sample.Login' name='loginForm'><forward name='success' path='page.home'/></action>");
    var graph=analyze();
    var controls=graph.nodes().stream().filter(node->node.type()==NodeType.COMPONENT&&node.source().file().endsWith("login.jsp")&&Set.of("form","button").contains(node.attributes().get("tag"))).toList();
    assertEquals(2,controls.size(),controls.toString());
    for(var control:controls)assertEquals("/postLogin.do",control.attributes().get("target"),control.toString());
    assertFalse(graph.diagnostics().stream().anyMatch(d->d.message().contains("<c:url")),graph.diagnostics().toString());
  }
}
