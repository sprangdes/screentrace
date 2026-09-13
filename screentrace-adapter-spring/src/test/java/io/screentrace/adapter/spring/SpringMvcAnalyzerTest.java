package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.assertTrue;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class SpringMvcAnalyzerTest {
    @Test
    void correlatesControllerViewAndJspComponents() throws Exception {
        Path root = Files.createTempDirectory("st-mvc");
        Path java = root.resolve("src/main/java/UsersController.java");
        Path jsp = root.resolve("src/main/webapp/WEB-INF/jsp/users/detail.jsp");
        Files.createDirectories(java.getParent());
        Files.createDirectories(jsp.getParent());
        Files.writeString(root.resolve("pom.xml"), "<project><dependency><artifactId>spring-webmvc</artifactId></dependency></project>");
        Files.writeString(java, "import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*; @Controller @RequestMapping(\"/users\") class UsersController { @GetMapping(\"/{id}\") String detail(){ return \"users/detail\"; } @PostMapping(\"/search\") ModelAndView search(){ return new ModelAndView(\"users/detail\"); }}");
        Files.writeString(jsp, "<form action=\"/users/search\"><form:input path=\"name\"/><button formaction=\"/users/search\">Search</button></form><a href=\"/users/7\">Detail</a>");

        ApplicationGraph graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));

        assertTrue(graph.application().technologies().contains("Spring MVC"));
        assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("GET /users/{id}")));
        assertTrue(graph.nodes().stream().anyMatch(node -> node.attributes().getOrDefault("view", "").endsWith("users/detail.jsp")));
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.RENDERS));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.TRIGGERS));
    assertTrue(graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.SCREEN)
        .anyMatch(node -> node.attributes().getOrDefault("staticPreview", "").contains("FIELD:name")));
    }

    @Test
    void reportsDynamicViewAsUnresolved() throws Exception {
        Path root = Files.createTempDirectory("st-mvc-dynamic");
        Path java = root.resolve("X.java");
        Files.writeString(java, "import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*; @Controller class X { @GetMapping(\"/x\") String x(){ return viewName(); } String viewName(){ return \"x\"; }}");

        ApplicationGraph graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));

        assertTrue(graph.diagnostics().stream().anyMatch(diagnostic -> diagnostic.confidence() == ApplicationGraph.Confidence.UNRESOLVED));
    }

    @Test
    void resolvesViewConstantsAndReturnedModelAndViewVariables() throws Exception {
        Path root = Files.createTempDirectory("st-mvc-views");
        Path java = root.resolve("X.java");
        Path jsp = root.resolve("src/main/webapp/WEB-INF/jsp/owners/detail.jsp");
        Files.createDirectories(jsp.getParent());
        Files.writeString(java, "import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*; @Controller class X { static final String FORM=\"owners/form\"; @GetMapping(\"/new\") String form(){ return FORM; } @GetMapping(\"/detail\") ModelAndView detail(){ ModelAndView mav=new ModelAndView(\"owners/detail\"); return mav; }}");
        Files.writeString(jsp, "<p>detail</p>");

        ApplicationGraph graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));

        assertTrue(graph.relationships().stream().filter(edge -> edge.type() == ApplicationGraph.EdgeType.RENDERS).count() == 2);
    }
}
