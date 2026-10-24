package io.screentrace.adapter.spring;

import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class ReactExternalLoginTest {
 @TempDir Path root;
 private ApplicationGraph analyze(String callback) throws Exception {
  Files.writeString(root.resolve("App.tsx"),"""
   import {Routes,Route} from 'react-router-dom';
   function Enter(){return <a href="/api/auth/sso">External sign in</a>;}
   export function App(){return <Routes><Route path="/enter" element={<Enter/>}/></Routes>;}
   """);
  Files.writeString(root.resolve("Auth.java"),"import org.springframework.web.bind.annotation.*; @RestController class Auth {@GetMapping(\"/api/auth/sso\") void start(HttpServletResponse response){response.sendRedirect(\"https://identity.example.test/authorize\");}}");
  Files.writeString(root.resolve("Security.java"),"import org.springframework.security.config.annotation.web.builders.HttpSecurity;class Security {private final Callback callback;Object security(HttpSecurity http){return http.oauth2Login(oauth->oauth.successHandler(callback)).build();}}");
  Files.writeString(root.resolve("Callback.java"),"import org.springframework.security.web.authentication.AuthenticationSuccessHandler;class Callback implements AuthenticationSuccessHandler {public void onAuthenticationSuccess(HttpServletRequest request,HttpServletResponse response,Authentication auth){response.sendRedirect("+callback+");}}");
  return new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
 }
 @Test void externalEntryAndSecuritySuccessCallbackFormAnEvidenceBackedRoundTrip()throws Exception {
  var graph=analyze("\"/enter?sso=success\"");
  var endpoint=graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/api/auth/sso".equals(n.attributes().get("path"))).findFirst().orElseThrow();
  assertEquals("true",endpoint.attributes().get("externalLogin"));assertEquals("/enter?sso=success",endpoint.attributes().get("externalLoginReturns"));
  assertTrue(graph.relationships().stream().anyMatch(e->e.from().equals(endpoint.id())&&e.type()==EdgeType.FORWARDS_TO));
  assertTrue(endpoint.evidence().stream().anyMatch(e->e.source().file().equals("Callback.java")&&e.resolution()==ResolutionStatus.INFERRED));
 }
 @Test void unresolvedConfigurationReturnIsNeverGuessed()throws Exception {
  var graph=analyze("settings.callbackPath()");
  assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("EXTERNAL_LOGIN_RETURN_UNRESOLVED")));
  assertTrue(graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/api/auth/sso".equals(n.attributes().get("path"))).noneMatch(n->n.attributes().containsKey("externalLoginReturns")));
 }
}
