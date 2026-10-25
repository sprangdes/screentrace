package io.screentrace.adapter.struts;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;import java.nio.file.*;import java.util.*;import io.screentrace.scanner.ProjectScanner;import io.screentrace.core.ApplicationGraph;import io.screentrace.core.ApplicationGraph.*;import io.screentrace.core.GraphIntegrityValidator;import static org.junit.jupiter.api.Assertions.*;
/** OQ-039: a relative html:link to a JSP with a query string keeps that exact URL as a route alias of the target screen. */
class StrutsQueryLinkAliasTest {
 @TempDir Path root;void write(String name,String text)throws Exception{Path f=root.resolve(name);Files.createDirectories(f.getParent());Files.writeString(f,text);}
 private static final String WEB_XML="<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>";
 private static final String TAGLIB="<%@ taglib uri=\"http://struts.apache.org/tags-html\" prefix=\"html\"%>";
 private ApplicationGraph analyze()throws Exception{return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));}

 @Test void relativeHtmlLinkWithQueryStringPassesValidationAndKeepsItsUrlAsAlias()throws Exception{
  write("src/main/webapp/WEB-INF/web.xml",WEB_XML);
  write("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/start' forward='/demo/menu.jsp'/></action-mappings></struts-config>");
  write("src/main/webapp/demo/menu.jsp",TAGLIB+"<html:link page=\"detail.jsp?a=1&amp;b=2\">Open detail</html:link>");
  write("src/main/webapp/demo/detail.jsp","<h1>Detail</h1>");
  ApplicationGraph graph=analyze();
  assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
  Map<String,GraphNode> n=new HashMap<>();graph.nodes().forEach(x->n.put(x.id(),x));
  GraphNode link=graph.nodes().stream().filter(x->x.type()==NodeType.COMPONENT&&"Open detail".equals(x.name())).findFirst().orElseThrow();
  List<Relationship> nav=graph.relationships().stream().filter(e->e.type()==EdgeType.NAVIGATES_TO&&e.from().equals(link.id())).toList();
  assertEquals(1,nav.size(),nav.toString());
  assertEquals(Confidence.CONFIRMED,nav.get(0).confidence());
  GraphNode detail=n.get(nav.get(0).to());
  assertEquals("src/main/webapp/demo/detail.jsp",detail.attributes().get("view"));
  assertTrue(Arrays.asList(detail.attributes().getOrDefault("routeAliases","").split("\u001f")).contains(link.attributes().get("target")),detail.attributes().toString());
 }

 @Test void relativeHtmlLinkWithoutQueryStringKeepsASingleAlias()throws Exception{
  write("src/main/webapp/WEB-INF/web.xml",WEB_XML);
  write("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/start' forward='/demo/menu.jsp'/></action-mappings></struts-config>");
  write("src/main/webapp/demo/menu.jsp",TAGLIB+"<html:link page=\"detail.jsp\">Open detail</html:link>");
  write("src/main/webapp/demo/detail.jsp","<h1>Detail</h1>");
  ApplicationGraph graph=analyze();
  assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
  GraphNode detail=graph.nodes().stream().filter(x->x.type()==NodeType.SCREEN&&"src/main/webapp/demo/detail.jsp".equals(x.attributes().get("view"))).findFirst().orElseThrow();
  assertEquals("/demo/detail.jsp",detail.attributes().get("routeAliases"));
 }
}
