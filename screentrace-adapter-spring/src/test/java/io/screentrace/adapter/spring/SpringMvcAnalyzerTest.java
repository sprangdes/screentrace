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
    void capturesImplicitModelAttributeRequestAndViewResponse() throws Exception {
        Path root = Files.createTempDirectory("st-mvc-contract");
        Path java = root.resolve("OwnerController.java");
        Files.writeString(java, """
            import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*;
            @Controller class OwnerController { @GetMapping("/owners") String find(Owner owner){ return "owners/list"; } }
            class Person { String lastName; } class Owner extends Person { String address; }
            """);

        ApplicationGraph graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));

        var endpoint = graph.nodes().stream().filter(node -> node.name().equals("GET /owners")).findFirst().orElseThrow();
        var contract = graph.apiContracts().stream().filter(item -> item.endpointId().equals(endpoint.id())).findFirst().orElseThrow();
        assertTrue(contract.request().fields().stream().anyMatch(field -> field.name().equals("lastName") && field.location().equals("QUERY")));
        assertTrue(contract.responses().get(0).bodyType().contains("owners/list"));
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

    @Test
    void keepsIncludedNavigationOnItsRenderedScreenAndDoesNotAttributeUnreferencedApis() throws Exception {
        Path root = Files.createTempDirectory("st-mvc-home");
        Path java = root.resolve("src/main/java/HomeController.java");
        Path home = root.resolve("src/main/webapp/WEB-INF/views/home.jsp");
        Path header = root.resolve("src/main/webapp/WEB-INF/views/templates/header.jsp");
        Files.createDirectories(java.getParent());
        Files.createDirectories(header.getParent());
        Files.writeString(root.resolve("pom.xml"), "<project><dependency><artifactId>spring-webmvc</artifactId></dependency></project>");
        Files.writeString(java, """
            import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*;
            @Controller class HomeController {
              @GetMapping("/") String home(){ return "home"; }
              @GetMapping("/productList") String products(){ return "productList"; }
              @GetMapping("/cart/{cartId}") String cart(){ return "cart"; }
            }
            """);
        Files.writeString(home, "<%@include file=\"/WEB-INF/views/templates/header.jsp\"%><a href=\"#myCarousel\" data-slide=\"prev\">Previous</a><a href=\"#\">View details</a>");
        Files.writeString(header, "<a href=\"<c:url value=\"/productList\"/>\">Products</a>");

        ApplicationGraph graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
        var homeScreen = graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.SCREEN
            && node.attributes().getOrDefault("view", "").endsWith("home.jsp")).findFirst().orElseThrow();
        var products = graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.COMPONENT
            && node.name().equals("Products")).findFirst().orElseThrow();
        assertTrue("NAVIGATION".equals(products.attributes().get("componentType")));
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.from().equals(products.id())
            && edge.type() == ApplicationGraph.EdgeType.NAVIGATES_TO));
        assertTrue(graph.nodes().stream().noneMatch(node -> node.type() == ApplicationGraph.NodeType.SCREEN
            && node.attributes().getOrDefault("view", "").endsWith("header.jsp")));
        assertTrue(graph.relationships().stream().noneMatch(edge -> edge.from().equals(homeScreen.id())
            && edge.type() == ApplicationGraph.EdgeType.CALLS));
        assertTrue(graph.relationships().stream().noneMatch(edge -> edge.type() == ApplicationGraph.EdgeType.TRIGGERS
            && graph.nodes().stream().anyMatch(node -> node.id().equals(edge.to()) && node.name().equals("GET /cart/{cartId}"))));
    }

    @Test
    void correlatesXmlViewControllersRelativeDynamicLinksAndCurrentViewSpringForms() throws Exception {
        Path root = Files.createTempDirectory("st-mvc-static-flow");
        Path config = root.resolve("src/main/resources/mvc.xml");
        Path welcome = root.resolve("src/main/webapp/WEB-INF/jsp/welcome.jsp");
        Path owner = root.resolve("src/main/webapp/WEB-INF/jsp/owners/form.jsp");
        Path java = root.resolve("src/main/java/OwnerController.java");
        Files.createDirectories(config.getParent());
        Files.createDirectories(welcome.getParent());
        Files.createDirectories(owner.getParent());
        Files.createDirectories(java.getParent());
        Files.writeString(root.resolve("pom.xml"), "<project><dependency><artifactId>spring-webmvc</artifactId></dependency></project>");
        Files.writeString(config, "<beans xmlns:mvc=\"urn:mvc\"><mvc:view-controller path=\"/\" view-name=\"welcome\"/></beans>");
        Files.writeString(welcome, "<p>Welcome</p>");
        Files.writeString(owner, "<spring:url value=\"{ownerId}/edit\" var=\"editUrl\"/><a href=\"${fn:escapeXml(editUrl)}\">Edit</a><form:form modelAttribute=\"owner\"><button type=\"submit\">Save</button></form:form><a href=\"/owners/{ownerId}/pets/{petId}/visits/new\">Add Visit</a>");
        Files.writeString(java, """
            import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*;
            @Controller class OwnerController {
              @GetMapping("/owners/{ownerId}/edit") String edit(){ return "owners/form"; }
              @PostMapping("/owners/{ownerId}/edit") String save(){ return "owners/form"; }
              @GetMapping("/owners/*/pets/{petId}/visits/new") String visit(){ return "owners/form"; }
              @PostMapping("/owners/{ownerId}/pets/{petId}/visits/new") String createVisit(){ return "owners/form"; }
              @GetMapping(value="/owners.json", produces="application/json") @ResponseBody String json(){ return "{}"; }
            }
            """);

        ApplicationGraph graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));

        var home = graph.nodes().stream().filter(node -> node.name().equals("GET /")).findFirst().orElseThrow();
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.from().equals(home.id())
            && edge.type() == ApplicationGraph.EdgeType.HANDLED_BY));
        var save = graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.COMPONENT
            && "<current-view>".equals(node.attributes().get("target"))
            && "POST".equals(node.attributes().get("httpMethod"))).findFirst().orElseThrow();
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.from().equals(save.id())
            && edge.type() == ApplicationGraph.EdgeType.TRIGGERS
            && graph.nodes().stream().anyMatch(node -> node.id().equals(edge.to()) && node.name().equals("POST /owners/{ownerId}/edit"))));
        var visit = graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.COMPONENT
            && "/owners/{ownerId}/pets/{petId}/visits/new".equals(node.attributes().get("target"))).findFirst().orElseThrow();
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.from().equals(visit.id())
            && edge.type() == ApplicationGraph.EdgeType.TRIGGERS
            && graph.nodes().stream().anyMatch(node -> node.id().equals(edge.to()) && node.name().equals("GET /owners/*/pets/{petId}/visits/new"))));
        assertTrue(graph.diagnostics().stream().noneMatch(diagnostic -> diagnostic.message().contains("json()")));
    }
}
