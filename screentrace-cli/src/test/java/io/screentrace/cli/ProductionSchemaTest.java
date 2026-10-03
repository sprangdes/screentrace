package io.screentrace.cli;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.adapter.spring.*;
import io.screentrace.adapter.struts.*;
import io.screentrace.scanner.ProjectScanner;
import io.screentrace.report.*;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class ProductionSchemaTest {
 static { StaticJavaParser.setConfiguration(new com.github.javaparser.ParserConfiguration().setLanguageLevel(com.github.javaparser.ParserConfiguration.LanguageLevel.JAVA_17)); }
 private static Path sourceRoot(){for(var root=Path.of("").toAbsolutePath();root!=null;root=root.getParent())if(Files.isRegularFile(root.resolve("pom.xml"))&&Files.isDirectory(root.resolve("screentrace-core")))return root;throw new IllegalStateException("找不到含 pom.xml 與 screentrace-core 的原始碼根目錄");}
 private Path project() throws Exception {var root=Files.createTempDirectory("schema-production");Files.writeString(root.resolve("pom.xml"),"<project><dependencies><dependency><artifactId>spring-webmvc</artifactId></dependency></dependencies></project>");Files.writeString(root.resolve("App.java"),"import org.springframework.boot.autoconfigure.SpringBootApplication; @SpringBootApplication class App {} ");Files.writeString(root.resolve("Controller.java"),"import org.springframework.web.bind.annotation.*; @RestController class Controller { @GetMapping(\"/api\") String api(){return \"ok\";} }");var web=Files.createDirectories(root.resolve("src/main/webapp/WEB-INF"));Files.writeString(web.getParent().resolve("page.jsp"),"<form action='/api'><input name='email'/><button>Send</button></form><script>fetch('/api')</script>");Files.writeString(root.resolve("Action.java"),"class Action { public String execute(){return \"ok\";} }");Files.writeString(web.resolve("struts-config.xml"),"<struts-config><action-mappings><action path='/save' type='Action'><forward name='done' path='/page.jsp'/></action></action-mappings></struts-config>");return root;}
 private void strict(ApplicationGraph graph){assertEquals("2.2",graph.schemaVersion());assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));assertTrue(graph.nodes().stream().flatMap(n->n.evidence().stream()).noneMatch(e->Set.of("LEGACY","UNKNOWN").contains(e.parser())));}
 @Test void everyAdapterProducesStrictTwoIncludingReactComponents() throws Exception {var root=project();Files.writeString(root.resolve("App.tsx"),"<Route path='/home' element={<Home/>}/><Link to='/next'>Next</Link>");var inventory=new ProjectScanner().scan(root);strict(new SpringMvcAnalyzer().analyze(inventory));strict(new SpringBootAnalyzer().analyze(inventory));strict(new SpringProjectAnalyzer().analyze(inventory));strict(new StrutsProjectAnalyzer().analyze(inventory));}

 @Test void actualCliAnalysisFeedsSchemaTwoToHistoricalReportAndExport() throws Exception {var inventory=new ProjectScanner().scan(project());var method=ScreenTraceCli.class.getDeclaredMethod("analyze",ProjectScanner.ProjectInventory.class);method.setAccessible(true);var graph=(ApplicationGraph)method.invoke(null,inventory);strict(graph);assertTrue(inventory.technologies().contains("Spring MVC"));assertTrue(inventory.technologies().contains("Struts 1"));assertTrue(graph.nodes().stream().noneMatch(n->"javascript-request".equals(n.attributes().get("origin"))));assertTrue(graph.nodes().stream().anyMatch(n->"/save".equals(n.attributes().get("path"))));}
 @Test void rejectedAdapterGraphAlsoHidesTheHomeDirectory() throws Exception {var root=Files.createTempDirectory("unsupported-schema");Files.writeString(root.resolve("struts.xml"),"<struts/>");var previous=System.getProperty("user.home");try{System.setProperty("user.home",root.toString());var graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));strict(graph);assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("UNSUPPORTED_FRAMEWORK")));assertFalse(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(graph).contains(root.toString()));}finally{if(previous==null)System.clearProperty("user.home");else System.setProperty("user.home",previous);}}

 @Test void productionSourcesNeverCallHistoricalConstructorsOrCreateSchemaOne() throws Exception {var root=sourceRoot();try(var paths=Files.walk(root)){for(var path:paths.filter(p->p.toString().contains("/src/main/java/")&&p.toString().endsWith(".java")).toList()){var unit=StaticJavaParser.parse(path);for(var creation:unit.findAll(ObjectCreationExpr.class))if(creation.getType().getNameAsString().equals("ApplicationGraph")){assertEquals(8,creation.getArguments().size(),path+":"+creation.getBegin());assertFalse(creation.getArgument(5).toString().contains("CURRENT_SCHEMA_VERSION"),path.toString());assertNotEquals("\"2.1\"",creation.getArgument(5).toString(),path.toString());}}}}
 @Test void formalCliSelectsTheStrictCompletePreviewCapture() throws Exception {
   var source=Files.readString(sourceRoot().resolve("screentrace-cli/src/main/java/io/screentrace/cli/ScreenTraceCli.java"));
   var unit=com.github.javaparser.StaticJavaParser.parse(source);
   var method=unit.findAll(com.github.javaparser.ast.body.MethodDeclaration.class).stream().filter(m->m.getNameAsString().equals("renderStaticJsp")).findFirst().orElseThrow();
   assertTrue(method.findAll(com.github.javaparser.ast.expr.ObjectCreationExpr.class).stream().filter(e->e.getType().getNameAsString().equals("ProcessBuilder"))
       .anyMatch(e->e.getArguments().stream().anyMatch(a->a.isStringLiteralExpr()&&a.asStringLiteralExpr().asString().equals("--preview-v2"))));
 }
}
