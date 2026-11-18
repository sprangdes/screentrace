package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R78 (ADR 0156): handler → service → DAO calls proven from source, nothing guessed. */
class BackendCallChainsTest {
  @TempDir Path project;

  private void java(String path, String source) throws Exception {
    var file = project.resolve("src/main/java/demo/" + path);
    Files.createDirectories(file.getParent());
    Files.writeString(file, "package demo;\n" + source);
  }

  private static GraphNode handler(String id, Map<String, String> attributes, String file) {
    return new GraphNode(
        id,
        NodeType.HANDLER,
        id,
        attributes,
        new SourceLocation(file, 1),
        Confidence.CONFIRMED,
        List.of(
            new AnalysisEvidence(
                new SourceLocation(file, 1), "Fixture", ResolutionStatus.CONFIRMED, null)));
  }

  private ApplicationGraph graph(GraphNode... handlers) {
    return new ApplicationGraph(
        new Application("demo", ".", List.of()),
        List.of(handlers),
        List.of(),
        List.of(),
        List.of(),
        "2.2",
        List.of(),
        List.of());
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> calls(ApplicationGraph graph, String id)
      throws Exception {
    var node = graph.nodes().stream().filter(n -> n.id().equals(id)).findFirst().orElseThrow();
    String raw = node.attributes().get("backendCalls");
    return raw == null ? List.of() : new ObjectMapper().readValue(raw, List.class);
  }

  private void project() throws Exception {
    java(
        "OwnerController.java",
        """
        @Controller
        class OwnerController {
          private final OwnerService service;
          private final java.util.List<String> names;
          OwnerController(OwnerService service) { this.service = service; this.names = null; }
          String list() {
            names.size();
            return helper();
          }
          private String helper() { return this.service.find(1); }
          String edit() { return audit.record(); }
          private Audit audit;
        }
        """);
    java(
        "OwnerService.java",
        """
        @Service
        class OwnerService {
          private OwnerDao dao;
          private Cache cache;
          private PetRepository pets;
          String find(int id) { cache.get(); pets.findAll(); return dao.query(id); }
        }
        """);
    java(
        "OwnerDao.java",
        "class OwnerDao { String query(int id) { return deeper.go(); } private Deeper deeper; }");
    java("Deeper.java", "class Deeper { String go() { return null; } }");
    java("Cache.java", "interface Cache { String get(); }");
    java(
        "MemoryCache.java",
        "class MemoryCache implements Cache { public String get() { return null; } }");
    java(
        "RedisCache.java",
        "class RedisCache implements Cache { public String get() { return null; } }");
    java("PetRepository.java", "interface PetRepository extends JpaRepository<Pet, Long> {}");
    java("Audit.java", "class Audit extends LibraryAudit {}");
  }

  @Test
  void followsFieldCallsThroughServicesAndDaosWithTheirLayersAndSources() throws Exception {
    project();
    var inventory = new ProjectScanner().scan(project);
    var file = "src/main/java/demo/OwnerController.java";
    var result =
        BackendCallChains.enrich(
            graph(handler("h", Map.of("class", "OwnerController", "method", "list"), file)),
            inventory);
    var rows = calls(result, "h");
    assertEquals(
        List.of(
            "1 OwnerController#helper→OwnerService#find SERVICE @Service CONFIRMED",
            "2 OwnerService#find→Cache#get CLASS null AMBIGUOUS",
            "2 OwnerService#find→PetRepository#findAll DAO extends Repository CONFIRMED",
            "2 OwnerService#find→OwnerDao#query DAO 名稱 CONFIRMED",
            "3 OwnerDao#query→Deeper#go CLASS null CONFIRMED"),
        rows.stream()
            .map(
                r ->
                    r.get("depth")
                        + " "
                        + r.get("from")
                        + "→"
                        + r.get("to")
                        + " "
                        + r.get("layer")
                        + " "
                        + r.get("layerBasis")
                        + " "
                        + r.get("resolution"))
            .toList());
    assertEquals("2 個實作", rows.get(1).get("reason"));
    assertEquals(
        Map.of("file", "src/main/java/demo/OwnerService.java", "line", 7),
        rows.get(3).get("source"));
    var node = result.nodes().get(0);
    assertTrue(
        node.evidence().stream()
            .anyMatch(
                e ->
                    e.parser().equals("BackendCallChains")
                        && e.resolution() == ResolutionStatus.AMBIGUOUS));
    assertDoesNotThrow(() -> GraphIntegrityValidator.validate(result));
  }

  @Test
  void aMethodNotDeclaredInTheProjectIsUnresolvedAndUnknownHandlersAreLeftAlone() throws Exception {
    project();
    var inventory = new ProjectScanner().scan(project);
    var file = "src/main/java/demo/OwnerController.java";
    var input =
        graph(
            handler("edit", Map.of("class", "OwnerController", "method", "edit"), file),
            handler("missing", Map.of("class", "NoSuchController", "method", "x"), file),
            handler("struts", Map.of("actionType", "demo.OwnerDao"), file));
    var result = BackendCallChains.enrich(input, inventory);
    var edit = calls(result, "edit");
    assertEquals(1, edit.size());
    assertEquals("UNRESOLVED", edit.get(0).get("resolution"));
    assertEquals("Audit#record", edit.get(0).get("to"));
    assertEquals(List.of(), calls(result, "missing"));
    // A Struts handler names its action class; without a method attribute its execute() is the
    // start.
    assertEquals(List.of(), calls(result, "struts"));
  }

  @Test
  void callsBeyondTheDepthLimitAreMarkedNotFollowed() throws Exception {
    java("A.java", "class A { private B b; void run() { b.run(); } }");
    java("B.java", "class B { private C c; void run() { c.run(); } }");
    java("C.java", "class C { private D d; void run() { d.run(); } }");
    java("D.java", "class D { private E e; void run() { e.run(); } }");
    java("E.java", "class E { private F f; void run() { f.run(); } }");
    java("F.java", "class F { void run() {} }");
    var result =
        BackendCallChains.enrich(
            graph(handler("h", Map.of("class", "A", "method", "run"), "src/main/java/demo/A.java")),
            new ProjectScanner().scan(project));
    var rows = calls(result, "h");
    assertEquals(BackendCallChains.MAX_DEPTH, rows.size());
    var last = rows.get(rows.size() - 1);
    assertEquals("D#run→E#run", last.get("from") + "→" + last.get("to"));
    assertEquals("已達深度上限,之後的呼叫未追蹤", last.get("reason"));
  }

  @Test
  void aProjectWithoutJavaLeavesTheGraphUntouched() throws Exception {
    var input = graph(handler("h", Map.of("class", "A", "method", "run"), "A.java"));
    assertSame(input, BackendCallChains.enrich(input, new ProjectScanner().scan(project)));
  }
}
