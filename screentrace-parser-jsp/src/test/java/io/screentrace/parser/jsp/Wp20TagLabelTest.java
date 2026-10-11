package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
class Wp20TagLabelTest {
 @Test void knownEscapeWrapperSubstitutesLiteralTitleAndKeepsCallerAndDefinitionEvidence() throws Exception {
  var root=Path.of("../fixtures/r3/wp20").toAbsolutePath().normalize();
  var analysis=new JspProjectParser().analyze(root,List.of(root.resolve("page.jsp")));
  var item=analysis.interactions().stream().filter(i->"/records/find".equals(i.target())).findFirst().orElseThrow();
  assertEquals("Find records",item.label());
  assertTrue(item.definitionEvidence().stream().anyMatch(e->e.source().file().endsWith("item.tag")));
  assertTrue(item.definitionEvidence().stream().anyMatch(e->e.source().file().equals("page.jsp")));
 }
 @Test void bodyTextIsKeptAndDynamicOrUnknownFunctionsAreNeverEvaluated() throws Exception {
  var root=Path.of("../fixtures/r3/wp20").toAbsolutePath().normalize();
  var analysis=new JspProjectParser().analyze(root,List.of(root.resolve("page.jsp")));
  assertTrue(analysis.interactions().stream().anyMatch(i->i.label().equals("Help guide")&&"/help".equals(i.target())));
  assertTrue(analysis.interactions().stream().filter(i->"/records/detail".equals(i.target())).anyMatch(i->i.label().contains("${")));
  assertTrue(analysis.interactions().stream().filter(i->"/unknown".equals(i.target())).anyMatch(i->i.label().contains("custom:decorate")));
 }
}
