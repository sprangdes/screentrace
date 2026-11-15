package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R61: Spring navigation precision fixes from the 2026-11-14 code review. */
class SpringRound61Test {
  @TempDir Path root;

  void write(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  ApplicationGraph mvc() throws Exception {
    return new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  static GraphNode screen(ApplicationGraph graph, String viewSuffix) {
    return graph.nodes().stream()
        .filter(
            n ->
                n.type() == NodeType.SCREEN
                    && n.attributes().getOrDefault("view", "").endsWith(viewSuffix))
        .findFirst()
        .orElseThrow(() -> new AssertionError(graph.nodes().toString()));
  }

  @Test
  void provenPublicScreenLinkStaysConfirmedWhenAControllerAlsoRendersIt() throws Exception {
    // RV-206: the inferred controller path replaced the CONFIRMED public-alias navigation.
    write("src/main/webapp/index.jsp", "<a href='/help.jsp'>Help</a>");
    write("src/main/webapp/help.jsp", "<p>Help</p>");
    write(
        "Config.java",
        "class Config { @Bean InternalResourceViewResolver r(){ InternalResourceViewResolver r=new InternalResourceViewResolver(); r.setPrefix(\"/\"); r.setSuffix(\".jsp\"); return r; }}");
    write(
        "C.java",
        "@Controller class C { @GetMapping(\"/help.jsp\") String help(){return \"help\";} }");
    var graph = mvc();
    var help = screen(graph, "help.jsp");
    var navigation =
        graph.relationships().stream()
            .filter(e -> e.type() == EdgeType.NAVIGATES_TO && e.to().equals(help.id()))
            .toList();
    assertFalse(navigation.isEmpty(), graph.relationships().toString());
    assertTrue(
        navigation.stream().allMatch(e -> e.confidence() == Confidence.CONFIRMED),
        navigation.toString());
  }

  @Test
  void xmlControllerScreenKnowsItsRouteForActionlessFormsAndRelativeLinks() throws Exception {
    // RV-207: XML controller routes were not recorded per screen.
    write(
        "src/main/webapp/WEB-INF/jsp/users/list.jsp",
        "<form method='post'><input type='submit' value='Filter'/></form><a href='detail.htm'>Detail</a>");
    write("src/main/webapp/WEB-INF/jsp/users/detail.jsp", "<p>Detail</p>");
    write(
        "src/main/webapp/WEB-INF/dispatcher-servlet.xml",
        "<beans>"
            + "<bean class=\"org.springframework.web.servlet.view.InternalResourceViewResolver\"><property name=\"prefix\" value=\"/WEB-INF/jsp/\"/><property name=\"suffix\" value=\".jsp\"/></bean>"
            + "<bean name=\"/users/list.htm\" class=\"org.springframework.web.servlet.mvc.ParameterizableViewController\"><property name=\"viewName\" value=\"users/list\"/></bean>"
            + "<bean name=\"/users/detail.htm\" class=\"org.springframework.web.servlet.mvc.ParameterizableViewController\"><property name=\"viewName\" value=\"users/detail\"/></bean>"
            + "</beans>");
    var graph = mvc();
    var detail = screen(graph, "users/detail.jsp");
    assertTrue(
        graph.relationships().stream()
            .anyMatch(e -> e.type() == EdgeType.NAVIGATES_TO && e.to().equals(detail.id())),
        graph.relationships() + " " + graph.diagnostics());
    assertTrue(
        graph.diagnostics().stream().noneMatch(d -> d.code().equals("JSP_ROUTE_UNRESOLVED")),
        graph.diagnostics().toString());
  }

  @Test
  void relativeRequestPathsApplyDotSegments() {
    // RV-208: "/users/../home" was kept literally and matched no route.
    assertEquals("/home", SpringMvcAnalyzer.normalizedRequestPath("/users/../home"));
    assertEquals("/users/x?a=1#b", SpringMvcAnalyzer.normalizedRequestPath("/users/./x?a=1#b"));
    assertEquals("/a/b/", SpringMvcAnalyzer.normalizedRequestPath("/a//b/"));
    assertEquals("/", SpringMvcAnalyzer.normalizedRequestPath("/users/.."));
    assertNull(SpringMvcAnalyzer.normalizedRequestPath("/../x"));
  }

  @Test
  void parentRelativeLinkReachesTheControllerRoute() throws Exception {
    write("src/main/webapp/WEB-INF/views/list.jsp", "<a href='../home'>Home</a>");
    write("src/main/webapp/WEB-INF/views/home.jsp", "<p>Home</p>");
    write(
        "Config.java",
        "class Config { @Bean InternalResourceViewResolver r(){ InternalResourceViewResolver r=new InternalResourceViewResolver(); r.setPrefix(\"/WEB-INF/views/\"); r.setSuffix(\".jsp\"); return r; }}");
    write(
        "C.java",
        "@Controller class C { @GetMapping(\"/users/list\") String list(){return \"list\";}"
            + " @GetMapping(\"/home\") String home(){return \"home\";} }");
    var graph = mvc();
    var home = screen(graph, "views/home.jsp");
    assertTrue(
        graph.nodes().stream()
            .anyMatch(
                n ->
                    "../home".equals(n.attributes().get("href"))
                        && "/home".equals(n.attributes().get("target"))),
        graph.nodes().toString());
    assertTrue(
        graph.relationships().stream()
            .anyMatch(e -> e.type() == EdgeType.NAVIGATES_TO && e.to().equals(home.id())),
        graph.relationships() + " " + graph.diagnostics());
  }
}
