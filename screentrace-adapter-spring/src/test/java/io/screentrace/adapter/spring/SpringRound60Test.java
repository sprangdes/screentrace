package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R60: Spring mapping and view resolution fixes from the 2026-11-14 code review. */
class SpringRound60Test {
  @TempDir Path root;

  private void write(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  private ApplicationGraph mvc() throws Exception {
    return new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  private static List<String> endpoints(ApplicationGraph graph) {
    return graph.nodes().stream()
        .filter(n -> n.type() == NodeType.ENDPOINT)
        .map(GraphNode::name)
        .sorted()
        .toList();
  }

  @Test
  void requestMappingWithSeveralMethodsGetsOneEndpointPerMethod() throws Exception {
    // RV-202: method={GET,POST} used to become one endpoint named "{ GET, POST } /save".
    write(
        "src/main/webapp/WEB-INF/views/form.jsp",
        "<form method='post' action='/save'><input type='submit' value='Save'/></form>");
    write(
        "Config.java",
        "class Config { @Bean InternalResourceViewResolver r(){ InternalResourceViewResolver r=new InternalResourceViewResolver(); r.setPrefix(\"/WEB-INF/views/\"); r.setSuffix(\".jsp\"); return r; }}");
    write(
        "C.java",
        "@Controller class C {"
            + " @GetMapping(\"/form\") String form(){return \"form\";}"
            + " @RequestMapping(value=\"/save\", method={RequestMethod.GET, RequestMethod.POST}) String save(){return \"form\";} }");
    var graph = mvc();
    assertTrue(
        endpoints(graph).containsAll(List.of("GET /save", "POST /save")),
        endpoints(graph).toString());
    assertTrue(endpoints(graph).stream().noneMatch(name -> name.contains("{")));
    String post =
        graph.nodes().stream()
            .filter(n -> n.name().equals("POST /save"))
            .findFirst()
            .orElseThrow()
            .id();
    assertTrue(
        graph.relationships().stream()
            .anyMatch(e -> e.type() == EdgeType.TRIGGERS && e.to().equals(post)),
        graph.relationships().toString());
  }

  @Test
  void restControllerWithSeveralMethodsGetsOneEndpointPerMethod() throws Exception {
    write(
        "Api.java",
        "@RestController class Api { @RequestMapping(path=\"/items\", method={RequestMethod.PUT, RequestMethod.PATCH}) String update(){return \"\";} }");
    var graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
    assertEquals(List.of("PATCH /items", "PUT /items"), endpoints(graph));
  }

  @Test
  void eachHttpBlockKeepsItsOwnLoginProcessorAndDestination() throws Exception {
    // RV-203: two <http> blocks in one file shared one handler, mixing their destinations.
    write(
        "pom.xml",
        "<project><dependencies><dependency><artifactId>spring-webmvc</artifactId><version>4.0.2.RELEASE</version></dependency>"
            + "<dependency><artifactId>spring-security-config</artifactId><version>3.2.3.RELEASE</version></dependency></dependencies></project>");
    write(
        "C.java",
        "@Controller class C { @RequestMapping(\"/admin\") String admin(){return \"admin\";}"
            + " @RequestMapping(\"/home\") String home(){return \"home\";} }");
    write("src/main/webapp/WEB-INF/views/admin.jsp", "<p>Admin</p>");
    write("src/main/webapp/WEB-INF/views/home.jsp", "<p>Home</p>");
    write(
        "Config.java",
        "class Config { @Bean InternalResourceViewResolver r(){ InternalResourceViewResolver r=new InternalResourceViewResolver(); r.setPrefix(\"/WEB-INF/views/\"); r.setSuffix(\".jsp\"); return r; }}");
    write(
        "src/main/webapp/WEB-INF/security.xml",
        "<beans:beans xmlns=\"http://www.springframework.org/schema/security\" xmlns:beans=\"http://www.springframework.org/schema/beans\">\n"
            + "<http pattern=\"/admin/**\"><form-login login-processing-url=\"/admin/login\" default-target-url=\"/admin\"/></http>\n"
            + "<http><form-login login-processing-url=\"/login\" default-target-url=\"/home\"/></http>\n"
            + "</beans:beans>");
    var graph = mvc();
    var handlers =
        graph.relationships().stream()
            .filter(e -> e.type() == EdgeType.HANDLED_BY)
            .filter(
                e ->
                    graph.nodes().stream()
                        .anyMatch(
                            n ->
                                n.id().equals(e.from())
                                    && "SECURITY_PROCESSOR".equals(n.attributes().get("category"))))
            .map(Relationship::to)
            .distinct()
            .toList();
    assertEquals(2, handlers.size(), graph.relationships().toString());
    for (String handler : handlers)
      assertEquals(
          1,
          graph.relationships().stream()
              .filter(e -> e.type() == EdgeType.FORWARDS_TO && e.from().equals(handler))
              .count(),
          handler + " " + graph.relationships());
  }

  @Test
  void beanNameUrlMappingAndValueRefByNameCreateEndpoints() throws Exception {
    // RV-205: name="/welcome.htm" (the usual BeanNameUrlHandlerMapping form) made no endpoint.
    write("src/main/webapp/WEB-INF/jsp/welcome.jsp", "<p>Welcome</p>");
    write("src/main/webapp/WEB-INF/jsp/list.jsp", "<p>List</p>");
    write(
        "src/main/webapp/WEB-INF/dispatcher-servlet.xml",
        "<beans>"
            + "<bean class=\"org.springframework.web.servlet.view.InternalResourceViewResolver\"><property name=\"prefix\" value=\"/WEB-INF/jsp/\"/><property name=\"suffix\" value=\".jsp\"/></bean>"
            + "<bean name=\"/welcome.htm\" class=\"org.springframework.web.servlet.mvc.ParameterizableViewController\"><property name=\"viewName\" value=\"welcome\"/></bean>"
            + "<bean class=\"org.springframework.web.servlet.handler.SimpleUrlHandlerMapping\"><property name=\"mappings\"><props><prop key=\"/list.htm\">listController</prop></props></property></bean>"
            + "<bean name=\"listController\" class=\"org.springframework.web.servlet.mvc.ParameterizableViewController\"><property name=\"viewName\" value=\"list\"/></bean>"
            + "</beans>");
    var graph = mvc();
    assertTrue(
        endpoints(graph).containsAll(List.of("ANY /welcome.htm", "ANY /list.htm")),
        endpoints(graph) + " " + graph.diagnostics());
    assertTrue(
        graph.diagnostics().stream()
            .noneMatch(d -> d.code().equals("SPRING_XML_CONTROLLER_UNRESOLVED")),
        graph.diagnostics().toString());
  }

  private static List<String> rendered(ApplicationGraph graph) {
    return graph.relationships().stream()
        .filter(e -> e.type() == EdgeType.RENDERS)
        .flatMap(e -> graph.nodes().stream().filter(n -> n.id().equals(e.to())))
        .map(n -> n.attributes().getOrDefault("view", n.name()))
        .sorted()
        .toList();
  }

  @Test
  void bootControllerRendersEveryLiteralBranchButNotLambdaReturns() throws Exception {
    // RV-213: only the first literal return was used, including one inside a lambda.
    write(
        "C.java",
        "@Controller class C { @GetMapping(\"/p\") String p(){"
            + " java.util.function.Supplier<String> s = () -> { return \"lambda\"; };"
            + " if (err) return \"error\"; return \"profile\"; } }");
    var graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
    assertEquals(List.of("error", "profile"), rendered(graph), graph.relationships().toString());
  }

  @Test
  void finalLocalStringViewResolvesLikeALiteral() throws Exception {
    // RV-214: `String view = "home"; return view;` was reported as an unresolved return.
    write("src/main/webapp/WEB-INF/views/home.jsp", "<p>Home</p>");
    write(
        "Config.java",
        "class Config { @Bean InternalResourceViewResolver r(){ InternalResourceViewResolver r=new InternalResourceViewResolver(); r.setPrefix(\"/WEB-INF/views/\"); r.setSuffix(\".jsp\"); return r; }}");
    write(
        "C.java",
        "@Controller class C {"
            + " @GetMapping(\"/home\") String home(){ String view = \"home\"; return view; }"
            + " @GetMapping(\"/changed\") String changed(){ String view = \"home\"; view = other(); return view; } }");
    var graph = mvc();
    assertTrue(
        rendered(graph).contains("src/main/webapp/WEB-INF/views/home.jsp"),
        rendered(graph) + " " + graph.diagnostics());
    assertEquals(
        1,
        graph.diagnostics().stream()
            .filter(d -> d.code().equals("SPRING_RETURN_UNRESOLVED"))
            .count(),
        graph.diagnostics().toString());
  }
}
