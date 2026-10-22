package io.screentrace.adapter.struts;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;import java.nio.file.*;import io.screentrace.scanner.ProjectScanner;import io.screentrace.core.ApplicationGraph.*;import static org.junit.jupiter.api.Assertions.*;
/** chrisekelley/zeprs serves DWR's engine as js/engine2.jsp, loaded only through <script src=…;jsessionid=…>. */
class ScriptResourceJspTest {
 @TempDir Path root;void write(String name,String text)throws Exception{Path f=root.resolve(name);Files.createDirectories(f.getParent());Files.writeString(f,text);}
 @Test void jspLoadedOnlyAsScriptIsNotAScreen()throws Exception{
  write("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
  write("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings><action path='/chart' forward='/js/chart.jsp'/></action-mappings></struts-config>");
  write("src/main/webapp/home.jsp","<html><head><script type='text/javascript' src='/js/engine.jsp;jsessionid=${pageContext.request.session.id}'></script><script src='/js/chart.jsp'></script></head><body><a href='chart.do'>Chart</a></body></html>");
  write("src/main/webapp/js/engine.jsp","var sessionId=<%=\"'\"+session.getId()+\"'\"%>;\nfunction encode(s){var enc='';for(var i=0;i <s.length;i++){enc+=s.charAt(i);}return enc;}");
  write("src/main/webapp/js/chart.jsp","<html><body><h1>Chart</h1></body></html>");
  var graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  var views=graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN).map(n->n.attributes().get("view")).toList();
  assertFalse(views.contains("src/main/webapp/js/engine.jsp"),views.toString());
  assertTrue(views.contains("src/main/webapp/home.jsp"),views.toString());
  assertTrue(views.contains("src/main/webapp/js/chart.jsp"),"a forward target stays a screen even when also loaded as a script: "+views);
  var demoted=graph.diagnostics().stream().filter(d->d.code().equals("JSP_SCRIPT_RESOURCE")).toList();
  assertEquals(1,demoted.size(),graph.diagnostics().toString());
  assertTrue(demoted.get(0).evidence().stream().anyMatch(e->e.source().file().equals("src/main/webapp/home.jsp")&&e.detail().contains(";jsessionid=")));
  // The JSP is a server template, so its text is not analyzed as the page's JavaScript.
  assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("JS_TEMPLATE_SOURCE")&&d.message().contains("src/main/webapp/js/engine.jsp")),graph.diagnostics().toString());
  assertTrue(graph.diagnostics().stream().noneMatch(d->d.code().equals("JS_SYNTAX_ERROR")&&d.source().file().endsWith("engine.jsp")),graph.diagnostics().toString());
 }
}
