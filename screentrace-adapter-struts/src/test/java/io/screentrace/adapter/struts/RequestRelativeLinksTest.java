package io.screentrace.adapter.struts;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;import java.nio.file.*;import java.util.*;import io.screentrace.scanner.ProjectScanner;import io.screentrace.core.ApplicationGraph;import io.screentrace.core.ApplicationGraph.*;import static org.junit.jupiter.api.Assertions.*;
/** A relative link resolves against the URL the page is requested at, not the JSP's folder. */
class RequestRelativeLinksTest {
 @TempDir Path root;void write(String name,String text)throws Exception{Path f=root.resolve(name);Files.createDirectories(f.getParent());Files.writeString(f,text);}
 private static final String WEB_XML="<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>";
 private ApplicationGraph analyze()throws Exception{return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));}
 private static List<String> triggered(ApplicationGraph graph,String label){Map<String,GraphNode> n=new HashMap<>();graph.nodes().forEach(x->n.put(x.id(),x));
  return graph.relationships().stream().filter(e->e.type()==EdgeType.TRIGGERS&&n.get(e.from()).name().equals(label)).map(e->n.get(e.to()).attributes().get("path")).distinct().sorted().toList();}

 @Test void menuInATilesLayoutReachesTheActionsOfThePagesUsingIt()throws Exception{
  // oussamazoghlami/SpringStrutsHibernate: struts-menu location="AddCustomer.do" in pages/tiles/mainLayout.jsp, pages served at /*.do.
  write("src/main/webapp/WEB-INF/web.xml",WEB_XML);
  write("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/ListCustomer' type='org.apache.struts.actions.ForwardAction' parameter='.page.list'/><action path='/AddCustomer' type='org.apache.struts.actions.ForwardAction' parameter='.page.list'/></action-mappings>"
   +"<plug-in className='org.apache.struts.tiles.TilesPlugin'><set-property property='definitions-config' value='/WEB-INF/tiles-defs.xml'/></plug-in>"
   +"<plug-in className='net.sf.navigator.menu.MenuPlugIn'><set-property property='menuConfig' value='/WEB-INF/menu-config.xml'/></plug-in></struts-config>");
  write("src/main/webapp/WEB-INF/tiles-defs.xml","<tiles-definitions><definition name='base' path='/pages/tiles/mainLayout.jsp'/><definition name='.page.list' extends='base'><put name='body' value='/pages/list.jsp'/></definition></tiles-definitions>");
  write("src/main/webapp/WEB-INF/menu-config.xml","<MenuConfig><Menus><Menu name='admin'><Item title='Add a new customer' location='AddCustomer.do'/></Menu></Menus></MenuConfig>");
  write("src/main/webapp/pages/tiles/mainLayout.jsp","<%@ taglib uri=\"http://struts.apache.org/tags-tiles\" prefix=\"tiles\"%><%@ taglib uri=\"http://struts-menu.sf.net/tag\" prefix=\"menu\" %>\n<menu:displayMenu name=\"admin\"/><a href=\"ListCustomer.do\">List</a><tiles:insert attribute=\"body\"/>");
  write("src/main/webapp/pages/list.jsp","<h1>Customers</h1>");
  var graph=analyze();
  assertEquals(List.of("/AddCustomer.do"),triggered(graph,"Add a new customer"));
  assertEquals(List.of("/ListCustomer.do"),triggered(graph,"List"));
  assertTrue(graph.nodes().stream().noneMatch(x->x.type()==NodeType.ENDPOINT&&"UNRESOLVED".equals(x.attributes().get("mappingStatus"))),"no placeholder endpoints");
  var link=graph.nodes().stream().filter(x->x.name().equals("Add a new customer")).findFirst().orElseThrow();
  assertTrue(link.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.INFERRED&&String.valueOf(e.detail()).contains("請求目錄")),link.evidence().toString());
 }

 @Test void forwardedJspUnderWebInfResolvesAgainstTheActionUrl()throws Exception{
  write("src/main/webapp/WEB-INF/web.xml",WEB_XML);
  write("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/shop/list' forward='/WEB-INF/views/list.jsp'/><action path='/shop/detail' forward='/WEB-INF/views/detail.jsp'/></action-mappings></struts-config>");
  write("src/main/webapp/WEB-INF/views/list.jsp","<a href=\"detail.do?id=1\">Detail</a>");
  write("src/main/webapp/WEB-INF/views/detail.jsp","<h1>Detail</h1>");
  assertEquals(List.of("/shop/detail.do"),triggered(analyze(),"Detail"));
 }

 @Test void aPageServedFromTwoDirectoriesKeepsTheFolderReading()throws Exception{
  write("src/main/webapp/WEB-INF/web.xml",WEB_XML);
  write("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/a/one' forward='/shared.jsp'/><action path='/b/two' forward='/shared.jsp'/><action path='/next' forward='/shared.jsp'/></action-mappings></struts-config>");
  write("src/main/webapp/shared.jsp","<a href=\"next.do\">Next</a>");
  var graph=analyze();
  var link=graph.nodes().stream().filter(x->x.name().equals("Next")).findFirst().orElseThrow();
  assertFalse(link.attributes().containsKey("requestRelative"),"several request directories: no request-relative reading");
 }
}
