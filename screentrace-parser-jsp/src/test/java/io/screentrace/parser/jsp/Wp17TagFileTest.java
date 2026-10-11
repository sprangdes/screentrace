package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertTrue;
import java.nio.file.Path;
import java.nio.file.Files;
import java.util.List;
import org.junit.jupiter.api.Test;

class Wp17TagFileTest {
  @Test void expandsNestedAttributeDrivenTagFilesAndDoBody() throws Exception {
    Path root = Path.of("..", "fixtures", "r3", "wp17").toAbsolutePath().normalize();
    var analysis = new JspProjectParser().analyze(root, List.of(
        root.resolve("tag-screen.jsp"), root.resolve("WEB-INF/tags/layout.tag"), root.resolve("WEB-INF/tags/menuItem.tag")));
    assertTrue(analysis.interactions().stream().anyMatch(i -> i.label().equals("Orders") && i.target().equals("/orders")), analysis.interactions()+" / "+analysis.diagnostics());
    assertTrue(analysis.interactions().stream().anyMatch(i -> i.label().equals("Help") && i.target().equals("/help")));
    var generated=analysis.interactions().stream().filter(i->i.label().equals("Orders")).findFirst().orElseThrow();
    assertTrue(generated.componentId()!=null);
    assertTrue(generated.definitionEvidence().stream().anyMatch(e->e.source().file().equals("tag-screen.jsp")));
    assertTrue(generated.definitionEvidence().stream().anyMatch(e->e.source().file().endsWith("menuItem.tag")&&e.source().line()==2));
    var unresolved=analysis.interactions().stream().filter(i->i.label().equals("Unknown target")).findFirst().orElseThrow();
    assertTrue(unresolved.target().equals("${dynamicUrl}")&&unresolved.confidence()==io.screentrace.core.ApplicationGraph.Confidence.UNRESOLVED);
  }

  @Test void reportsTagCyclesAndDepthLimit() throws Exception {
    Path fixture=Path.of("..", "fixtures", "r3", "wp17").toAbsolutePath().normalize();
    var cycle=new JspProjectParser().analyze(fixture,List.of(fixture.resolve("tag-cycle.jsp"),fixture.resolve("WEB-INF/tags/loop.tag")));
    assertTrue(cycle.diagnostics().stream().anyMatch(d->d.code().equals("JSP_TAG_CYCLE")));

    Path root=Files.createTempDirectory("wp17-tag-depth");Path tags=root.resolve("WEB-INF/tags");Files.createDirectories(tags);
    String directive="<%@ taglib prefix=\"d\" tagdir=\"/WEB-INF/tags\" %>";
    Files.writeString(root.resolve("page.jsp"),directive+"<d:step0/>");
    for(int i=0;i<13;i++)Files.writeString(tags.resolve("step"+i+".tag"),directive+"<d:step"+(i+1)+"/>");
    Files.writeString(tags.resolve("step13.tag"),"<a href=\"/done\">Done</a>");
    var depth=new JspProjectParser().analyze(root,List.of(root.resolve("page.jsp")));
    assertTrue(depth.diagnostics().stream().anyMatch(d->d.code().equals("JSP_TAG_DEPTH_LIMIT")));
  }
}
