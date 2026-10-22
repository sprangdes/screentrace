package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** RawSanj/spring-tiles-sample-app: Spring 4.0 trailing-slash Ajax URLs and Spring Security 3.2 XML namespace processors. */
class LegacySpringRequestMatchingTest {
  @Test void legacyAjaxAndSecurityNamespaceRequestsReachTheirEndpoints() throws Exception {
    Path root = Files.createTempDirectory("st-legacy-spring-requests");
    Path webInf = root.resolve("src/main/webapp/WEB-INF");
    Files.createDirectories(webInf.resolve("jsp"));
    Files.writeString(root.resolve("pom.xml"), "<project><properties><org.springframework.version>4.0.2.RELEASE</org.springframework.version><spring.security.version>3.2.3.RELEASE</spring.security.version></properties><dependencies>"
        + "<dependency><artifactId>spring-webmvc</artifactId><version>${org.springframework.version}</version></dependency>"
        + "<dependency><artifactId>spring-security-config</artifactId><version>${spring.security.version}</version></dependency></dependencies></project>");
    Files.writeString(root.resolve("X.java"), "import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*; @Controller @RequestMapping(\"account\") class X {"
        + " @RequestMapping(\"\") String account(){ return \"account\"; }"
        + " @RequestMapping(value=\"/upload\", method=RequestMethod.POST) String upload(){ return \"redirect:/account\"; } }"
        + " @Controller class L { @RequestMapping(\"/login\") String login(){ return \"login\"; } }");
    Files.writeString(webInf.resolve("security.xml"), """
        <beans:beans xmlns="http://www.springframework.org/schema/security" xmlns:beans="http://www.springframework.org/schema/beans">
          <http use-expressions="true">
            <form-login login-page="/login" default-target-url="/account" authentication-failure-url="/login?success=false"/>
            <logout logout-url="/logout" logout-success-url="/login"/>
          </http>
        </beans:beans>
        """);
    Files.writeString(webInf.resolve("jsp/login.jsp"), "<form action=\"<spring:url value='/j_spring_security_check' />\" method=\"POST\"><input name=\"j_username\"><button type=\"submit\">Sign In</button></form>");
    Files.writeString(webInf.resolve("jsp/account.jsp"), "<a href=\"<spring:url value='/logout'/>\">Sign out</a><input type=\"button\" id=\"fileSubmit\" value=\"Upload\"/>"
        + "<script>$('#fileSubmit').click(function(){ $.ajax({ url: '/account/upload/', type: 'POST', data: {} }); });</script>");

    ApplicationGraph graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    Map<String, ApplicationGraph.GraphNode> nodes = graph.nodes().stream().collect(Collectors.toMap(ApplicationGraph.GraphNode::id, n -> n));
    java.util.function.Predicate<String> reached = name -> graph.relationships().stream().anyMatch(edge -> nodes.containsKey(edge.to())
        && name.equals(nodes.get(edge.to()).name()) && edge.type() == ApplicationGraph.EdgeType.TRIGGERS)
        || graph.behaviors().stream().anyMatch(b -> b.targetId() != null && nodes.containsKey(b.targetId()) && name.equals(nodes.get(b.targetId()).name()));

    var login = graph.nodes().stream().filter(n -> n.name().equals("POST /j_spring_security_check")).findFirst().orElseThrow();
    assertEquals("SECURITY_PROCESSOR", login.attributes().get("category"));
    assertEquals(ApplicationGraph.Confidence.INFERRED, login.confidence(), "Security 3.2 default, not configured");
    assertTrue(login.evidence().stream().anyMatch(e -> e.detail().contains("3.2.3.RELEASE")));
    var logout = graph.nodes().stream().filter(n -> n.name().equals("ANY /logout")).findFirst().orElseThrow();
    assertEquals(ApplicationGraph.Confidence.CONFIRMED, logout.confidence(), "logout-url is configured");

    assertTrue(reached.test("POST /j_spring_security_check"), "login form submit");
    assertTrue(reached.test("ANY /logout"), "sign-out link");
    assertTrue(reached.test("POST /account/upload"), "trailing-slash Ajax URL");
    assertTrue(graph.nodes().stream().noneMatch(n -> n.name().equals("POST /account/upload/")), "no phantom trailing-slash endpoint");
    assertTrue(graph.diagnostics().stream().noneMatch(d -> d.code().equals("URL_UNRESOLVED")), "no stale miss once the processor resolves: " + graph.diagnostics());
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.FORWARDS_TO
        && nodes.get(edge.from()).name().equals("來源設定的登入處理") && nodes.get(edge.to()).name().equals("account")), "default-target-url");
  }
}
