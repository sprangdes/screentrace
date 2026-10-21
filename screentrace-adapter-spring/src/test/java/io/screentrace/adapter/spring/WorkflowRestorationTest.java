package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.scanner.ProjectScanner;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
class WorkflowRestorationTest {
 @Test void setterAndBootResolverConnectToPhysicalViews() throws Exception {
  Path root=Files.createTempDirectory("workflow-mvc");
  write(root,"pom.xml","<project><artifactId>spring-boot</artifactId></project>");
  write(root,"src/main/resources/application.properties","spring.mvc.view.prefix=/WEB-INF/views\nspring.mvc.view.suffix=.jsp\n");
  write(root,"src/main/webapp/WEB-INF/views/catalog.jsp","<p>Catalog</p>");
  write(root,"src/main/webapp/WEB-INF/views/account/login.jsp","<p>Login</p>");
  write(root,"X.java","@Controller class X { @GetMapping(\"/catalog\") ModelAndView catalog(){ ModelAndView m=new ModelAndView(); m.addObject(\"items\", service.all()); m.setViewName(\"catalog\"); return m; } @GetMapping(\"/login\") String login(){ return \"/account/login\"; }}");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
  assertEquals(2,g.nodes().stream().filter(n->n.type()==NodeType.SCREEN).count());
  assertEquals(2,g.relationships().stream().filter(e->e.type()==EdgeType.RENDERS).count());
  assertTrue(g.diagnostics().stream().noneMatch(d->d.message().contains("No JSP source")));
 }
 @Test void conditionalViewSetterRemainsUnresolved() throws Exception {
  Path root=Files.createTempDirectory("workflow-mvc-conditional");
  write(root,"X.java","@Controller class X { @GetMapping(\"/x\") ModelAndView x(){ ModelAndView m=new ModelAndView(); if(flag) m.setViewName(\"one\"); return m; }}");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
  assertEquals(0,g.relationships().stream().filter(e->e.type()==EdgeType.RENDERS).count());
 }
 private static void write(Path r,String f,String s)throws Exception{Path p=r.resolve(f);Files.createDirectories(p.getParent());Files.writeString(p,s);}
}
