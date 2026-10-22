package io.screentrace.adapter.struts;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;import java.nio.file.*;import io.screentrace.scanner.ProjectScanner;import io.screentrace.core.ApplicationGraph.*;import static org.junit.jupiter.api.Assertions.*;
/** oussamazoghlami/SpringStrutsHibernate: pages/tiles/includes.jsp (taglib lines only) appeared as an empty screen "includes". */
class DirectiveOnlyJspScreenTest {
 @TempDir Path root;void write(String name,String text)throws Exception{Path f=root.resolve(name);Files.createDirectories(f.getParent());Files.writeString(f,text);}
 @Test void taglibOnlyJspIsNotAScreen()throws Exception{
  write("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
  write("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/home' forward='/home.jsp'/></action-mappings></struts-config>");
  write("src/main/webapp/pages/tiles/includes.jsp","<%@ taglib uri=\"http://struts.apache.org/tags-bean\" prefix=\"bean\"%>\n<%@ taglib uri=\"http://struts.apache.org/tags-html\" prefix=\"html\"%>\n");
  write("src/main/webapp/home.jsp","<%@ include file=\"/pages/tiles/includes.jsp\" %><h1>Home</h1>");
  var graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  var screens=graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN).map(n->n.attributes().get("view")).toList();
  assertEquals(java.util.List.of("src/main/webapp/home.jsp"),screens);
 }
}
