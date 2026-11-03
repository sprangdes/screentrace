package io.screentrace.adapter.spring;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
class R19PersonaGraphTest {
 @TempDir Path root;
 void fixture() throws Exception {for(String name:List.of("auth.tsx","App.tsx","main.tsx")){Path p=root.resolve("src").resolve(name);Files.createDirectories(p.getParent());try(var in=getClass().getResourceAsStream("/r19/src/"+name)){Files.copy(in,p);}}}
 @Test void absentPersonasPreserveSchema() throws Exception {fixture();var graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));assertEquals("2.3",graph.schemaVersion());assertFalse(new ObjectMapper().writeValueAsString(graph).contains("persona"));}
 @Test void configuredEmptyPersonasProduceDimensions() throws Exception {fixture();var graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root).withPersonas(List.of(),3));assertEquals("2.4",graph.schemaVersion());assertFalse(graph.application().personaDimensions().isEmpty());assertTrue(graph.application().personas().isEmpty());}
}
