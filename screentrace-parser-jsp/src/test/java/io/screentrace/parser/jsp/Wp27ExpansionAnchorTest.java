package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class Wp27ExpansionAnchorTest {
 private static final Path ROOT=Path.of("../fixtures/r7/anchors").toAbsolutePath().normalize();
 private List<MarkupAnalysis.Component> components(String page)throws Exception {
  return new JspProjectParser().analyze(ROOT,List.of(ROOT.resolve(page))).markup().get(page).components();
 }
 private List<String> anchors(String page)throws Exception {return components(page).stream().map(c->c.attributes().get("expansionAnchor")).toList();}
 @Test void threeCallsKeepDistinctCallSites()throws Exception {
  assertEquals(List.of("calls.jsp:2 > WEB-INF/tags/item.tag:1","calls.jsp:3 > WEB-INF/tags/item.tag:1","calls.jsp:4 > WEB-INF/tags/item.tag:1"),anchors("calls.jsp"));
  assertEquals(List.of("/one","/two","/three"),components("calls.jsp").stream().map(c->c.attributes().get("href")).toList());
 }
 @Test void nestedChainAndEachPageKeepOwnOrigin()throws Exception {
  String tail=" > WEB-INF/tags/a.tag:2 > WEB-INF/tags/b.tag:2 > WEB-INF/tags/c.tag:1";
  assertEquals(List.of("nested.jsp:2"+tail),anchors("nested.jsp"));assertEquals(List.of("other.jsp:2"+tail),anchors("other.jsp"));
 }
 @Test void bodyUsesCallerPositionAndLoopsKeepStaticAnchor()throws Exception {
  assertEquals(List.of("body.jsp:3"),anchors("body.jsp"));
  assertEquals(List.of("loop.jsp:3 > WEB-INF/tags/item.tag:1"),anchors("loop.jsp"));
 }
 @Test void sameLineOpeningTagsHaveOrdinals()throws Exception {assertEquals(List.of("same-line.jsp:1#1","same-line.jsp:1#2"),anchors("same-line.jsp"));}
 @Test void limitedExpansionHasNoInventedComponentsOrAnchors()throws Exception {
  for(String page:List.of("cycle.jsp","depth.jsp")){
   var result=new JspProjectParser().analyze(ROOT,List.of(ROOT.resolve(page)));
   assertTrue(result.diagnostics().stream().anyMatch(d->d.code().equals(page.equals("cycle.jsp")?"JSP_TAG_CYCLE":"JSP_TAG_DEPTH_LIMIT")));
   assertTrue(result.markup().get(page).components().isEmpty());
  }
 }
 @Test void addedAttributesDoNotChangeIdentityOrBehaviorAndOutputIsDeterministic()throws Exception {
  var mapper=new ObjectMapper();
  for(String page:List.of("calls.jsp","nested.jsp","body.jsp","loop.jsp","same-line.jsp")){
   String text=new JspTagFileExpander().expand(ROOT,page,Files.readString(ROOT.resolve(page))).text();
   var original=MarkupAnalysis.parse(page,text);var result=components(page);
   assertEquals(original.components().stream().map(MarkupAnalysis.Component::id).toList(),result.stream().map(MarkupAnalysis.Component::id).toList());
   assertTrue(result.stream().allMatch(c->c.attributes().containsKey("expansionAnchor")));
   assertArrayEquals(mapper.writeValueAsBytes(components(page)),mapper.writeValueAsBytes(components(page)));
  }
 }
}
