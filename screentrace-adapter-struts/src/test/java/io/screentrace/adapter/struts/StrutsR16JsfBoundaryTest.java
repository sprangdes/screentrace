package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StrutsR16JsfBoundaryTest {
  @TempDir Path root;
  private void file(String path,String text)throws Exception{Path target=root.resolve(path);Files.createDirectories(target.getParent());Files.writeString(target,text);}
  @Test void jsfControlsAreExcludedAndAffectedScreenGetsUnsupportedFrameworkEvidence()throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>faces</servlet-name><servlet-class>javax.faces.webapp.FacesServlet</servlet-class></servlet><servlet-mapping><servlet-name>faces</servlet-name><url-pattern>*.faces</url-pattern></servlet-mapping><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' type='sample.HomeAction' forward='/home.jsp'/></action-mappings></struts-config>");
    file("src/main/webapp/home.jsp","<%@ taglib prefix='h' uri='http://java.sun.com/jsf/html' %>\n<h:form><h:commandButton value='Save'/></h:form>");
    file("src/main/webapp/plain.jsp","<button>Plain action</button>");
    ApplicationGraph graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    GraphNode jsfScreen=graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&"src/main/webapp/home.jsp".equals(node.attributes().get("view"))).findFirst().orElseThrow();
    assertEquals("JSF",jsfScreen.attributes().get("unsupportedComponentFramework"));
    assertFalse(graph.nodes().stream().anyMatch(node->node.type()==NodeType.COMPONENT&&"h:commandButton".equals(node.attributes().get("tag"))));
    Diagnostic diagnostic=graph.diagnostics().stream().filter(item->item.code().equals("UNSUPPORTED_COMPONENT_FRAMEWORK")&&item.source().file().endsWith("home.jsp")).findFirst().orElseThrow();
    assertEquals("src/main/webapp/home.jsp",diagnostic.source().file());assertEquals(2,diagnostic.source().line());
  }

  @Test void facesSuffixMappingResolvesTilesLayoutAndCountsItsJsfTagOnThePageDefinition()throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>faces</servlet-name><servlet-class>javax.faces.webapp.FacesServlet</servlet-class></servlet><servlet-mapping><servlet-name>faces</servlet-name><url-pattern>*.faces</url-pattern></servlet-mapping><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' type='sample.HomeAction' forward='.home'/></action-mappings></struts-config>");
    file("src/main/webapp/WEB-INF/tiles-defs.xml","<tiles-definitions><definition name='.base' page='/layout.faces'/><definition name='.home' extends='.base'><put name='body' value='/home.jsp'/></definition></tiles-definitions>");
    file("src/main/webapp/layout.jsp","<%@ taglib prefix='h' uri='http://java.sun.com/jsf/html' %><h:panelGroup>Layout</h:panelGroup>");
    file("src/main/webapp/home.jsp","<html><body><a href='/home.faces'>Home</a></body></html>");
    ApplicationGraph graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    GraphNode page=graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&".home".equals(node.name())).findFirst().orElseThrow();
    assertEquals("JSF",page.attributes().get("unsupportedComponentFramework"));
    assertFalse(graph.nodes().stream().anyMatch(node->node.type()==NodeType.SCREEN&&"src/main/webapp/layout.jsp".equals(node.attributes().get("view"))));
    assertTrue(graph.diagnostics().stream().anyMatch(item->item.code().equals("UNSUPPORTED_COMPONENT_FRAMEWORK")&&item.source().file().equals("src/main/webapp/layout.jsp")),graph.diagnostics().toString());
    assertFalse(graph.diagnostics().stream().anyMatch(item->item.code().equals("JSF_ROUTE_UNRESOLVED")),graph.diagnostics().toString());
    assertTrue(graph.nodes().stream().anyMatch(node->node.type()==NodeType.COMPONENT&&"/home.jsp".equals(node.attributes().get("target"))),graph.nodes().stream().filter(node->node.type()==NodeType.COMPONENT).toList().toString());
  }

  @Test void facesTargetWithoutProvenMappingIsNotSuffixGuessedAndHasDiagnostic()throws Exception{
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' type='sample.HomeAction' forward='.home'/></action-mappings></struts-config>");
    file("src/main/webapp/WEB-INF/tiles-defs.xml","<tiles-definitions><definition name='.base' page='/layout.faces'/><definition name='.home' extends='.base'><put name='body' value='/home.jsp'/></definition></tiles-definitions>");
    file("src/main/webapp/layout.jsp","<html>must not be guessed</html>");file("src/main/webapp/home.jsp","Home");
    ApplicationGraph graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(graph.diagnostics().stream().anyMatch(item->item.code().equals("JSF_ROUTE_UNRESOLVED")),graph.diagnostics().toString());
    GraphNode page=graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&".home".equals(node.name())).findFirst().orElseThrow();
    assertFalse(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.INCLUDES&&graph.nodes().stream().anyMatch(node->node.id().equals(edge.to())&&"src/main/webapp/layout.jsp".equals(node.attributes().get("view")))));
  }

  @Test void ordinaryForwardPathDoesNotRequireFacesSuffixMapping()throws Exception{
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/open' type='sample.OpenAction'><forward name='success' path='/home'/></action></action-mappings></struts-config>");
    file("src/main/webapp/home.jsp","<html><body>Home</body></html>");
    ApplicationGraph graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    assertNotNull(graph);
  }
}
