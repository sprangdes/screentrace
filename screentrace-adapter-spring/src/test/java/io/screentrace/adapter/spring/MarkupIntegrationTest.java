package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
class MarkupIntegrationTest {
  @Test void bindsProvenModelFieldsAndExposesRulesEventsAndRawUrlEvidence() throws Exception {
    Path root=Files.createTempDirectory("spring-markup");Path jsp=root.resolve("src/main/webapp/WEB-INF/jsp/form.jsp"),java=root.resolve("src/main/java/Controller.java");
    Files.createDirectories(jsp.getParent());Files.createDirectories(java.getParent());
    Files.writeString(root.resolve("pom.xml"),"<project><dependency><artifactId>spring-webmvc</artifactId></dependency></project>");
    Files.writeString(java,"import org.springframework.stereotype.Controller; import org.springframework.web.bind.annotation.*; @Controller class Controller { @GetMapping(\"/form\") String form(@ModelAttribute(\"order\") Order order){return \"form\";} } class Order { String email; }");
    Files.writeString(jsp,"<spring:url var='url' value='/form'/>\n<a href='${url}'>Form</a><form:form modelAttribute='order'><form:input path='email' required='required' onchange='validate()'/><form:input path='missing'/></form:form>");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    var email=graph.nodes().stream().filter(n->"email".equals(n.attributes().get("path"))).findFirst().orElseThrow();
    assertEquals("CONFIRMED",email.attributes().get("bindingStatus"));
    assertTrue(graph.relationships().stream().anyMatch(e->e.from().equals(email.id())&&e.type()==EdgeType.BINDS_TO));
    assertEquals("validate()",email.attributes().get("event.change"));
    assertTrue(graph.validationRules().stream().anyMatch(r->r.kind().equals("required")&&r.fields().contains(email.id())));
    assertTrue(graph.nodes().stream().anyMatch(n->"${url}".equals(n.attributes().get("originalExpression"))&&n.evidence().stream().anyMatch(e->e.parser().equals("JspUrlVariableResolver"))));
    assertTrue(graph.nodes().stream().filter(n->"missing".equals(n.attributes().get("path"))).allMatch(n->"UNRESOLVED".equals(n.attributes().get("bindingStatus"))));
  }
  @Test void unrelatedSameNamedAnnotationsDoNotBecomeConfirmedModelBindings() throws Exception {
    Path root=Files.createTempDirectory("spring-model-annotation"),jsp=root.resolve("src/main/webapp/WEB-INF/jsp/form.jsp"),java=root.resolve("src/main/java/Controller.java");
    Files.createDirectories(jsp.getParent());Files.createDirectories(java.getParent());
    Files.writeString(jsp,"<form:form modelAttribute='order'><form:input path='email'/></form:form>");
    Files.writeString(java,"import example.ModelAttribute; import org.springframework.stereotype.Controller; import org.springframework.web.bind.annotation.GetMapping; @Controller class Controller { @GetMapping(\"/form\") String form(@ModelAttribute(\"order\") Order order){return \"form\";} } class Order { String email; }");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(graph.nodes().stream().filter(n->"email".equals(n.attributes().get("path"))).allMatch(n->"UNRESOLVED".equals(n.attributes().get("bindingStatus"))));
  }

}
