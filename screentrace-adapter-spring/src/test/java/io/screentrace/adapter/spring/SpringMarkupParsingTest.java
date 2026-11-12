package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.assertTrue;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.EdgeType;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Spring XML and JSP structure is read with parsers, not regular expressions. */
class SpringMarkupParsingTest {
  @TempDir Path root;

  private void file(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  private ApplicationGraph analyze() throws Exception {
    file(
        "pom.xml",
        "<project><dependency><artifactId>spring-webmvc</artifactId></dependency></project>");
    return new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  @Test
  void defaultErrorViewIsReadFromTheResolverBeanInAnyXmlForm() throws Exception {
    file(
        "src/main/webapp/WEB-INF/spring-servlet.xml",
        "<beans><bean class=\"org.springframework.web.servlet.view.InternalResourceViewResolver\">"
            + "<property name=\"prefix\" value=\"/WEB-INF/jsp/\"/><property name=\"suffix\" value=\".jsp\"/></bean>"
            + "<bean id=\"errors\" class=\"org.springframework.web.servlet.handler.SimpleMappingExceptionResolver\">"
            + "<property name=\"defaultErrorView\">\n  <value>error</value>\n</property></bean></beans>");
    file("src/main/webapp/WEB-INF/jsp/error.jsp", "<h1>Something went wrong</h1>");
    file(
        "src/main/java/BoomController.java",
        "import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*;"
            + " @Controller class BoomController { @GetMapping(\"/boom\") void boom() {"
            + " throw new IllegalStateException(); } }");
    ApplicationGraph graph = analyze();
    String errorScreen =
        graph.nodes().stream()
            .filter(node -> node.type() == NodeType.SCREEN)
            .filter(node -> node.attributes().getOrDefault("view", "").endsWith("jsp/error.jsp"))
            .findFirst()
            .orElseThrow()
            .id();
    assertTrue(
        graph.relationships().stream()
            .anyMatch(edge -> edge.type() == EdgeType.RENDERS && edge.to().equals(errorScreen)),
        graph.relationships().toString());
  }

  @Test
  void previewFieldsAndActionsReadTagsWithGreaterThanInAttributes() throws Exception {
    file(
        "src/main/webapp/WEB-INF/jsp/signup.jsp",
        "<!-- <input name=\"retired\"/> -->\n"
            + "<input data-note=\"a > b\" name=\"email\"/>\n"
            + "<input type=\"submit\" title=\"x > y\" value=\"Sign up\"/>");
    String preview =
        analyze().nodes().stream()
            .filter(node -> node.type() == NodeType.SCREEN)
            .map(node -> node.attributes().getOrDefault("staticPreview", ""))
            .filter(text -> !text.isEmpty())
            .findFirst()
            .orElseThrow();
    assertTrue(preview.contains("FIELD:email"), preview);
    assertTrue(preview.contains("ACTION:Sign up"), preview);
    assertTrue(!preview.contains("retired"), preview);
  }
}
