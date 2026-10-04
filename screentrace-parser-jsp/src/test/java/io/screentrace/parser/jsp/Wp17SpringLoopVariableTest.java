package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.Confidence;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class Wp17SpringLoopVariableTest {
  private static final String DEFINITION="<spring:url var='url' value='/records/{id}'/>";
  private static final String USE="<a href='${url}'>Edit</a>";
  private JspAnalysis.Interaction link(String text) throws Exception {
    Path root=Files.createTempDirectory("wp17-loop"),page=root.resolve("view.jsp");
    Files.writeString(page,text);
    return new JspProjectParser().analyze(root,List.of(page)).interactions().stream()
        .filter(i->i.type()==JspAnalysis.InteractionType.NAVIGATION).findFirst().orElseThrow();
  }
  private void unresolved(String text) throws Exception {
    var item=link(text);
    assertEquals("${url}",item.target());assertEquals("${url}",item.originalExpression());
    assertEquals(Confidence.UNRESOLVED,item.confidence());assertTrue(item.definitionEvidence().isEmpty());
  }
  @Test void resolvesStaticTemplateInsideItsLoopWithEscapeXmlAndPreservesParamsAndEvidence() throws Exception {
    Path root=Path.of("../fixtures/r3/wp17").toAbsolutePath().normalize();
    var item=new JspProjectParser().analyze(root,List.of(root.resolve("loop-spring-url.jsp"))).interactions().get(0);
    assertEquals("/records/{recordId}/edit",item.target());
    assertEquals("${fn:escapeXml(editUrl)}",item.originalExpression());assertEquals(Confidence.CONFIRMED,item.confidence());
    assertEquals("loop-spring-url.jsp",item.definitionEvidence().get(0).source().file());
    assertEquals(2,item.definitionEvidence().get(0).source().line());assertEquals(6,item.source().line());
    assertTrue(item.definitionEvidence().get(0).detail().contains("OQ-013"));
  }
  @Test void resolvesPureVariableInKnownLoopsIncludingSameLoopConditionalUse() throws Exception {
    for(String loop:List.of("c:forEach","logic:iterate")) {
      assertEquals("/records/{id}",link("<"+loop+" items='${records}'>"+DEFINITION+USE+"</"+loop+">").target());
      assertEquals("/records/{id}",link("<"+loop+" items='${records}'>"+DEFINITION+"<c:if test='${flag}'>"+USE+"</c:if></"+loop+">").target());
    }
  }
  @Test void useOutsideOrInADifferentNestedLoopIsUnresolved() throws Exception {
    unresolved("<c:forEach items='${records}'>"+DEFINITION+"</c:forEach>"+USE);
    unresolved("<c:forEach items='${records}'>"+DEFINITION+"<c:forEach items='${children}'>"+USE+"</c:forEach></c:forEach>");
  }
  @Test void secondDefinitionAnywhereIsUnresolvedEvenWithIdenticalValue() throws Exception {
    for(String second:List.of(DEFINITION,"<spring:url var='url' value='/other'/>","<c:url var='url' value='/records/{id}'/>"))
      unresolved("<c:forEach items='${records}'>"+DEFINITION+USE+"</c:forEach>"+second);
  }
  @Test void valueContainingElCannotResolve() throws Exception {
    unresolved("<c:forEach items='${records}'><spring:url var='url' value='${prefix}/records/{id}'/>"+USE+"</c:forEach>");
  }
  @Test void cSetAnywhereThatMayRewriteTheVariableBlocksResolution() throws Exception {
    String loop="<c:forEach items='${records}'>"+DEFINITION+USE+"</c:forEach>";
    for(String write:List.of("<c:set var='url' value='/other'/>","<c:set var='${name}' value='/other'/>")) {
      unresolved(write+loop);unresolved(loop+write);
    }
  }
  @Test void scriptletAnywhereBlocksResolution() throws Exception {
    String loop="<c:forEach items='${records}'>"+DEFINITION+USE+"</c:forEach>";
    String write="<% pageContext.setAttribute(\"url\",\"/other\"); %>";
    unresolved(write+loop);unresolved(loop+write);
  }
  @Test void cUrlLoopsUnknownCustomScopesAndUseBeforeDefinitionRemainUnresolved() throws Exception {
    unresolved("<c:forEach items='${records}'><c:url var='url' value='/records/{id}'/>"+USE+"</c:forEach>");
    unresolved("<custom:repeat>"+DEFINITION+USE+"</custom:repeat>");
    unresolved("<c:forEach items='${records}'><custom:repeat>"+DEFINITION+USE+"</custom:repeat></c:forEach>");
    unresolved("<c:forEach items='${records}'>"+USE+DEFINITION+"</c:forEach>");
  }
  @Test void incompleteOrMismatchedLoopBoundariesCannotProveScope() throws Exception {
    unresolved("<c:forEach items='${records}'>"+DEFINITION+USE);
    unresolved("<c:if test='${flag}'><c:forEach items='${records}'>"+DEFINITION+USE+"</c:if></c:forEach>");
  }
}
