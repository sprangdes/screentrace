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
        Path fragment = root.resolve("src/main/webapp/WEB-INF/jsp/common/filters.jspf");
        Files.createDirectories(java.getParent());
        Files.createDirectories(jsp.getParent());
        Files.createDirectories(fragment.getParent());
        Files.writeString(root.resolve("pom.xml"), "<project><dependency><artifactId>spring-webmvc</artifactId></dependency></project>");
        Files.writeString(java, "import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*; @Controller @RequestMapping(\"/users\") class UsersController { @GetMapping(\"/{id}\") String detail(){ return \"users/detail\"; } @PostMapping(\"/search\") ModelAndView search(){ return new ModelAndView(\"users/detail\"); }}");
        Files.writeString(jsp, "<%@ include file=\"/WEB-INF/jsp/common/filters.jspf\" %><form:form action=\"/users/search\"><form:input path=\"name\"/><button formaction=\"/users/search\">Search</button></form:form><html:link page=\"/users/7\">Detail</html:link>");
        Files.writeString(fragment, "<input name=\"name\"/>");

        ApplicationGraph graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));

        assertTrue(graph.application().technologies().contains("Spring MVC"));
        assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("GET /users/{id}")));
        assertTrue(graph.nodes().stream().anyMatch(node -> node.attributes().getOrDefault("view", "").endsWith("users/detail.jsp")));
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.RENDERS));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.TRIGGERS));
    assertTrue(graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.SCREEN)
        .anyMatch(node -> node.attributes().getOrDefault("staticPreview", "").contains("FIELD:name")));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == ApplicationGraph.NodeType.TEMPLATE_FRAGMENT));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.INCLUDES));
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

    @Test
    void resolvesXmlControllerViewResolverTilesAndSpringUrlTag() throws Exception {
        Path root = Files.createTempDirectory("st-mvc-xml");
        Path config = root.resolve("src/main/webapp/WEB-INF/spring-mvc.xml");
        Path jsp = root.resolve("src/main/webapp/WEB-INF/views/legacy.jsp");
        Path tiles = root.resolve("src/main/webapp/WEB-INF/layout-definitions.xml");
        Files.createDirectories(config.getParent());
        Files.createDirectories(jsp.getParent());
        Files.writeString(root.resolve("pom.xml"), "<project><dependency><artifactId>spring-webmvc</artifactId></dependency></project>");
        Files.writeString(config, """
            <beans>
              <bean id="legacyController" class="sample.LegacyController"><property name="viewName" value="legacy"/></bean>
              <bean id="tileController" class="sample.TileController"><property name="viewName" value="legacy.tiles"/></bean>
              <bean class="org.springframework.web.servlet.handler.SimpleUrlHandlerMapping"><property name="urlMap"><map>
                <entry key="/legacy.htm" value-ref="legacyController"/><entry key="/tile.htm" value-ref="tileController"/>
              </map></property></bean>
              <bean class="org.springframework.web.servlet.view.InternalResourceViewResolver"><property name="prefix" value="/WEB-INF/views/"/><property name="suffix" value=".jsp"/></bean>
            </beans>
            """);
        Files.writeString(jsp, "<spring:url value=\"/legacy.htm\" var=\"legacyUrl\"/><a href=\"${legacyUrl}\">Legacy</a>");
        Files.writeString(tiles, "<tiles-definitions><definition name=\"legacy.tiles\" template=\"/WEB-INF/layout.jsp\"/></tiles-definitions>");

        ApplicationGraph graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));

        assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("ANY /legacy.htm")));
        assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("ANY /tile.htm")));
        assertTrue(graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.SCREEN)
                .anyMatch(node -> node.name().equals("legacy.tiles") && "true".equals(node.attributes().get("tilesDefinition"))));
        assertTrue(graph.relationships().stream().filter(edge -> edge.type() == ApplicationGraph.EdgeType.RENDERS)
                .allMatch(edge -> edge.confidence() == ApplicationGraph.Confidence.CONFIRMED));
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.TRIGGERS));
    }
}
