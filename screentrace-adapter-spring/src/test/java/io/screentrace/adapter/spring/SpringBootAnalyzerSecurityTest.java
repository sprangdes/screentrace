package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class SpringBootAnalyzerSecurityTest {
  @Test void projectImportResolutionRejectsTraversalAndSymlinkFiles() throws Exception {
    Path root = Files.createTempDirectory("spring-import-security");
    Path source = Files.createDirectories(root.resolve("src"));
    Path app = source.resolve("App.tsx");
    Path secret = Files.createTempDirectory("spring-outside").resolve("Outside.tsx");
    Files.writeString(secret, "export function Evil(){return <p>SECRET</p>}");
    Files.createSymbolicLink(source.resolve("Linked.tsx"), secret);
    String escape = source.relativize(secret).toString().replace('\\', '/').replace("Outside.tsx", "Outside");
    Files.writeString(app, "import Outside from '" + escape + "'; import Linked from './Linked';\n<Route path=\"/\" element={<Outside />} />");

    ApplicationGraph graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
    var screen = graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.SCREEN).findFirst().orElseThrow();
    assertEquals("src/App.tsx", screen.attributes().get("viewSource"));
    assertFalse(screen.attributes().get("viewSources").contains("Outside"));
    assertFalse(screen.attributes().get("viewSources").contains("Linked"));
  }
}
