package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class Wp17TagBodySourceTest {
  @Test void doBodyKeepsOriginalPageUseAndDefinitionLinesAndFollowingPageLines() throws Exception {
    Path root=Path.of("../fixtures/r3/wp17").toAbsolutePath().normalize();
    var analysis=new JspProjectParser().analyze(root,List.of(root.resolve("tag-body-locations.jsp")));
    var edit=analysis.interactions().stream().filter(i->i.label().equals("Edit record")).findFirst().orElseThrow();
    assertEquals(5,edit.source().line());assertEquals("/records/{id}",edit.target());
    assertTrue(edit.definitionEvidence().stream().anyMatch(e->e.source().file().equals("tag-body-locations.jsp")&&e.source().line()==3));
    var after=analysis.interactions().stream().filter(i->i.label().equals("After layout")).findFirst().orElseThrow();
    assertEquals(7,after.source().line());
  }
}
