package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.scanner.ProjectScanner;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class Batch4ViewResolutionTest {
 private Path root() throws Exception {Path r=Files.createTempDirectory("batch4-views");Files.createDirectories(r.resolve("src/main/webapp"));for(String name:List.of("login","list"))Files.writeString(r.resolve("src/main/webapp/"+name+".jsp"),"<p>"+name+"</p>");return r;}
 private void config(Path r,String setters)throws Exception {Files.writeString(r.resolve("Config.java"),"class Config { @Bean InternalResourceViewResolver resolver(){ InternalResourceViewResolver r=new InternalResourceViewResolver(); "+setters+" return r; }}");}
 @Test void suffixOnlyUsesEmptyPrefixDefaultAndResolvesBothSetterBranches()throws Exception {
  Path r=root();config(r,"r.setViewClass(JstlView.class); r.setSuffix(\".jsp\");");
  Files.writeString(r.resolve("C.java"),"@Controller class C { @GetMapping(\"/entry\") ModelAndView entry(){ModelAndView m=new ModelAndView(); if(ok){m.setViewName(\"list\");return m;}else{m.setViewName(\"login\");}return m;} }");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));var renders=g.relationships().stream().filter(e->e.type()==EdgeType.RENDERS).toList();assertEquals(2,renders.size());
  assertEquals(Set.of("src/main/webapp/login.jsp","src/main/webapp/list.jsp"),new HashSet<>(renders.stream().map(e->g.nodes().stream().filter(n->n.id().equals(e.to())).findFirst().orElseThrow().attributes().get("view")).toList()));
  assertTrue(renders.stream().allMatch(e->e.evidence().stream().anyMatch(p->p.detail().contains("條件="))));
 }
 @Test void relativeRedirectsUseTheRequestDirectoryAndOnlyPublicResources()throws Exception {
  Path r=root();Files.writeString(r.resolve("C.java"),"@Controller class C { @GetMapping(\"/\") String first(){return \"redirect:login.jsp\";} @GetMapping(\"/folder/start\") String missing(){return \"redirect:login.jsp\";} @GetMapping(\"/external\") String external(){return \"redirect:https://example.invalid/login.jsp\";} }");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));var first=g.nodes().stream().filter(n->n.type()==NodeType.HANDLER&&n.attributes().get("method").equals("first")).findFirst().orElseThrow();
  assertEquals(1,g.relationships().stream().filter(e->e.type()==EdgeType.FORWARDS_TO&&e.from().equals(first.id())).count());assertEquals(1,g.relationships().stream().filter(e->e.type()==EdgeType.FORWARDS_TO).count());
 }
 @Test void conditionalDynamicOrEscapedResolverIsNotAssumedDefault()throws Exception {
  for(String setter:List.of("if(ok) r.setSuffix(\".jsp\");","r.setSuffix(config());","r.setViewClass(CustomView.class);r.setSuffix(\".jsp\");","modify(r);","r.setSuffix(\".jsp\"); r.setPrefix(prefix);")) {
   Path r=root();config(r,setter);Files.writeString(r.resolve("C.java"),"@Controller class C { @GetMapping(\"/entry\") String entry(){return \"login\";} }");var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));assertTrue(g.nodes().stream().anyMatch(n->n.type()==NodeType.SCREEN&&"login".equals(n.attributes().get("view"))),setter);
  }
 }
 @Test void escapedAndPartiallyAssignedModelRemainUnresolved()throws Exception {
  for(String body:List.of("if(ok)m.setViewName(\"list\");", "m.setViewName(\"list\"); modify(m);", "if(ok)m.setViewName(\"list\");else m.setViewName(dynamic());","m.setViewName(\"list\");Runnable change=()->m.setViewName(\"login\");change.run();")) {
   Path r=root();config(r,"r.setSuffix(\".jsp\");");Files.writeString(r.resolve("C.java"),"@Controller class C { @GetMapping(\"/entry\") ModelAndView entry(){ModelAndView m=new ModelAndView(); "+body+"return m;} }");var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));assertFalse(g.relationships().stream().anyMatch(e->e.type()==EdgeType.RENDERS),body);
  }
 }
 @Test void malformedJavaDoesNotAbortTheOtherViewAnalysis()throws Exception {
  Path r=root();config(r,"r.setSuffix(\".jsp\");");Files.writeString(r.resolve("Broken.java"),"class Broken { this is not Java }");Files.writeString(r.resolve("C.java"),"@Controller class C { @GetMapping(\"/entry\") String entry(){return \"login\";} }");var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));assertTrue(g.relationships().stream().anyMatch(e->e.type()==EdgeType.RENDERS));assertTrue(g.diagnostics().stream().anyMatch(d->d.code().equals("SPRING_VIEW_RESOLVER_UNRESOLVED")&&d.source().file().equals("Broken.java")));
 }

}
