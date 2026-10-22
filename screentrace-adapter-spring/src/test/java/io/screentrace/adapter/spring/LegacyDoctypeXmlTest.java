package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** Servlet 2.3 web.xml and Tiles definitions always carry a DOCTYPE; they must parse, and quietly. */
class LegacyDoctypeXmlTest {
  @Test void doctypeWebXmlAndTilesParseWithoutStderrNoise() throws Exception {
    Path root = Files.createTempDirectory("st-legacy-doctype");
    Path webInf = root.resolve("src/main/webapp/WEB-INF");
    Files.createDirectories(webInf.resolve("jsp"));
    Files.createDirectories(root.resolve("src/main/webapp/resources/js"));
    Files.writeString(root.resolve("pom.xml"), "<project><dependency><artifactId>spring-webmvc</artifactId></dependency></project>");
    Files.writeString(root.resolve("X.java"), "import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*; @Controller class X { @RequestMapping(\"/home.htm\") String home(){ return \"home\"; } }");
    Files.writeString(webInf.resolve("web.xml"), """
        <!DOCTYPE web-app PUBLIC
         "-//Sun Microsystems, Inc.//DTD Web Application 2.3//EN"
         "http://java.sun.com/dtd/web-app_2_3.dtd" >
        <web-app>
          <servlet><servlet-name>dispatcher</servlet-name><servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class></servlet>
          <servlet-mapping><servlet-name>dispatcher</servlet-name><url-pattern>*.htm</url-pattern></servlet-mapping>
        </web-app>
        """);
    Files.writeString(webInf.resolve("dispatcher-servlet.xml"), """
        <beans xmlns:mvc="http://www.springframework.org/schema/mvc"><mvc:resources location="/resources/" mapping="/resources/**"/>
        <bean class="org.springframework.web.servlet.view.UrlBasedViewResolver"><property name="viewClass" value="org.springframework.web.servlet.view.tiles3.TilesView"/></bean></beans>
        """);
    // RawSanj/spring-tiles-sample-app: the DOCTYPE'd definitions mention /resources/, so the script-source collector also reads them.
    Files.writeString(webInf.resolve("tiles.xml"), """
        <?xml version="1.0" encoding="ISO-8859-1" ?>
        <!DOCTYPE tiles-definitions PUBLIC
               "-//Apache Software Foundation//DTD Tiles Configuration 3.0//EN"
               "http://tiles.apache.org/dtds/tiles-config_3_0.dtd">
        <tiles-definitions>
          <definition name="home" template="/WEB-INF/jsp/layout.jsp"><put-attribute name="css" value="/resources/css/app.css"/><put-attribute name="body" value="/WEB-INF/jsp/home.jsp"/></definition>
        </tiles-definitions>
        """);
    Files.writeString(webInf.resolve("jsp/layout.jsp"), "<script src=\"/resources/js/a.js\"></script><script src=\"/resources/js/b.js\"></script><tiles:insertAttribute name=\"body\"/>");
    Files.writeString(webInf.resolve("jsp/home.jsp"), "<a href=\"home.htm\">Home</a>");
    Files.writeString(root.resolve("src/main/webapp/resources/js/a.js"), "var a = 1;");
    Files.writeString(root.resolve("src/main/webapp/resources/js/b.js"), "var b = 2;");

    PrintStream original = System.err;
    ByteArrayOutputStream captured = new ByteArrayOutputStream();
    ApplicationGraph graph;
    System.setErr(new PrintStream(captured, true));
    try {
      graph = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    } finally { System.setErr(original); }

    assertFalse(captured.toString().contains("[Fatal Error]"), captured.toString());
    assertTrue(graph.diagnostics().stream().noneMatch(d -> "URL_MAPPING_UNRESOLVED".equals(d.code())), graph.diagnostics().toString());
    assertTrue(graph.nodes().stream().anyMatch(n -> n.type() == ApplicationGraph.NodeType.SCREEN && "true".equals(n.attributes().get("tilesDefinition"))), "DOCTYPE'd Tiles definitions still parse");
  }
}
