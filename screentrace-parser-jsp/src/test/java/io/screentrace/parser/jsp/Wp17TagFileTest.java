package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertTrue;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class Wp17TagFileTest {
  @Test void expandsNestedAttributeDrivenTagFilesAndDoBody() throws Exception {
    Path root = Path.of("..", "fixtures", "r3", "wp17").toAbsolutePath().normalize();
    var analysis = new JspProjectParser().analyze(root, List.of(
        root.resolve("tag-screen.jsp"), root.resolve("WEB-INF/tags/layout.tag"), root.resolve("WEB-INF/tags/menuItem.tag")));
    assertTrue(analysis.interactions().stream().anyMatch(i -> i.label().equals("Orders") && i.target().equals("/orders")));
    assertTrue(analysis.interactions().stream().anyMatch(i -> i.label().equals("Help") && i.target().equals("/help")));
    assertTrue(analysis.interactions().stream().anyMatch(i -> i.definitionEvidence().stream()
        .anyMatch(e -> e.source().file().endsWith("menuItem.tag"))));
  }
}
