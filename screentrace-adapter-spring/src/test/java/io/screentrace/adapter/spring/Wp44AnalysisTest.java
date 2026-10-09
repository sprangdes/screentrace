package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Wp44AnalysisTest {
 @TempDir Path root;
 void file(String name,String text)throws Exception{Path p=root.resolve(name);Files.createDirectories(p.getParent());Files.writeString(p,text);}
 ApplicationGraph analyze()throws Exception{return new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));}
 @Test void jspElRouteTemplateAddsInferredEntryWithoutChangingOriginalUrlResolution()throws Exception{
  file("src/main/java/Pages.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;@Controller class Pages{@GetMapping(\"/items/{id}\") String item(){return \"item\";}@GetMapping(\"/other/{id}\") String other(){return \"other\";}}\n");
  file("src/main/webapp/WEB-INF/jsp/list.jsp","<c:forEach items='${items}' var='item'><spring:url value='/items/${item.id}' var='detail'/><a href='${detail}'>View</a></c:forEach>\n");
  var g=analyze();var component=g.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&n.source().file().endsWith("list.jsp")).findFirst().orElseThrow();
  var behavior=g.behaviors().stream().filter(b->component.id().equals(b.triggerId())&&b.type()==BehaviorType.NAVIGATE).findFirst().orElseThrow();
  assertEquals("UNRESOLVED",component.attributes().get("targetStatus"));
  var edge=g.relationships().stream().filter(e->e.from().equals(component.id())&&e.type()==EdgeType.NAVIGATES_TO).findFirst().orElseThrow();
  assertEquals(Confidence.INFERRED,edge.confidence());assertTrue(edge.evidence().stream().anyMatch(e->e.detail()!=null&&e.detail().contains("/items/{id}")));
 }
 @Test void springSecurityLoginPageCarriesProtectedPatternsAndSourceEvidence()throws Exception{
  file("src/main/java/Login.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;@Controller class Login{@GetMapping(\"/login\") String login(){return \"login\";}}\n");
  file("src/main/webapp/WEB-INF/jsp/login.jsp","<form action='/login'></form>\n");
  file("src/main/resources/security.xml","<beans xmlns:security='http://www.springframework.org/schema/security'><security:http><security:intercept-url pattern='/admin/**' access='ROLE_USER'/><security:form-login login-page='/login' access-denied-page='/denied'/></security:http></beans>\n");
  var g=analyze();var login=g.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&n.attributes().getOrDefault("view","").endsWith("login.jsp")).findFirst().orElseThrow();
  assertEquals("LOGIN_PAGE",login.attributes().get("autoRedirect"));assertTrue(login.evidence().stream().anyMatch(e->e.source().file().equals("src/main/resources/security.xml")&&e.detail().contains("/admin/**")));
 }
 @Test void voidResponseStatusHandlerIsRestApiForMvcAndBoot()throws Exception{
  file("src/main/java/Cart.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;import org.springframework.http.HttpStatus;@Controller class Cart{@PutMapping(\"/cart\") @ResponseStatus(HttpStatus.NO_CONTENT) void update(){}}\n");
  for(boolean boot:List.of(false,true)){var g=boot?new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root)):analyze();var endpoint=g.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&n.attributes().getOrDefault("path","").equals("/cart")).findFirst().orElseThrow();assertEquals("REST_API",endpoint.attributes().get("category"));assertTrue(g.nodes().stream().noneMatch(n->n.type()==NodeType.SCREEN));}
 }
}
