package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class UrlResolutionTest {
 @TempDir Path root;
 UrlResolution.Endpoint endpoint(String id,String path,String method){return new UrlResolution.Endpoint(id,path,method,List.of());}
 UrlResolution.Context context(String... paths){return new UrlResolution.Context(Arrays.stream(paths).map(p->new UrlResolution.ContextValue(p,new SourceLocation("settings.json",1))).toList(),List.of());}
 @Test void exactNormalizesOnlyProvenContextAndRequestDecorations(){var r=UrlResolution.resolve("/shop/api;jsessionid=abc?q=1#part","GET",context("/shop"),List.of(endpoint("api","/api","GET")),false);assertEquals(Confidence.CONFIRMED,r.confidence());assertEquals(List.of("api"),r.candidates());assertEquals(List.of("/api"),r.paths());assertTrue(r.evidence().stream().anyMatch(e->e.source().file().equals("settings.json")));}
 @Test void templatesWildcardsAndExtensionMappingsAreInferred(){for(String pattern:List.of("/api/{id}","/api/*","/api/**")){assertEquals(Confidence.INFERRED,UrlResolution.resolve("/api/7","GET",context(""),List.of(endpoint("one",pattern,"GET")),false).confidence());}assertEquals(Confidence.INFERRED,UrlResolution.resolve("/save.do","POST",context(""),List.of(endpoint("save","/save","ANY")),List.of("*.do"),false).confidence());assertEquals(Confidence.INFERRED,UrlResolution.resolve("/save.action","GET",context(""),List.of(endpoint("save","/save","ANY")),List.of("*.action"),false).confidence());}
 @Test void everyCompatibleCandidateRemainsAmbiguous(){var r=UrlResolution.resolve("/api/7","GET",context(""),List.of(endpoint("z","/api/{id}","GET"),endpoint("a","/api/7","GET")),false);assertEquals(Confidence.AMBIGUOUS,r.confidence());assertEquals(List.of("a","z"),r.candidates());}
 @Test void methodMismatchNeverLinksAndMissingMethodMeansGet(){assertTrue(UrlResolution.resolve("/api","POST",context(""),List.of(endpoint("a","/api","GET")),false).diagnostics().contains("URL_METHOD_MISMATCH"));assertEquals(List.of(),UrlResolution.resolve("/api","POST",context(""),List.of(endpoint("a","/api","GET")),false).candidates());assertEquals(List.of("a"),UrlResolution.resolve("/api",null,context(""),List.of(endpoint("a","/api","GET")),false).candidates());}
 @Test void unknownContextIsNotInvented(){var r=UrlResolution.resolve("/shop/api","GET",context(),List.of(endpoint("api","/api","GET")),false);assertEquals(Confidence.UNRESOLVED,r.confidence());assertTrue(r.diagnostics().contains("CONTEXT_PATH_UNSPECIFIED"));assertEquals(List.of(),r.candidates());}
 @Test void standardExpressionNeedsActualContextUnknownVariablesNeverStrip(){assertEquals(List.of("api"),UrlResolution.resolve("{pageContext.request.contextPath}/api","GET",context("/shop"),List.of(endpoint("api","/api","GET")),true).candidates());assertEquals(Confidence.UNRESOLVED,UrlResolution.resolve("{ctx}/api","GET",context("/shop"),List.of(endpoint("api","/api","GET")),false).confidence());assertEquals(Confidence.UNRESOLVED,UrlResolution.resolve("{pageContext.request.contextPath}/api","GET",context(),List.of(endpoint("api","/api","GET")),true).confidence());}
 @Test void multipleContextsListAllCandidatesEvenIfRoutesConverge(){var r=UrlResolution.resolve("/a/api","GET",context("/a","/b"),List.of(endpoint("one","/api","GET"),endpoint("two","/a/api","GET")),false);assertEquals(Confidence.AMBIGUOUS,r.confidence());assertEquals(List.of("one","two"),r.candidates());assertEquals(List.of("/a/api","/api"),r.paths());}
 @Test void externalAndTraversalPathsRemainUnresolved(){for(String url:List.of("https://host/api","//host/api","/../api","{unknown}/api")){var r=UrlResolution.resolve(url,"GET",context(""),List.of(endpoint("a","/api","GET")),false);assertEquals(Confidence.UNRESOLVED,r.confidence());assertTrue(r.candidates().isEmpty());}}
 @Test void readsPropertiesYamlWorkspaceValuesAndRetainsConflicts() throws Exception {var dir=root.resolve("src/main/resources");Files.createDirectories(dir);Files.writeString(dir.resolve("application.properties"),"server.servlet.context-path=/prop\n");Files.writeString(dir.resolve("application.yml"),"server:\n  servlet:\n    context-path: /yaml\n");var c=UrlResolution.context(new ProjectScanner().scan(root),context("/workspace").values());assertEquals(List.of("/prop","/workspace","/yaml"),c.values().stream().map(UrlResolution.ContextValue::value).toList());assertEquals(3,c.values().stream().map(v->v.source().file()).distinct().count());}
 @Test void unsafeYamlAndUnresolvedConfigurationProduceDiagnostics() throws Exception {Files.writeString(root.resolve("application.yml"),"!!java.net.URL ['https://example.invalid']");Files.writeString(root.resolve("application.properties"),"server.servlet.context-path=${DEPLOY_CONTEXT}\n");var c=UrlResolution.context(new ProjectScanner().scan(root),List.of());assertTrue(c.values().isEmpty());assertFalse(c.diagnostics().isEmpty());}

 UrlResolution.Context trailing(boolean match){return new UrlResolution.Context(List.of(),List.of(),new UrlResolution.TrailingSlash(match,new AnalysisEvidence(new SourceLocation("pom.xml",1),"UrlResolution",ResolutionStatus.INFERRED,"policy")));}
 @Test void trailingSlashMatchesOnlyUnderTheSpringPolicyAndOnlyAfterExactMisses(){
  // RawSanj/spring-tiles-sample-app (Spring 4.0): $.ajax({url:'/account/upload/', type:'POST'}) reaches @PostMapping("/account/upload").
  var endpoints=List.of(endpoint("upload","/account/upload","POST"));
  var matched=UrlResolution.resolve("/account/upload/","POST",trailing(true),endpoints,false);
  assertEquals(List.of("upload"),matched.candidates());assertEquals(Confidence.INFERRED,matched.confidence());
  assertTrue(matched.evidence().stream().anyMatch(e->"policy".equals(e.detail())));
  assertTrue(UrlResolution.resolve("/account/upload/","POST",trailing(false),endpoints,false).candidates().isEmpty());
  assertTrue(UrlResolution.resolve("/account/upload/","POST",context(""),endpoints,false).candidates().isEmpty(),"no policy, no match");
  var exact=UrlResolution.resolve("/a/","GET",trailing(true),List.of(endpoint("slash","/a/","GET"),endpoint("bare","/a","GET")),false);
  assertEquals(List.of("slash"),exact.candidates());assertEquals(Confidence.CONFIRMED,exact.confidence());
 }
 @Test void trailingSlashPolicyComesFromExplicitSettingOrSpringGeneration() throws Exception {
  Files.writeString(root.resolve("pom.xml"),"<project><properties><v>4.0.2.RELEASE</v></properties><dependencies><dependency><artifactId>spring-webmvc</artifactId><version>${v}</version></dependency></dependencies></project>");
  var policy=UrlResolution.context(new ProjectScanner().scan(root),List.of()).trailingSlash();
  assertTrue(policy.match());assertEquals(ResolutionStatus.INFERRED,policy.evidence().resolution());
  Files.writeString(root.resolve("pom.xml"),"<project><parent><artifactId>spring-boot-starter-parent</artifactId><version>3.2.0</version></parent></project>");
  assertFalse(UrlResolution.context(new ProjectScanner().scan(root),List.of()).trailingSlash().match());
  Files.writeString(root.resolve("WebConfig.java"),"class WebConfig { void configurePathMatch(PathMatchConfigurer c){ c.setUseTrailingSlashMatch(true); } }");
  var explicit=UrlResolution.context(new ProjectScanner().scan(root),List.of()).trailingSlash();
  assertTrue(explicit.match());assertEquals(ResolutionStatus.CONFIRMED,explicit.evidence().resolution());
  Files.delete(root.resolve("WebConfig.java"));Files.delete(root.resolve("pom.xml"));
  Files.writeString(root.resolve("mvc.xml"),"<beans xmlns:mvc=\"http://www.springframework.org/schema/mvc\"><mvc:annotation-driven><mvc:path-matching trailing-slash=\"false\"/></mvc:annotation-driven></beans>");
  assertFalse(UrlResolution.context(new ProjectScanner().scan(root),List.of()).trailingSlash().match());
  Files.delete(root.resolve("mvc.xml"));
  assertNull(UrlResolution.context(new ProjectScanner().scan(root),List.of()).trailingSlash(),"no Spring version, no policy");
 }
}
