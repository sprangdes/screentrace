package io.screentrace.adapter.struts;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;import java.nio.file.*;import java.util.*;import io.screentrace.scanner.ProjectScanner;import io.screentrace.core.ApplicationGraph.*;import static org.junit.jupiter.api.Assertions.*;
/** oussamazoghlami/SpringStrutsHibernate: struts-menu items are links that reach their actions. */
class StrutsMenuLinksTest {
 @TempDir Path root;void write(String name,String text)throws Exception{Path f=root.resolve(name);Files.createDirectories(f.getParent());Files.writeString(f,text);}
 @Test void menuItemsBecomeLinksToTheirActions()throws Exception{
  write("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
  write("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/AddCustomer' forward='/add.jsp'/><action path='/ListCustomer' forward='/list.jsp'/></action-mappings>"
   +"<plug-in className='net.sf.navigator.menu.MenuPlugIn'><set-property property='menuConfig' value='/WEB-INF/menu-config.xml'/></plug-in></struts-config>");
  write("src/main/webapp/WEB-INF/menu-config.xml","<MenuConfig><Menus><Menu name='adminCustomer'><Item title='Add a new customer' location='AddCustomer.do'/><Item title='List all customers' location='ListCustomer.do'/></Menu></Menus></MenuConfig>");
  write("src/main/webapp/home.jsp","<%@ taglib uri=\"http://struts-menu.sf.net/tag\" prefix=\"menu\" %>\n<menu:useMenuDisplayer name=\"TabbedMenu\"><menu:displayMenu name=\"adminCustomer\"/></menu:useMenuDisplayer>");
  write("src/main/webapp/add.jsp","<h1>Add</h1>");write("src/main/webapp/list.jsp","<h1>List</h1>");
  var graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  Map<String,GraphNode> nodes=new HashMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));
  for(var entry:Map.of("Add a new customer","/AddCustomer.do","List all customers","/ListCustomer.do").entrySet()){
   var link=graph.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&n.name().equals(entry.getKey())).findFirst().orElseThrow(()->new AssertionError("no "+entry.getKey()+": "+graph.nodes().stream().filter(n->n.type()==NodeType.COMPONENT).map(GraphNode::name).toList()));
   assertTrue(graph.relationships().stream().anyMatch(e->e.type()==EdgeType.TRIGGERS&&e.from().equals(link.id())&&entry.getValue().equals(nodes.get(e.to()).attributes().get("path"))),entry.getKey());
   assertEquals(2,link.source().line(),"menu items keep the displayMenu line");
  }
 }
}
