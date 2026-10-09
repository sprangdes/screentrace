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

  @Test void onlyForwardedTileDefinitionBecomesScreenAndItsJspControlsStayGrouped()throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' type='sample.Home'><forward name='ok' path='home.page'/></action></action-mappings></struts-config>");
    file("tiles-defs.xml","<tiles-definitions><definition name='base' path='/WEB-INF/jsp/layout.jsp'><put name='body' value='/WEB-INF/jsp/body.jsp'/></definition><definition name='home.page' extends='base'><put-attribute name='heading' value='Home'/></definition><definition name='unused.page' extends='base'><put name='body' value='/WEB-INF/jsp/unused.jsp'/></definition></tiles-definitions>");
    file("src/main/webapp/WEB-INF/jsp/layout.jsp","<tiles:insert page='/WEB-INF/jsp/body.jsp'/><button id='layout-action'>Layout action</button>");
    file("src/main/webapp/WEB-INF/jsp/body.jsp","<button id='body-action'>Body action</button>");
    file("src/main/webapp/WEB-INF/jsp/unused.jsp","<button id='unused-action'>Unused</button>");
    file("src/main/webapp/WEB-INF/jsp/full.jsp","<h1>Full page</h1>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' type='sample.Home'><forward name='ok' path='home.page'/><forward name='full' path='/WEB-INF/jsp/full.jsp'/></action></action-mappings></struts-config>");

    var graph=analyze();
    Set<String> screenViews=new TreeSet<>();graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN).forEach(node->screenViews.add(node.attributes().getOrDefault("view","")));
    assertTrue(screenViews.stream().anyMatch(view->view.equals("/WEB-INF/jsp/tiles:home.page")||view.equals("home.page")),screenViews.toString());
    assertTrue(screenViews.contains("/WEB-INF/jsp/full.jsp"),screenViews.toString());
    assertFalse(screenViews.stream().anyMatch(view->view.contains("layout.jsp")||view.contains("body.jsp")||view.contains("unused.jsp")||view.contains("unused.page")),screenViews.toString());
    var home=graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&node.name().equals("home.page")).findFirst().orElseThrow();
    var contained=graph.relationships().stream().filter(edge->edge.type()==EdgeType.CONTAINS&&edge.from().equals(home.id())).map(edge->graph.nodes().stream().filter(node->node.id().equals(edge.to())).findFirst().orElseThrow()).toList();
    assertTrue(contained.stream().anyMatch(node->node.source().file().endsWith("body.jsp")&&node.name().contains("body-action")),contained.toString());
    assertTrue(contained.stream().anyMatch(node->node.source().file().endsWith("layout.jsp")&&node.name().contains("layout-action")),contained.toString());
    assertFalse(contained.stream().anyMatch(node->node.source().file().endsWith("unused.jsp")),contained.toString());
    assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.INCLUDES&&edge.from().equals(home.id())));
  }
}
