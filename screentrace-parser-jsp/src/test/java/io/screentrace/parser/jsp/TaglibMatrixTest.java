package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
class TaglibMatrixTest {
  @Test void matchesTheFullTaglibMatrixGolden() throws Exception {
    var result=MarkupAnalysis.parse("taglibs.jsp",Files.readString(Path.of("src/test/resources/wp3/taglibs.jsp")));
    String actual=result.components().stream().map(c->c.tag()+"|"+c.kind()+"|"+c.repeated()).collect(Collectors.joining("\n","","\n"));
    assertEquals(Files.readString(Path.of("src/test/resources/wp3/taglibs.golden")),actual);
    assertTrue(result.rules().stream().anyMatch(r->r.kind().equals("number")));
    assertTrue(result.rules().stream().anyMatch(r->r.kind().equals("url")));
    assertEquals(2,result.behaviors().stream().filter(b->b.type()==BehaviorType.OPEN_DIALOG&&b.targetId()!=null).count());
  }
  @Test void multilineEventAndRuleLocationsReferToTheirAttributeLine() {
    var result=MarkupAnalysis.parse("event.jsp","<input\n  id='email'\n  onchange='load()'\n  required\n>");
    assertEquals(3,result.events().get(0).source().line());assertEquals(4,result.rules().get(0).evidence().get(0).source().line());
  }
  @Test void fakeMarkupInsideElLiteralsDoesNotCreateComponents() {
    var result=MarkupAnalysis.parse("el.jsp","${flag ? '<input name=\"fake\">' : '<button>fake</button>'}<input name='real'>");
    assertEquals(1,result.components().size());assertEquals("real",result.components().get(0).attributes().get("name"));
  }

  @Test void taglibFalseAndDynamicControlTypesAreNotGuessed() {
    var result=MarkupAnalysis.parse("types.jsp","<html:select multiple='false'/><form:select multiple='false'/><select multiple='false'/><form:select multiple='${many}'/><input type='${type}'/>");
    assertEquals(java.util.List.of(ComponentKind.SELECT,ComponentKind.SELECT,ComponentKind.MULTI_SELECT,ComponentKind.OTHER,ComponentKind.OTHER),result.components().stream().map(MarkupAnalysis.Component::kind).toList());
  }

  @Test void allSupportedConditionsAndBothLoopTagsKeepTheirSourcePredicates() {
    for(String tag:java.util.List.of("c:if","c:when","c:otherwise","logic:present","logic:notPresent","logic:equal","logic:notEqual","logic:empty","logic:notEmpty","logic:greaterThan","logic:lessThan")) {
      var result=MarkupAnalysis.parse("guards.jsp","<"+tag+" test='${flag}' name='bean'><input name='field'></"+tag+">");
      assertEquals("${flag}",result.components().get(0).guard());
    }
    for(String tag:java.util.List.of("c:forEach","logic:iterate")) assertTrue(MarkupAnalysis.parse("loops.jsp","<"+tag+"><input name='field'></"+tag+">").components().get(0).repeated());
  }

}
