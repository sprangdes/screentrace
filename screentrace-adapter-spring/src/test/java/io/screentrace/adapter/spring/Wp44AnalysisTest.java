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
 @Test void jspSpringUrlTagExpressionKeepsItsValueAsRouteTemplate()throws Exception{
  file("src/main/java/Pages.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;@Controller class Pages{@GetMapping(\"/items/{id}\") String item(){return \"item\";}}\n");
  file("src/main/webapp/WEB-INF/jsp/list.jsp","<a href=\"<spring:url value='/items/${item.id}'/>\">View</a>\n");
  var g=analyze();assertTrue(g.relationships().stream().anyMatch(e->e.type()==EdgeType.NAVIGATES_TO&&e.confidence()==Confidence.INFERRED));
 }
 @Test void jspRouteInferenceFollowsMatchedHandlerRedirectToScreen()throws Exception{
  file("src/main/java/Pages.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;@Controller class Pages{@GetMapping(\"/items/{id}\") String item(){return \"redirect:/items\";}@GetMapping(\"/items\") String list(){return \"list\";}}\n");
  file("src/main/webapp/WEB-INF/jsp/list.jsp","<a href=\"<spring:url value='/items/${item.id}'/>\">Remove</a>\n");
  var g=analyze();var screen=g.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&n.attributes().getOrDefault("view","").endsWith("list.jsp")).findFirst().orElseThrow();assertTrue(g.relationships().stream().anyMatch(e->e.type()==EdgeType.NAVIGATES_TO&&e.to().equals(screen.id())&&e.confidence()==Confidence.INFERRED));
 }
 @Test void inferredJspLinkHasTheSameEndpointAndScreenRelationsAsAConfirmedLink()throws Exception{
  file("src/main/java/Pages.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;@Controller class Pages{@GetMapping(\"/items/{id}\") String item(){return \"redirect:/items\";}@GetMapping(\"/items\") String list(){return \"list\";}}\n");
  file("src/main/webapp/WEB-INF/jsp/list.jsp","<a href=\"<spring:url value='/items/${item.id}'/>\">View item</a>\n");
  var g=analyze();var component=g.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&n.source().file().endsWith("list.jsp")).findFirst().orElseThrow();
  var endpoint=g.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/items/{id}".equals(n.attributes().get("path"))).findFirst().orElseThrow();
  var destination=g.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&n.attributes().getOrDefault("view","").endsWith("list.jsp")).findFirst().orElseThrow();
  assertTrue(g.relationships().stream().anyMatch(e->e.from().equals(component.id())&&e.to().equals(endpoint.id())&&e.type()==EdgeType.TRIGGERS&&e.confidence()==Confidence.INFERRED));
  assertTrue(g.relationships().stream().anyMatch(e->e.from().equals(component.id())&&e.to().equals(destination.id())&&e.type()==EdgeType.NAVIGATES_TO&&e.confidence()==Confidence.INFERRED));
 }
 @Test void cUrlUsesTheSeparateRouteProjectionAndAmbiguityKeepsEveryCandidate()throws Exception{
  file("src/main/java/Pages.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;@Controller class Pages{@GetMapping(\"/items/{id}\") String one(){return \"one\";}@GetMapping(\"/items/{key}\") String two(){return \"two\";}}\n");
  file("src/main/webapp/WEB-INF/jsp/list.jsp","<c:forEach items='${items}' var='item'><c:url value='/items/${item.id}' var='detail'/><a href='${detail}'>View</a></c:forEach>\n");
  var g=analyze();var component=g.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&n.source().file().endsWith("list.jsp")).findFirst().orElseThrow();var behavior=g.behaviors().stream().filter(b->component.id().equals(b.triggerId())&&b.type()==BehaviorType.NAVIGATE).findFirst().orElseThrow();
  assertEquals("UNRESOLVED",component.attributes().get("targetStatus"));assertTrue(g.relationships().stream().noneMatch(e->e.from().equals(component.id())&&e.type()==EdgeType.NAVIGATES_TO));assertTrue(behavior.evidence().stream().anyMatch(e->e.parser().equals("RouteTemplateInference")&&e.resolution()==ResolutionStatus.AMBIGUOUS&&e.detail().contains("/items/{id}")&&e.detail().contains("/items/{key}")));
 }
 @Test void noMatchingRouteAndMethodMismatchStayUnresolved()throws Exception{
  file("src/main/java/Pages.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;@Controller class Pages{@PostMapping(\"/items/{id}\") String item(){return \"item\";}}\n");file("src/main/webapp/WEB-INF/jsp/list.jsp","<a href='/items/${item.id}'>GET</a><a href='/missing/${item.id}'>Missing</a>\n");
  var g=analyze();assertTrue(g.relationships().stream().noneMatch(e->e.type()==EdgeType.NAVIGATES_TO));assertTrue(g.behaviors().stream().filter(b->b.type()==BehaviorType.NAVIGATE).allMatch(b->b.evidence().stream().anyMatch(e->e.parser().equals("RouteTemplateInference")&&e.resolution()==ResolutionStatus.UNRESOLVED)));
 }
 @Test void springSecurityLoginPageCarriesProtectedPatternsAndSourceEvidence()throws Exception{
  file("src/main/java/Login.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;@Controller class Login{@GetMapping(\"/login\") String login(){return \"login\";}}\n");
  file("src/main/webapp/WEB-INF/jsp/login.jsp","<form action='/login'></form>\n");
  file("src/main/resources/security.xml","<beans xmlns:security='http://www.springframework.org/schema/security'><security:http><security:intercept-url pattern='/admin/**' access='ROLE_USER'/><security:form-login login-page='/login' access-denied-page='/denied'/></security:http></beans>\n");
  var g=analyze();var login=g.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&n.attributes().getOrDefault("view","").endsWith("login.jsp")).findFirst().orElseThrow();
  assertEquals("LOGIN_PAGE",login.attributes().get("autoRedirect"));assertTrue(login.evidence().stream().anyMatch(e->e.source().file().equals("src/main/resources/security.xml")&&e.detail().contains("/admin/**")));
 }
 @Test void springSecurityJavaLiteralsAndDynamicValuesAreSeparated()throws Exception{
  file("src/main/java/Pages.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;@Controller class Pages{@GetMapping(\"/login\") String login(){return \"login\";}@GetMapping(\"/denied\") String denied(){return \"denied\";}}\n");file("src/main/webapp/WEB-INF/jsp/login.jsp","login\n");file("src/main/webapp/WEB-INF/jsp/denied.jsp","denied\n");
  file("src/main/java/Security.java","class Security { void configure(){ http.formLogin().loginPage(\"/login\"); http.exceptionHandling().accessDeniedPage(\"/denied\"); http.authorizeHttpRequests().requestMatchers(\"/private/**\").authenticated(); } }\n");
  var g=analyze();assertTrue(g.nodes().stream().anyMatch(n->n.type()==NodeType.SCREEN&&"LOGIN_PAGE".equals(n.attributes().get("autoRedirect"))));var denied=g.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&"ACCESS_DENIED".equals(n.attributes().get("autoRedirect"))).findFirst().orElseThrow();assertTrue(denied.evidence().stream().anyMatch(e->e.detail().contains("/private/**")));
  file("src/main/java/Security.java","class Security { void configure(String path){ http.formLogin().loginPage(path); } }\n");var dynamic=analyze();assertTrue(dynamic.nodes().stream().noneMatch(n->n.attributes().containsKey("autoRedirect")));assertTrue(dynamic.diagnostics().stream().anyMatch(d->d.code().equals("SPRING_SECURITY_DYNAMIC_REDIRECT")));
 }
 @Test void voidResponseStatusHandlerIsRestApiForMvcAndBoot()throws Exception{
  file("src/main/java/Cart.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;import org.springframework.http.HttpStatus;@Controller class Cart{@PutMapping(\"/cart\") @ResponseStatus(HttpStatus.NO_CONTENT) void update(){}}\n");
  for(boolean boot:List.of(false,true)){var g=boot?new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root)):analyze();var endpoint=g.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&n.attributes().getOrDefault("path","").equals("/cart")).findFirst().orElseThrow();assertEquals("REST_API",endpoint.attributes().get("category"));assertTrue(g.nodes().stream().noneMatch(n->n.type()==NodeType.SCREEN));}
 }
}
