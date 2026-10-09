package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StrutsR16TilesBoundaryTest {
  @TempDir Path root;

  private void file(String path,String text)throws Exception{Path target=root.resolve(path);Files.createDirectories(target.getParent());Files.writeString(target,text);}
  private ApplicationGraph analyze()throws Exception{return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));}

  @Test void wp10FixtureKeepsUnroutedPageDefinitionAndDirectJspAsScreens()throws Exception{
    Path project=null;for(Path candidate=Path.of("").toAbsolutePath();candidate!=null;candidate=candidate.getParent())if(Files.isRegularFile(candidate.resolve("pom.xml"))&&Files.isDirectory(candidate.resolve("screentrace-core"))){project=candidate.resolve("fixtures/wp10/struts1");break;}
    assertNotNull(project,"repository root");assertTrue(Files.isDirectory(project),project.toString());
    var graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(project));
    Map<String,GraphNode> screens=new TreeMap<>();graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN).forEach(node->screens.put(node.name(),node));
    assertEquals(Set.of("page","outer"),screens.keySet());
    var outer=screens.get("outer");
    assertTrue(outer.source().file().endsWith("tiles-defs.xml"));
    assertFalse(graph.relationships().stream().anyMatch(edge->Set.of(EdgeType.RENDERS,EdgeType.FORWARDS_TO).contains(edge.type())&&edge.to().equals(outer.id())));
    assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.CONTAINS&&edge.from().equals(outer.id())),"unrouted page definition must retain its controls");
  }

  @Test void everyUnreferencedPageDefinitionRemainsAScreenAndItsJspControlsStayGrouped()throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' type='sample.Home'><forward name='ok' path='home.page'/></action></action-mappings></struts-config>");
    file("tiles-defs.xml","<tiles-definitions><definition name='base' path='/WEB-INF/jsp/layout.jsp'><put name='body' value='/WEB-INF/jsp/body.jsp'/><put name='header' value='/header.jsp'/></definition><definition name='home.page' extends='base'><put-attribute name='heading' value='Home'/></definition><definition name='unused.page' extends='base'><put name='body' value='/WEB-INF/jsp/unused.jsp'/></definition></tiles-definitions>");
    file("src/main/webapp/WEB-INF/jsp/layout.jsp","<tiles:insert page='/WEB-INF/jsp/body.jsp'/><button id='layout-action'>Layout action</button>");
    file("src/main/webapp/WEB-INF/jsp/body.jsp","<button id='body-action'>Body action</button>");
    file("src/main/webapp/WEB-INF/jsp/unused.jsp","<button id='unused-action'>Unused</button>");
    file("src/main/webapp/WEB-INF/jsp/full.jsp","<h1>Full page</h1>");
    file("src/main/webapp/header.jsp","<button id='header-action'>Header action</button>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' type='sample.Home'><forward name='ok' path='home.page'/><forward name='full' path='/WEB-INF/jsp/full.jsp'/></action></action-mappings></struts-config>");

    var graph=analyze();
    Set<String> screenNames=new TreeSet<>();graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN).forEach(node->screenNames.add(node.name()));
    assertEquals(Set.of("full","home.page","unused.page"),screenNames);
    var home=graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&node.name().equals("home.page")).findFirst().orElseThrow();
    var contained=graph.relationships().stream().filter(edge->edge.type()==EdgeType.CONTAINS&&edge.from().equals(home.id())).map(edge->graph.nodes().stream().filter(node->node.id().equals(edge.to())).findFirst().orElseThrow()).toList();
    assertTrue(contained.stream().anyMatch(node->node.source().file().endsWith("body.jsp")&&"body-action".equals(node.attributes().get("id"))),contained.toString());
    assertTrue(contained.stream().anyMatch(node->node.source().file().endsWith("layout.jsp")&&"layout-action".equals(node.attributes().get("id"))),contained.toString());
    assertTrue(contained.stream().anyMatch(node->node.source().file().endsWith("header.jsp")&&"header-action".equals(node.attributes().get("id"))),contained.toString());
    var unused=graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&node.name().equals("unused.page")).findFirst().orElseThrow();
    assertFalse(graph.relationships().stream().anyMatch(edge->Set.of(EdgeType.RENDERS,EdgeType.FORWARDS_TO).contains(edge.type())&&edge.to().equals(unused.id())));
    assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.CONTAINS&&edge.from().equals(unused.id())&&graph.nodes().stream().anyMatch(node->node.id().equals(edge.to())&&node.source().file().endsWith("unused.jsp"))),graph.nodes().toString());
    assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.INCLUDES&&edge.from().equals(home.id())));
  }

  @Test void unreferencedTileFragmentsAndOrdinaryJspRemainScreens()throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' type='sample.Home'><forward name='ok' path='home.page'/></action></action-mappings></struts-config>");
    file("tiles-defs.xml","<tiles-definitions><definition name='home.page' path='/WEB-INF/jsp/home.jsp'/></tiles-definitions>");
    file("src/main/webapp/WEB-INF/jsp/home.jsp","<h1>Home</h1>");
    file("src/main/webapp/WEB-INF/jsp/orphan-layout.jsp","<%@ taglib prefix='tiles' uri='http://struts.apache.org/tags-tiles' %><tiles:insert attribute='body'/><button>Layout action</button>");
    file("src/main/webapp/WEB-INF/jsp/unrouted-fragment.jsp","<p>Fragment only</p>");

    var graph=analyze();
    assertTrue(graph.nodes().stream().anyMatch(node->node.type()==NodeType.SCREEN&&node.source().file().endsWith("orphan-layout.jsp")));
    assertTrue(graph.nodes().stream().anyMatch(node->node.type()==NodeType.SCREEN&&node.source().file().endsWith("unrouted-fragment.jsp")),graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN).toList().toString());
  }

  @Test void tileTemplateControlsAreGroupedIntoDirectlyForwardedJspWhenItsSlotIsThatPage()throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' type='sample.Home'><forward name='ok' path='/WEB-INF/jsp/page.jsp'/></action></action-mappings></struts-config>");
    file("tiles-defs.xml","<tiles-definitions><definition name='base' path='/WEB-INF/jsp/layout.jsp'><put name='body' value='/WEB-INF/jsp/page.jsp'/></definition></tiles-definitions>");
    file("src/main/webapp/WEB-INF/jsp/layout.jsp","<%@ taglib prefix='tiles' uri='http://struts.apache.org/tags-tiles' %><tiles:insert attribute='body'/><button id='layout-action'>Shared action</button><script>fetch('/tiles-layout-api')</script>");
    file("src/main/webapp/WEB-INF/jsp/page.jsp","<h1>Page</h1>");

    var graph=analyze();
    var page=graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&node.name().equals("page")).findFirst().orElseThrow();
    assertFalse(graph.nodes().stream().anyMatch(node->node.type()==NodeType.SCREEN&&node.source().file().endsWith("layout.jsp")));
    assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.CONTAINS&&edge.from().equals(page.id())&&graph.nodes().stream().anyMatch(node->node.id().equals(edge.to())&&"layout-action".equals(node.attributes().get("id")))),graph.nodes().toString()+"\n"+graph.relationships().toString());
    assertTrue(graph.behaviors().stream().anyMatch(behavior->behavior.triggerId().equals(page.id())&&behavior.type()==BehaviorType.CALL_API&&behavior.expression().contains("/tiles-layout-api")),graph.relationships().stream().filter(edge->edge.type()==EdgeType.INCLUDES).toList().toString()+"\n"+graph.nodes().stream().filter(node->node.type()==NodeType.VIEW).toList());
  }

  @Test void tileTemplateScriptIsOwnedByForwardedJspEvenWhenItHasNoInteractiveMarkup()throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' type='sample.Home'><forward name='ok' path='/WEB-INF/jsp/page.jsp'/></action></action-mappings></struts-config>");
    file("tiles-defs.xml","<tiles-definitions><definition name='base' path='/WEB-INF/jsp/layout.jsp'><put name='body' value='/WEB-INF/jsp/page.jsp'/></definition></tiles-definitions>");
    file("src/main/webapp/WEB-INF/jsp/layout.jsp","<%@ taglib prefix='tiles' uri='http://struts.apache.org/tags-tiles' %><tiles:insert attribute='body'/><script>fetch('/tiles-layout-api')</script>");
    file("src/main/webapp/WEB-INF/jsp/page.jsp","<h1>Page</h1>");

    var graph=analyze();
    var page=graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&node.name().equals("page")).findFirst().orElseThrow();
    assertTrue(graph.behaviors().stream().anyMatch(behavior->behavior.triggerId().equals(page.id())&&behavior.type()==BehaviorType.CALL_API&&behavior.expression().contains("/tiles-layout-api")),graph.relationships().stream().filter(edge->edge.type()==EdgeType.INCLUDES).toList().toString()+"\n"+graph.nodes().stream().filter(node->node.type()==NodeType.VIEW).toList());
  }
}
