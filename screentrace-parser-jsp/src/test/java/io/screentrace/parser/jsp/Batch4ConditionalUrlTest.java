package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class Batch4ConditionalUrlTest {
 @Test void thymeleafTernaryPreservesBothUnexecutedGuards() {
  var a=ConditionalUrlTargets.ternary("${editing} ? @{/items/update/{id}(id=${item.id})} : @{/items/add}",3);
  assertEquals(List.of("/items/update/{id}","/items/add"),a.stream().map(ConditionalUrlTargets.Alternative::path).toList());assertEquals("!(${editing})",a.get(1).guard());
  assertTrue(ConditionalUrlTargets.ternary("${service.call()} ? @{/one} : @{/two}",1).isEmpty());
 }
 private String choose(){return "<c:set var=\"route\" value=\"/one\"/>\n<c:choose>\n<c:when test=\"${edit}\"><c:set var=\"route\" value=\"/two\"/></c:when>\n<c:otherwise><c:set var=\"route\" value=\"/one\"/></c:otherwise>\n</c:choose>\n<form action=\"${route}\">";}
 @Test void completeLiteralJstlChoiceRetainsEveryTargetAndRejectsUnknownWrites(){
  var values=ConditionalUrlTargets.jstl(choose(),"<c:url value='${route}' />",6,Set.of());assertEquals(List.of("/two","/one"),values.stream().map(ConditionalUrlTargets.Alternative::path).toList());
  for(String invalid:List.of(choose().replace("value=\"/two\"","value=\"${unknown}\""),choose().replace("<c:otherwise>","<c:when test=\"${other}\">").replace("</c:otherwise>","</c:when>"),choose()+"<% mutate(); %>",choose().replace("</c:choose>","</c:choose><custom:mutate/>"),choose().replace("<c:set var=\"route\" value=\"/two\"/>","<custom:write/><c:set var=\"route\" value=\"/two\"/>")))assertTrue(ConditionalUrlTargets.jstl(invalid,"${route}",6,Set.of()).isEmpty(),invalid);
  assertTrue(ConditionalUrlTargets.jstl(choose(),"${route}",6,Set.of("route")).isEmpty());
 }
 @Test void unknownQueryValuesDoNotHideTheProvenLiteralRoute(){
  String source="<a href=\"<c:url value='/items/edit?id=${row.id.toString()}' />\">Edit</a>";var tag=MarkupTag.scan(source).get(0);var resolution=new UrlVariableResolver("page.jsp",source).resolve(tag.attribute("href"),tag);
  assertEquals("/items/edit?id={queryValue}",resolution.value());assertEquals("INFERRED",resolution.definitions().get(0).resolution().name());
  String dynamic="<a href=\"<c:url value='${route}?id=1' />\">Edit</a>";var unknown=MarkupTag.scan(dynamic).get(0);assertTrue(new UrlVariableResolver("page.jsp",dynamic).resolve(unknown.attribute("href"),unknown).definitions().isEmpty());
 }

}
