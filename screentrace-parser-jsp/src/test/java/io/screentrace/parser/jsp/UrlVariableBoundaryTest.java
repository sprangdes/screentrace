package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.Confidence;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class UrlVariableBoundaryTest {
  private JspAnalysis.Interaction link(String text) throws Exception {
    Path root=Files.createTempDirectory("url-boundary"); Path file=root.resolve("view.jsp"); Files.writeString(file,text);
    return new JspProjectParser().analyze(root,List.of(file)).interactions().stream()
        .filter(i->i.type()==JspAnalysis.InteractionType.NAVIGATION).findFirst().orElseThrow();
  }
  private void unresolved(String text,String raw) throws Exception {
    var item=link(text);assertEquals(raw,item.target());assertEquals(raw,item.originalExpression());
    assertEquals(Confidence.UNRESOLVED,item.confidence());assertTrue(item.definitionEvidence().isEmpty());
  }
  @Test void resolvesBothTagsAndKeepsUseAndDefinitionEvidence() throws Exception {
    for(String tag:List.of("c:url","spring:url")) {
      var item=link("<"+tag+" value=\"/items\" var=\"url\"/>\n<a href=\"${url}\">Items</a>");
      assertEquals("/items",item.target());assertEquals("${url}",item.originalExpression());
      assertEquals(Confidence.CONFIRMED,item.confidence());assertEquals(2,item.source().line());
      assertEquals("view.jsp",item.definitionEvidence().get(0).source().file());
      assertEquals(1,item.definitionEvidence().get(0).source().line());
    }
  }
  @Test void knownEscapeXmlIsTheOnlyFunctionWrapper() throws Exception {
    assertEquals("/items",link("<c:url value='/items' var='url'/><a href='${fn:escapeXml(url)}'>Items</a>").target());
    for(String fn:List.of("fn:trim","fn:unknown","custom:escapeXml")) unresolved("<c:url value='/items' var='url'/><a href='${"+fn+"(url)}'>Items</a>","${"+fn+"(url)}");
  }
  @Test void doesNotResolveDefinitionAfterUse() throws Exception {
    unresolved("<a href='${url}'>Items</a><c:url value='/items' var='url'/>","${url}");
  }
  @Test void repeatedDefinitionIsUnresolvedEvenWithSameValue() throws Exception {
    for(String value:List.of("/other","/items")) unresolved("<c:url value='/items' var='url'/><a href='${url}'>Items</a><c:url value='"+value+"' var='url'/>","${url}");
  }
  @Test void mutuallyExclusiveDefinitionsCannotBeChosen() throws Exception {
    unresolved("<c:choose><c:when test='${flag}'><c:url value='/a' var='url'/></c:when><c:otherwise><c:url value='/b' var='url'/></c:otherwise></c:choose><a href='${url}'>Items</a>","${url}");
  }
  @Test void onlyUsesWithinTheProvenConditionalScopeResolve() throws Exception {
    assertEquals("/a",link("<c:if test='${flag}'><c:url value='/a' var='url'/><a href='${url}'>Items</a></c:if>").target());
    unresolved("<c:if test='${flag}'><c:url value='/a' var='url'/></c:if><a href='${url}'>Items</a>","${url}");
    unresolved("<c:forEach items='${items}'><c:url value='/a' var='url'/><a href='${url}'>Items</a></c:forEach>","${url}");
  }
  @Test void cSetCannotDefineOrReassignAnEligibleVariable() throws Exception {
    unresolved("<c:set var='url' value='/a'/><a href='${url}'>Items</a>","${url}");
    unresolved("<c:url var='url' value='/a'/><c:set var='url' value='/b'/><a href='${url}'>Items</a>","${url}");
  }
  @Test void dynamicValuesScriptletsAndNonVariableExpressionsRemainRaw() throws Exception {
    for(String value:List.of("${ctx}/items","<%= url %>","#{url}")) unresolved("<c:url var='url' value=\""+value+"\"/><a href='${url}'>Items</a>","${url}");
    for(String raw:List.of("${url + '/a'}","${fn:escapeXml(url, other)}","<%= url %>")) unresolved("<c:url var='url' value='/a'/><a href=\""+raw+"\">Items</a>",raw);
  }
  @Test void keepsPathTemplateAndDoesNotResolveParams() throws Exception {
    var item=link("<spring:url var='url' value='/items/{id}'><spring:param name='id' value='${id}'/></spring:url><a href='${url}'>Items</a>");
    assertEquals("/items/{id}",item.target());assertEquals("${url}",item.originalExpression());
    assertFalse(item.definitionEvidence().isEmpty());
    assertEquals("/items",link("<c:url var='url' value='/items'><c:param name='id' value='3'/></c:url><a href='${url}'>Items</a>").target());
  }
  @Test void includeDefinitionsNeverBecomeCrossFileVariables() throws Exception {
    Path root=Files.createTempDirectory("url-include");Path page=root.resolve("view.jsp"),part=root.resolve("part.jspf");
    Files.writeString(page,"<%@ include file='part.jspf' %><a href='${url}'>Items</a>");
    Files.writeString(part,"<c:url var='url' value='/a'/>");
    var item=new JspProjectParser().analyze(root,List.of(page,part)).interactions().get(0);
    assertEquals("${url}",item.target());assertEquals(Confidence.UNRESOLVED,item.confidence());
  }
  @Test void includeCannotReassignALocalVariableAndScriptletsCannotSupplyScopeProof() throws Exception {
    Path root=Files.createTempDirectory("url-include-write"),page=root.resolve("view.jsp"),part=root.resolve("part.jspf");
    Files.writeString(page,"<c:url var='url' value='/safe'/><%@ include file='part.jspf' %><a href='${url}'>Items</a>");
    Files.writeString(part,"<c:set var='url' value='/other'/>");
    var item=new JspProjectParser().analyze(root,List.of(page,part)).interactions().get(0);
    assertEquals("${url}",item.target());assertEquals(Confidence.UNRESOLVED,item.confidence());
    unresolved("<c:url var='url' value='/safe'/><% pageContext.setAttribute(\"url\",\"/other\"); %><a href='${url}'>Items</a>","${url}");
    unresolved("<c:url var='url' value='/safe' scope='session'/><a href='${url}'>Items</a>","${url}");
  }

  @Test void unknownCustomScopeCannotProveASingleDefinition() throws Exception {
    unresolved("<custom:repeat><c:url var='url' value='/a'/><a href='${url}'>Items</a></custom:repeat>","${url}");
    unresolved("<c:url var='url' value='/a'/><c:url var='${name}' value='/b'/><a href='${url}'>Items</a>","${url}");
  }

  @Test void definitionMustBeCompleteBeforeItsUse() throws Exception {
    unresolved("<c:url var='url' value='/a'><a href='${url}'>Items</a></c:url>","${url}");
    assertEquals("/a",link("<c:url var='url' value='/a'><c:param name='id' value='${id}'/></c:url><a href='${url}'>Items</a>").target());
  }

}
