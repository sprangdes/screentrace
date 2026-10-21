package io.screentrace.adapter.spring;
import io.screentrace.parser.jsp.JavaSources;import org.junit.jupiter.api.Test;import java.util.Map;import static org.junit.jupiter.api.Assertions.*;
class Batch5ContextRedirectTest {
 private SpringControllerReturns.Target read(String body){var unit=JavaSources.parse("import javax.servlet.http.HttpServletRequest;class C{Object go(HttpServletRequest request){"+body+"}}");return SpringControllerReturns.extract(unit.findFirst(com.github.javaparser.ast.body.MethodDeclaration.class).orElseThrow(),"C.java","C",Map.of()).get(0);}
 @Test void directContextSetterIsApplicationRelative(){var t=read("RedirectView result=new RedirectView();result.setUrl(request.getContextPath()+\"/list\");return result;");assertEquals(SpringControllerReturns.Kind.REDIRECT,t.kind());assertEquals("/list",t.value());}
 @Test void conditionalDuplicateOrEscapedObjectsStayUnknown(){for(String body:new String[]{"RedirectView result=new RedirectView();if(flag)result.setUrl(request.getContextPath()+\"/list\");return result;","RedirectView result=new RedirectView();result.setUrl(request.getContextPath()+\"/list\");sink(result);return result;","RedirectView result=new RedirectView();result.setUrl(request.getContextPath()+\"/a\");result.setUrl(request.getContextPath()+\"/b\");return result;"})assertEquals(SpringControllerReturns.Kind.UNKNOWN,read(body).kind());}
}
