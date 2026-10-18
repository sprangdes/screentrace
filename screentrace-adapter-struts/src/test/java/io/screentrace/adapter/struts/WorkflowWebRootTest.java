package io.screentrace.adapter.struts;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.scanner.ProjectScanner;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
class WorkflowWebRootTest {
 @Test void relativeLinksResolveUnderNetbeansWebRoot() throws Exception {
  Path r=Files.createTempDirectory("workflow-web");Files.createDirectories(r.resolve("web/WEB-INF"));
  Files.writeString(r.resolve("web/WEB-INF/struts-config.xml"),"<struts-config/>");
  Files.writeString(r.resolve("web/login.jsp"),"<html:link href=\"register.jsp\">Register</html:link>");
  Files.writeString(r.resolve("web/register.jsp"),"<p>Register</p>");
  var g=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(r));
  var screen=g.nodes().stream().filter(n->"web/register.jsp".equals(n.attributes().get("view"))).findFirst().orElseThrow();
  assertTrue(g.relationships().stream().anyMatch(e->e.type()==EdgeType.NAVIGATES_TO&&e.to().equals(screen.id())));
 }
}
