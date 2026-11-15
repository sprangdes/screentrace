package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R66: remaining Spring findings of the 2026-11-14 code review. */
class SpringRound66Test {
  @TempDir Path root;

  void write(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  ApplicationGraph mvc() throws Exception {
    return new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  @Test
  void java21SyntaxInADtoStillYieldsServerRules() throws Exception {
    // RV-201: the validation pass parsed at Java 17 and dropped rules of files using newer syntax.
    write(
        "Api.java",
        "import org.springframework.web.bind.annotation.*;import jakarta.validation.Valid;@RestController class Api{@PostMapping(\"/one\") Reply one(@Valid @RequestBody Input input){return null;}}class Reply{long id;}");
    write(
        "Input.java",
        "import jakarta.validation.constraints.*;class Input{@NotBlank String name;"
            + " String label(Object o){ return switch (o) { case String s when s.isEmpty() -> \"empty\"; case String s -> s; default -> \"\"; }; } }");
    var graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(
        graph.validationRules().stream().anyMatch(r -> r.layer() == ValidationLayer.SERVER),
        graph.diagnostics().toString());
  }

  @Test
  void throwingHandlerWithoutAViewOrErrorPageIsReported() throws Exception {
    // RV-210
    write(
        "C.java",
        "@Controller class C { @GetMapping(\"/x\") String x(){ if (bad) throw new IllegalStateException(); return viewFor(id); } }");
    assertTrue(
        mvc().diagnostics().stream()
            .anyMatch(d -> d.message().startsWith("Handler return view cannot be resolved")));
  }

  @Test
  void staticPreviewListsOnlyVisibleFieldsAndButtons() throws Exception {
    // RV-215
    write(
        "src/main/webapp/form.jsp",
        "<input type=\"hidden\" name=\"_csrf\" value=\"${_csrf.token}\"><input type=\"text\" name=\"q\" value=\"default\"><input type=\"submit\" value=\"Search\">");
    String preview =
        mvc().nodes().stream()
            .filter(n -> n.type() == NodeType.SCREEN)
            .findFirst()
            .orElseThrow()
            .attributes()
            .get("staticPreview");
    assertEquals("FIELD:q|ACTION:Search", preview);
  }

  @Test
  void templatesInsideAModuleSelectTheServerTemplatePipeline() throws Exception {
    // RV-216
    write(
        "web/pom.xml",
        "<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-thymeleaf</artifactId></dependency></dependencies></project>");
    write("web/src/main/resources/templates/home.html", "<p>Home</p>");
    write(
        "web/src/main/java/C.java",
        "@Controller class C { @GetMapping(\"/\") String home(){return \"home\";} }");
    var graph = new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(
        graph.relationships().stream()
            .anyMatch(
                e ->
                    e.type() == EdgeType.RENDERS
                        && graph.nodes().stream()
                            .anyMatch(
                                n ->
                                    n.id().equals(e.to())
                                        && "web/src/main/resources/templates/home.html"
                                            .equals(n.attributes().get("view")))),
        graph.nodes().toString());
    assertEquals(
        "web/src/main/resources/templates/",
        SpringMvcAnalyzer.templateRoot("web/src/main/resources/templates/a/b.html"));
    assertNull(SpringMvcAnalyzer.templateRoot("docs/templates/a.html"));
  }

  @Test
  void suffixOnlyPropertiesResolveViewsAndTestResourcesAreIgnored() throws Exception {
    // RV-219
    write("src/main/webapp/home.jsp", "<p>Home</p>");
    write("src/main/resources/application.properties", "spring.mvc.view.suffix=.jsp\n");
    write(
        "src/test/resources/application.properties",
        "spring.mvc.view.prefix=/WRONG/\nspring.mvc.view.suffix=.jsp\n");
    write("C.java", "@Controller class C { @GetMapping(\"/h\") String h(){return \"/home\";} }");
    var graph = mvc();
    assertTrue(
        graph.relationships().stream()
            .anyMatch(
                e ->
                    e.type() == EdgeType.RENDERS
                        && graph.nodes().stream()
                            .anyMatch(
                                n ->
                                    n.id().equals(e.to())
                                        && "src/main/webapp/home.jsp"
                                            .equals(n.attributes().get("view")))),
        graph.relationships() + " " + graph.diagnostics());
  }
}
