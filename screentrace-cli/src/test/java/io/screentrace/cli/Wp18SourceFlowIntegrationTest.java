package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Wp18SourceFlowIntegrationTest {
  @TempDir Path temp;
  @Test void realCliPipelineRetainsEveryReturnFlowAndProducesDeterministicOfflineReports() throws Exception {
    Path root=Path.of("..").toAbsolutePath().normalize(),fixture=root.resolve("fixtures/r3/wp18");
    Path source=temp.resolve("home/projects/wp18");
    try(var files=Files.walk(fixture)) {for(Path file:files.toList()) {
      Path copy=source.resolve(fixture.relativize(file));if(Files.isDirectory(file))Files.createDirectories(copy);else Files.copy(file,copy);
    }}
    var method=ScreenTraceCli.class.getDeclaredMethod("analyze",ProjectCatalog.Project.class,WorkspaceSettings.class);method.setAccessible(true);
    Path outputs=root.resolve("screentrace-cli/target/wp18-fixtures");String oldHome=System.getProperty("user.home");
    System.setProperty("user.home",temp.resolve("home").toString());
    try {
      for(String run:List.of("first","second"))method.invoke(null,new ProjectCatalog.Project("wp18",source,outputs.resolve(run)),new WorkspaceSettings(source.getParent(),outputs));
    } finally {System.setProperty("user.home",oldHome);}
    for(String file:List.of("application-graph.json","preview-model.json","viewer-documents.json","report/screentrace-report.html"))
      assertArrayEquals(Files.readAllBytes(outputs.resolve("first").resolve(file)),Files.readAllBytes(outputs.resolve("second").resolve(file)),file);
    var graph=new ObjectMapper().readValue(outputs.resolve("first/application-graph.json").toFile(),ApplicationGraph.class);
    assertDoesNotThrow(()->GraphIntegrityValidator.requireAnalysis(graph));
    var save=graph.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&n.name().equals("Save record")).findFirst().orElseThrow();
    var detail=graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&n.attributes().getOrDefault("view","").endsWith("records/detail.jsp")).findFirst().orElseThrow();
    assertTrue(graph.relationships().stream().anyMatch(e->e.type()==EdgeType.NAVIGATES_TO&&e.from().equals(save.id())&&e.to().equals(detail.id())&&e.confidence()==Confidence.INFERRED));
  }
}
