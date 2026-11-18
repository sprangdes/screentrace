package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * R88 (ADR 0166): the return path through a helper with parameters, a UriComponentsBuilder chain
 * and a {@code @ConfigurationProperties} accessor.
 */
class R88ExternalLoginReturnTest {
  @TempDir Path root;

  private ApplicationGraph analyze(String callbackBody, String... config) throws Exception {
    Files.writeString(
        root.resolve("App.tsx"),
        """
        import {Routes,Route} from 'react-router-dom';
        function Enter(){return <a href="/api/auth/sso">External sign in</a>;}
        export function App(){return <Routes><Route path="/login" element={<Enter/>}/></Routes>;}
        """);
    Files.writeString(
        root.resolve("Auth.java"),
        "import org.springframework.web.bind.annotation.*; @RestController class Auth {@GetMapping(\"/api/auth/sso\") String start(){return \"redirect:/oauth2/authorization/sso\";}}");
    Files.writeString(
        root.resolve("Security.java"),
        "import org.springframework.security.config.annotation.web.builders.HttpSecurity;class Security {private final Callback callback;Object security(HttpSecurity http){return http.oauth2Login(oauth->oauth.successHandler(callback)).build();}}");
    Files.writeString(
        root.resolve("AuthProperties.java"),
        "@ConfigurationProperties(prefix = \"app.auth\") public record AuthProperties(String successRedirectPath) {}");
    Files.writeString(
        root.resolve("Callback.java"),
        "import org.springframework.security.web.authentication.AuthenticationSuccessHandler;"
            + "class Callback implements AuthenticationSuccessHandler { private final AuthProperties properties;"
            + callbackBody
            + "}");
    for (int i = 0; i < config.length; i += 2) {
      Path file = root.resolve(config[i]);
      Files.createDirectories(file.getParent());
      Files.writeString(file, config[i + 1]);
    }
    return new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  private static final String HANDLER =
      """
      public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication auth) {
        response.sendRedirect(success(auth.getName()));
      }
      private String success(String role) {
        return builder(properties.successRedirectPath()).queryParam("done", "yes").queryParam("role", role).build().toUriString();
      }
      private UriComponentsBuilder builder(String target) {
        if (target != null && target.startsWith("https://")) return UriComponentsBuilder.fromUriString(target);
        return UriComponentsBuilder.fromPath(target == null || target.isBlank() ? "/login" : target);
      }
      """;

  private static GraphNode endpoint(ApplicationGraph graph) {
    return graph.nodes().stream()
        .filter(
            n ->
                n.type() == NodeType.ENDPOINT && "/api/auth/sso".equals(n.attributes().get("path")))
        .findFirst()
        .orElseThrow();
  }

  @Test
  void returnPathIsReadThroughHelpersBuilderAndConfiguration() throws Exception {
    var graph =
        analyze(
            HANDLER,
            "src/main/resources/application-local.yml",
            "app:\n  auth:\n    success-redirect-path: /login\n",
            "src/main/resources/application-prod.yml",
            "app:\n  auth:\n    success-redirect-path: https://www.example.test/login\n");
    var api = endpoint(graph);
    assertEquals("true", api.attributes().get("externalLogin"));
    assertEquals("/login?done=yes&role={role}", api.attributes().get("externalLoginReturns"));
    assertNull(api.attributes().get("externalLoginReturnUnresolved"));
    assertTrue(
        graph.diagnostics().stream()
            .noneMatch(d -> d.code().equals("EXTERNAL_LOGIN_RETURN_UNRESOLVED")));
    // The configuration lines are part of the evidence.
    assertTrue(
        api.evidence().stream()
            .anyMatch(e -> e.source().file().equals("src/main/resources/application-prod.yml")));
    assertTrue(
        graph.relationships().stream()
            .anyMatch(e -> e.from().equals(api.id()) && e.type() == EdgeType.FORWARDS_TO));
  }

  @Test
  void aKeyNoFileSetsStaysUnresolvedButTheProvenDefaultIsKept() throws Exception {
    var api = endpoint(analyze(HANDLER));
    assertEquals("true", api.attributes().get("externalLoginReturnUnresolved"));
    assertEquals("/login?done=yes&role={role}", api.attributes().get("externalLoginReturns"));
  }

  @Test
  void r100FormatBuildersUriAndRedirectStrategy() throws Exception {
    // R100 (ADR 0175): other ways to build the return URL.
    var graph =
        analyze(
            """
            private final RedirectStrategy strategy;
            public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication auth) {
              if (auth == null) { strategy.sendRedirect(request, response, URI.create(String.format("%s?from=%s", "/login", "sso")).toString()); return; }
              response.sendRedirect(new StringBuilder("/home").append("?welcome=1").toString());
              response.sendRedirect(ServletUriComponentsBuilder.fromCurrentContextPath().path("/dashboard").build().toUriString());
            }
            """);
    var returns = endpoint(graph).attributes().get("externalLoginReturns").split("\u001f");
    assertEquals(
        java.util.List.of("/dashboard", "/home?welcome=1", "/login?from=sso"),
        java.util.Arrays.stream(returns).sorted().toList());
    assertNull(endpoint(graph).attributes().get("externalLoginReturnUnresolved"));
  }

  @Test
  void r100DefaultSuccessUrlWithoutAHandler() throws Exception {
    analyze(
        "public void onAuthenticationSuccess(HttpServletRequest a, HttpServletResponse b, Authentication c) {}");
    // No custom handler: oauth2Login names where it returns.
    Files.writeString(
        root.resolve("Security.java"),
        "import org.springframework.security.config.annotation.web.builders.HttpSecurity;class Security {Object security(HttpSecurity http){return http.oauth2Login(oauth->oauth.defaultSuccessUrl(\"/login\", true)).build();}}");
    Files.delete(root.resolve("Callback.java"));
    var graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
    assertEquals("/login", endpoint(graph).attributes().get("externalLoginReturns"));
    assertTrue(
        graph.relationships().stream()
            .anyMatch(
                e -> e.from().equals(endpoint(graph).id()) && e.type() == EdgeType.FORWARDS_TO));
  }
}
