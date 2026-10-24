package io.screentrace.adapter.spring;
import io.screentrace.core.*;import io.screentrace.core.ApplicationGraph.*;import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;import java.util.*;import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;import static org.junit.jupiter.api.Assertions.*;
class R18EndpointPolicyTest {
 @TempDir Path root;
 void write(String name,String code)throws Exception{Path p=root.resolve(name);Files.createDirectories(p.getParent());Files.writeString(p,code);}
 void project()throws Exception{
  write("pom.xml","<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId><version>3.3.1</version></dependency></dependencies></project>");
  write("src/main/resources/application.yml","server:\n  port: 9000\n");
  write("App.tsx","""
   import {Routes,Route} from 'react-router-dom';import {useEffect} from 'react';
   function Page(){useEffect(()=>{fetch('/api/groups/catalog');fetch('/api/groups/'+selected);fetch('/open/used')},[]);return <p/>;}
   function App(){return <Routes><Route path="/" element={<Page/>}/></Routes>;}
   """);
  write("Endpoints.java","""
   import org.springframework.web.bind.annotation.*;@RestController class Endpoints {
   @GetMapping("/api/groups/catalog") String catalog(){return "ok";}
   @GetMapping("/api/groups/{code}") String group(){return "ok";}
   @PostMapping("/integration/deliver/{key}") void receive(){}
   @PostMapping("/open/permit") void permit(){}
   @PostMapping("/open/csrf") void csrf(){}
   @GetMapping("/open/used") void used(){}
   @PostMapping("/integration/denied/{key}") void denied(){}
   }
   """);
 }
 void security(String rules,String ignores)throws Exception{write("Security.java","""
  import org.springframework.context.annotation.Bean;import org.springframework.security.web.SecurityFilterChain;
  import org.springframework.security.config.annotation.web.builders.HttpSecurity;import org.springframework.http.HttpMethod;
  class Security{@Bean SecurityFilterChain configure(HttpSecurity chain)throws Exception{
  chain.authorizeHttpRequests(permit -> permit
  """+rules+");\nchain.csrf(token -> token.ignoringRequestMatchers("+ignores+"));\nreturn chain.build();}}");}
 ApplicationGraph graph()throws Exception{return new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));}
 GraphNode endpoint(ApplicationGraph g,String path){return g.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&path.equals(n.attributes().get("path"))&&!"javascript-request".equals(n.attributes().get("origin"))).findFirst().orElseThrow();}
 @Test void literalRequestPrefersExactEndpointButUnknownFragmentKeepsCandidates()throws Exception{
  project();var g=graph();var fixed=g.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API&&b.expression().contains("groups/catalog")).findFirst().orElseThrow();
  assertEquals(endpoint(g,"/api/groups/catalog").id(),fixed.targetId());assertTrue(fixed.evidence().stream().anyMatch(e->e.parser().equals("SpringPathSpecificity")&&e.detail().contains("/api/groups/{code}")));
  var dynamic=g.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API&&b.expression().contains("selected")).findFirst().orElseThrow();assertNull(dynamic.targetId());assertTrue(dynamic.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.AMBIGUOUS));
 }
 @Test void bothSecurityFactsAnnotateOnlyUnusedEndpointsWithBothLocations()throws Exception{
  project();security(".requestMatchers(HttpMethod.OPTIONS,\"/**\").permitAll()\n.requestMatchers(HttpMethod.POST,\"/integration/deliver/**\").permitAll()\n.requestMatchers(\"/open/permit\",\"/open/used\").permitAll()\n.requestMatchers(\"/integration/denied/**\").denyAll()\n.requestMatchers(\"/integration/denied/**\").permitAll()","\"/integration/**\",\"/open/csrf\",\"/open/used\"");
  var g=graph();var external=endpoint(g,"/integration/deliver/{key}");assertEquals("webhook",external.attributes().get("externalCall"));
  var proofs=external.evidence().stream().filter(e->e.parser().equals("SpringSecurityExternalCall")).toList();assertEquals(2,proofs.size());assertTrue(proofs.stream().allMatch(e->e.source().file().equals("Security.java")&&e.source().line()>1));assertNotEquals(proofs.get(0).source().line(),proofs.get(1).source().line());
  assertEquals(ApiUsage.Status.UNREFERENCED,ApiUsage.derive(g,Map.of(),Map.of()).get(external.id()).status());
  for(String path:List.of("/open/permit","/open/csrf","/open/used","/integration/denied/{key}"))assertNull(endpoint(g,path).attributes().get("externalCall"),path);
 }
 @Test void multipleProvidersOrWrongHttpMethodDoNotProveExternalCall()throws Exception{
  project();security(".requestMatchers(HttpMethod.GET,\"/integration/**\").permitAll()","\"/integration/**\"");assertNull(endpoint(graph(),"/integration/deliver/{key}").attributes().get("externalCall"));
  security(".requestMatchers(\"/integration/**\").permitAll()","\"/integration/**\"");write("OtherSecurity.java","import org.springframework.context.annotation.Bean;import org.springframework.security.web.SecurityFilterChain;import org.springframework.security.config.annotation.web.builders.HttpSecurity;class OtherSecurity{@Bean SecurityFilterChain other(HttpSecurity s)throws Exception{return s.build();}}");assertNull(endpoint(graph(),"/integration/deliver/{key}").attributes().get("externalCall"));
 }
 @Test void bootDefaultsOnlyWithConfigurationAndNoDeclaredContextAcrossProfiles()throws Exception{
  project();var g=graph();assertFalse(g.diagnostics().stream().anyMatch(d->d.code().equals("CONTEXT_PATH_UNSPECIFIED")));assertTrue(g.behaviors().stream().flatMap(b->b.evidence().stream()).anyMatch(e->e.parser().equals("SpringBootDefaultContext")&&e.detail().contains("Spring Boot 預設值")));
  write("src/main/resources/application-extra.properties","server.servlet.context-path=/branch\n");g=graph();assertFalse(g.behaviors().stream().flatMap(b->b.evidence().stream()).anyMatch(e->e.parser().equals("SpringBootDefaultContext")));
  Files.delete(root.resolve("src/main/resources/application-extra.properties"));Files.delete(root.resolve("src/main/resources/application.yml"));assertTrue(graph().diagnostics().stream().anyMatch(d->d.code().equals("CONTEXT_PATH_UNSPECIFIED")));
 }
 @Test void traditionalWarKeepsUnspecifiedContextAndUnresolvedBootSettingDoesNotDefault()throws Exception{
  project();write("pom.xml","<project><packaging>war</packaging></project>");assertTrue(graph().diagnostics().stream().anyMatch(d->d.code().equals("CONTEXT_PATH_UNSPECIFIED")));
  project();write("src/main/resources/application.yml","server:\n  servlet:\n    context-path: ${DEPLOYMENT}\n");assertTrue(graph().diagnostics().stream().anyMatch(d->d.code().equals("CONTEXT_PATH_UNSPECIFIED")));
 }
 @Test void xmlPermitAllAndNegatedCsrfMatcherCarryBothSourceLocations()throws Exception{
  project();write("security.xml","""
   <b:beans xmlns:b="http://www.springframework.org/schema/beans" xmlns:s="http://www.springframework.org/schema/security">
   <s:http><s:intercept-url pattern="/integration/**" access="permitAll"/>
   <s:csrf request-matcher-ref="tokenCheck"/></s:http>
   <b:bean id="tokenCheck" class="org.springframework.security.web.util.matcher.NegatedRequestMatcher">
   <b:constructor-arg><b:bean class="org.springframework.security.web.util.matcher.AntPathRequestMatcher"><b:constructor-arg value="/integration/**"/></b:bean></b:constructor-arg></b:bean>
   </b:beans>
   """);
  var n=endpoint(graph(),"/integration/deliver/{key}");assertEquals("webhook",n.attributes().get("externalCall"));assertEquals(2,n.evidence().stream().filter(e->e.parser().equals("SpringSecurityExternalCall")&&e.source().file().equals("security.xml")).count());
  write("security.xml",Files.readString(root.resolve("security.xml")).replace("NegatedRequestMatcher","OrRequestMatcher"));assertNull(endpoint(graph(),"/integration/deliver/{key}").attributes().get("externalCall"));
 }

 @Test void conditionalConfigurationDoesNotProveExternalCallAndUnrelatedCallbackWritesDoNotHideProof()throws Exception{
  project();security(".requestMatchers(\"/integration/**\").permitAll()","\"/integration/**\"");String valid=Files.readString(root.resolve("Security.java"));
  write("Security.java",valid.replace("return chain.build();","chain.other(event -> {int count=0;count=1;});return chain.build();"));assertEquals("webhook",endpoint(graph(),"/integration/deliver/{key}").attributes().get("externalCall"));
  write("Security.java",valid.replace("chain.authorizeHttpRequests", "if(enabled)chain.authorizeHttpRequests"));assertNull(endpoint(graph(),"/integration/deliver/{key}").attributes().get("externalCall"));
  write("Security.java",valid.replace("return chain.build();","return other.build();"));assertNull(endpoint(graph(),"/integration/deliver/{key}").attributes().get("externalCall"));
 }

 @Test void inferredWrapperShapeCannotOverwriteAnAlreadyProvenLiteralApiTarget()throws Exception{
  project();write("App.tsx","""
   import {Routes,Route} from 'react-router-dom';import {useEffect} from 'react';
   const PREFIX='';async function transport(path){return fetch(`${PREFIX}${path}`);}
   function Page(){useEffect(()=>{transport('/api/groups/catalog')},[]);return <p/>;}
   function App(){return <Routes><Route path="/" element={<Page/>}/></Routes>;}
   """);
  var g=graph();var call=g.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).findFirst().orElseThrow();assertEquals(endpoint(g,"/api/groups/catalog").id(),call.targetId());assertFalse(call.evidence().stream().anyMatch(e->e.parser().equals("RouteTemplateInference")&&e.resolution()==ResolutionStatus.AMBIGUOUS));
 }

}
