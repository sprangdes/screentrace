package io.screentrace.adapter.spring;
import org.junit.jupiter.api.Test;import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;import io.screentrace.scanner.ProjectScanner;import io.screentrace.core.ApplicationGraph.*;
class Batch3DataTest {
 private void write(Path root,String file,String text)throws Exception{var p=root.resolve(file);Files.createDirectories(p.getParent());Files.writeString(p,text);}
 @Test void severalReadModelsAndBoundedTrySaveHaveSeparateProvenContracts()throws Exception{
  var r=Files.createTempDirectory("batch3-data");write(r,"src/main/webapp/WEB-INF/jsp/list.jsp","<p>List</p>");
  write(r,"R.java","import org.springframework.data.jpa.repository.JpaRepository; interface R extends JpaRepository<Item,String>{}");write(r,"S.java","import org.springframework.data.jpa.repository.JpaRepository; interface S extends JpaRepository<Other,Long>{}");write(r,"Item.java","class Item { @Id String code;String name; }");write(r,"Other.java","class Other { @Id Long id;String title; }");
  write(r,"C.java","@Controller class C { R repository;S other; @GetMapping(\"/\") String list(Model model){model.addAttribute(\"items\",repository.findAll());model.addAttribute(\"others\",other.findAll());return \"list\";} @PostMapping(\"/save\") String save(Item item){try{repository.save(item);}catch(Exception e){}return \"redirect:/\";} @PostMapping(\"/unsafe\") String unsafe(Item item){try{repository.save(item);}catch(Exception e){fallback(item);}return \"redirect:/\";} }");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));var screen=g.nodes().stream().filter(n->n.type()==NodeType.SCREEN).findFirst().orElseThrow();String binding=screen.attributes().get("simulationBindings");assertNotNull(binding);assertTrue(binding.contains("items"));assertTrue(binding.contains("others"));
  var save=g.nodes().stream().filter(n->n.type()==NodeType.HANDLER&&n.attributes().get("method").equals("save")).findFirst().orElseThrow();assertTrue(save.attributes().get("simulationData").contains("\"conditional\":true"));
  var unsafe=g.nodes().stream().filter(n->n.type()==NodeType.HANDLER&&n.attributes().get("method").equals("unsafe")).findFirst().orElseThrow();assertFalse(unsafe.attributes().containsKey("simulationData"));
 }
 @Test void repeatedWritesInsideTryAreNotCollapsedIntoOneSave()throws Exception{
  var r=Files.createTempDirectory("batch3-multi-write");write(r,"src/main/webapp/list.jsp","List");write(r,"R.java","import org.springframework.data.jpa.repository.JpaRepository; interface R extends JpaRepository<Item,String>{}");write(r,"Item.java","class Item { @Id String code;String name; }");write(r,"C.java","@Controller class C { R repository; @PostMapping(\"/save\") String save(Item item){try{repository.save(item);repository.save(item);}catch(Exception e){}return \"redirect:/\";} }");
  var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));var handler=graph.nodes().stream().filter(n->n.type()==NodeType.HANDLER).findFirst().orElseThrow();assertFalse(handler.attributes().containsKey("simulationData"));
 }
}
