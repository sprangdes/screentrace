package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.scanner.ProjectScanner;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
class Batch2WorkflowsTest {
 @Test void templateProjectionKeepsFallbackAndUnsupportedExpressionsUnresolved() {
  String source="<a title=\"text href='untouched'\" href='/fallback'\n th:href='${builder.url()}'>Open</a>";
  String result=io.screentrace.parser.jsp.ThymeleafMarkup.normalize(source);
  assertTrue(result.contains("title=\"text href='untouched'\""));
  assertTrue(result.contains("data-st-template-fallback-href='/fallback'"));
  assertTrue(result.contains("href=\"${unresolvedTemplateTarget}\""));
  assertEquals(source.lines().count(),result.lines().count());
  assertNull(io.screentrace.parser.jsp.ThymeleafMarkup.url("@{${builder.url()}}"));
  assertEquals("/rooms/{id}?sort=price%2Cdesc",io.screentrace.parser.jsp.ThymeleafMarkup.url("@{/rooms/{id}(id=${room.id},sort='price,desc')}"));
 }
 @Test void templateRoutesResolvePhysicalHtmlAndRetainDynamicPathParameters() throws Exception {
  Path r=Files.createTempDirectory("template-workflow");
  write(r,"pom.xml","<project><artifactId>spring-boot-starter-thymeleaf</artifactId></project>");
  write(r,"src/main/resources/templates/list.html","<a th:href=\"@{/items/{id}(id=${item.id})}\">Details</a><form th:action=\"@{/search}\" method=\"post\"><button type=\"submit\">Search</button></form>");
  write(r,"src/main/resources/templates/detail.html","<p>Detail</p>");
  write(r,"C.java","@Controller class C { @GetMapping(\"/\") String home(){return \"/list\";} @GetMapping(\"/items/{id}\") String detail(){return \"detail\";} @PostMapping(\"/search\") String search(){return \"list\";} }");
  var g=new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(r));
  assertEquals(2,g.nodes().stream().filter(n->n.type()==NodeType.SCREEN).count());
  assertTrue(g.nodes().stream().anyMatch(n->n.type()==NodeType.COMPONENT&&"/items/{id}".equals(n.attributes().get("target"))));
  assertTrue(g.relationships().stream().anyMatch(e->e.type()==EdgeType.NAVIGATES_TO));
  assertTrue(g.nodes().stream().anyMatch(n->n.type()==NodeType.COMPONENT&&n.attributes().containsKey("th:href")));
 }
 @Test void repositoryDataOperationsNeedProvenReadAndWritePaths() throws Exception {
  Path r=Files.createTempDirectory("data-workflow");
  write(r,"src/main/webapp/WEB-INF/views/list.jsp","<c:forEach var=\"item\" items=\"${items}\"><p>${item.name}</p></c:forEach>");
  write(r,"R.java","import org.springframework.data.jpa.repository.JpaRepository; interface R extends JpaRepository<Item,Long>{}");
  write(r,"Item.java","class Item { @Id Long id; String name; }");
  write(r,"S.java","class S { R repository; java.util.List<Item> all(){return repository.findAll();} Item save(Item item){return repository.save(item);} }");
  write(r,"C.java","@Controller class C { S service; @GetMapping(\"/\") String list(Model model){model.addAttribute(\"items\",service.all());return \"list\";} @PostMapping(\"/save\") String save(@ModelAttribute(\"item\") Item item){service.save(item);return \"redirect:/\";} @PostMapping(\"/unknown\") String unknown(Item item){other.save(item);return \"redirect:/\";} }");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));
  var save=g.nodes().stream().filter(n->n.type()==NodeType.HANDLER&&"save".equals(n.attributes().get("method"))).findFirst().orElseThrow();
  assertTrue(save.attributes().containsKey("simulationData"));
  assertTrue(save.evidence().stream().anyMatch(e->e.parser().equals("SpringDataSimulation")&&e.resolution()==ResolutionStatus.INFERRED));
  var unknown=g.nodes().stream().filter(n->n.type()==NodeType.HANDLER&&"unknown".equals(n.attributes().get("method"))).findFirst().orElseThrow();
  assertFalse(unknown.attributes().containsKey("simulationData"));
 }
 @Test void conditionalDeferredAndTransformedRepositoryOperationsStayUnresolved() throws Exception {
  Path r=Files.createTempDirectory("data-simulation-negative");
  write(r,"R.java","import org.springframework.data.jpa.repository.JpaRepository; interface R extends JpaRepository<Item,Long>{}");
  write(r,"Item.java","class Item { @Id Long id; String name; }");
  write(r,"S.java","class S { R repository; Item save(Item item){return transform(repository.save(item));} }");
  write(r,"C.java","@Controller class C { R repository; S service; @PostMapping(\"/conditional\") String conditional(Item item){if(flag)repository.save(item);return \"redirect:/\";} @PostMapping(\"/deferred\") String deferred(Item item){Runnable task=()->repository.save(item);return \"redirect:/\";} @PostMapping(\"/transform\") String transformed(Item item){service.save(item);return \"redirect:/\";} }");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));
  assertFalse(g.nodes().stream().anyMatch(n->n.attributes().containsKey("simulationData")));
 }
 private static void write(Path r,String f,String s)throws Exception{Path p=r.resolve(f);Files.createDirectories(p.getParent());Files.writeString(p,s);}
}
