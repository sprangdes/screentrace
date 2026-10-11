package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.MarkupTag;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Wp28AnchorIntegrationTest {
 @TempDir Path temp;
 @Test void completePipelineAnchorsEverySyntheticExpansionAndKeepsOfflineBytesStable()throws Exception {
  Path repo=Path.of("..").toAbsolutePath().normalize(),fixture=repo.resolve("fixtures/r7/anchors"),source=temp.resolve("home/projects/anchor-fixture"),web=source.resolve("src/main/webapp");
  try(var files=Files.walk(fixture)){for(var file:files.toList()){var copy=web.resolve(fixture.relativize(file));if(Files.isDirectory(file))Files.createDirectories(copy);else Files.copy(file,copy);}}
  Files.writeString(web.resolve("four.jsp"),"<%@ taglib prefix=\"t\" tagdir=\"/WEB-INF/tags\" %>\n<t:item href=\"/a\"/>\n<t:item href=\"/b\"/>\n<t:item href=\"/c\"/>\n<t:item href=\"/d\"/>");
  var method=ScreenTraceCli.class.getDeclaredMethod("analyze",ProjectCatalog.Project.class,WorkspaceSettings.class);method.setAccessible(true);
  Path outputs=repo.resolve("screentrace-cli/target/wp28-fixtures");
  for(var run:List.of("first","second"))method.invoke(null,new ProjectCatalog.Project("anchor-fixture",source,outputs.resolve(run)),new WorkspaceSettings(source.getParent(),outputs));
  for(var file:List.of("application-graph.json","preview-model.json","viewer-documents.json","report/screentrace-report.html"))assertArrayEquals(Files.readAllBytes(outputs.resolve("first").resolve(file)),Files.readAllBytes(outputs.resolve("second").resolve(file)),file);
  var mapper=new ObjectMapper();var graph=mapper.readValue(outputs.resolve("first/application-graph.json").toFile(),ApplicationGraph.class);assertDoesNotThrow(()->GraphIntegrityValidator.requireAnalysis(graph));
  var captured=mapper.readTree(outputs.resolve("first/static-preview/element-styles.json").toFile());
  for(var screen:graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN).toList()){
   var elements=captured.path("screens").path(screen.id()).path("elements");
   var html=Files.readString(outputs.resolve("first/static-preview").resolve(screen.id().replaceAll("[^a-zA-Z0-9-]","_")+".html"));
   var tags=MarkupTag.scan(html).stream().filter(t->!t.closing()&&t.name().equals("a")).toList();
   var links=new ArrayList<com.fasterxml.jackson.databind.JsonNode>();elements.forEach(e->{if(e.path("tag").asText().equals("a"))links.add(e);});
   assertEquals(tags.size(),links.size());
   for(int i=0;i<links.size();i++){
    var record=links.get(i);var component=graph.nodes().stream().filter(n->n.id().equals(record.path("graphComponentId").asText())).findFirst().orElseThrow();
    assertEquals(tags.get(i).attribute("href"),component.attributes().get("href"));
    assertEquals(component.attributes().get("expansionAnchor"),record.path("expansionAnchor").asText());assertEquals("ANCHOR",record.path("matchBasis").asText());
   }
  }
  String report=Files.readString(outputs.resolve("first/report/screentrace-report.html"));
  for(String forbidden:List.of(source.toString(),outputs.resolve("first").toString(),System.getProperty("user.home"),"file://","/Users/","C:\\Users\\"))assertFalse(report.contains(forbidden),forbidden);
 }
}
