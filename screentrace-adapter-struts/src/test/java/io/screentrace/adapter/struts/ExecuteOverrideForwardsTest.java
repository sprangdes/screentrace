package io.screentrace.adapter.struts;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;import java.nio.file.*;import java.util.*;import io.screentrace.scanner.ProjectScanner;import io.screentrace.core.ApplicationGraph;import io.screentrace.core.ApplicationGraph.*;import static org.junit.jupiter.api.Assertions.*;
/** oussamazoghlami/SpringStrutsHibernate: DispatchAction subclasses that only override execute(), and XML forwards the code never returns. */
class ExecuteOverrideForwardsTest {
 @TempDir Path root;void write(String name,String text)throws Exception{Path f=root.resolve(name);Files.createDirectories(f.getParent());Files.writeString(f,text);}
 private static final String SIGNATURE="(ActionMapping mapping, ActionForm form, HttpServletRequest request, HttpServletResponse response)";
 private static final String IMPORTS="import org.apache.struts.action.*; import org.apache.struts.actions.DispatchAction; import javax.servlet.http.*;";
 private ApplicationGraph analyze(String actions)throws Exception{
  write("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>a</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>a</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
  write("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><action-mappings>"+actions+"</action-mappings></struts-config>");
  write("src/main/webapp/list.jsp","<h1>List</h1>");write("src/main/webapp/other.jsp","<h1>Other</h1>");
  return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
 }
 private static List<String> forwardsFrom(ApplicationGraph graph,String handlerPrefix){Map<String,GraphNode> n=new HashMap<>();graph.nodes().forEach(x->n.put(x.id(),x));
  return graph.relationships().stream().filter(e->e.type()==EdgeType.FORWARDS_TO&&n.get(e.from()).name().startsWith(handlerPrefix)).map(e->n.get(e.to()).name()).sorted().toList();}

 @Test void executeOnlyDispatchActionIsAPlainAction()throws Exception{
  write("src/main/java/sample/ListAction.java","package sample; "+IMPORTS+" public class ListAction extends DispatchAction { public ActionForward execute"+SIGNATURE+" { return mapping.findForward(\"success\"); } }");
  var graph=analyze("<action path='/list' type='sample.ListAction'><forward name='success' path='/list.jsp'/></action>");
  var handler=graph.nodes().stream().filter(x->x.type()==NodeType.HANDLER&&x.name().startsWith("sample.ListAction")).findFirst().orElseThrow();
  assertEquals("sample.ListAction.execute()",handler.name());
  assertFalse(handler.attributes().containsKey("dispatchFamily"));
  assertEquals(Confidence.CONFIRMED,handler.confidence());
  assertTrue(graph.diagnostics().stream().noneMatch(d->d.code().equals("STRUTS_DISPATCH_UNRESOLVED")),graph.diagnostics().toString());
  assertEquals(List.of("list"),forwardsFrom(graph,"sample.ListAction"));
 }

 @Test void declaredForwardTheCodeNeverReturnsIsNotADestination()throws Exception{
  // JasperListCustomerAction: returns findForward("error") (undeclared) or null after writing a PDF; XML declares only "success".
  write("src/main/java/sample/PdfAction.java","package sample; "+IMPORTS+" public class PdfAction extends DispatchAction { public ActionForward execute"+SIGNATURE+" { try { response.getOutputStream(); } catch (Exception e) { return mapping.findForward(\"error\"); } return null; } }");
  var graph=analyze("<action path='/pdf' type='sample.PdfAction'><forward name='success' path='/list.jsp'/></action>");
  assertEquals(List.of(),forwardsFrom(graph,"sample.PdfAction"));
  var unused=graph.diagnostics().stream().filter(d->d.code().equals("STRUTS_FORWARD_UNUSED")).toList();
  assertEquals(1,unused.size(),graph.diagnostics().toString());
  assertEquals(Confidence.INFERRED,unused.get(0).confidence());
  assertTrue(unused.get(0).message().contains("success"));
 }

 @Test void declaredForwardsStayWhenTheCodeCouldStillNameThem()throws Exception{
  write("src/main/java/sample/DynamicAction.java","package sample; "+IMPORTS+" public class DynamicAction extends DispatchAction { public ActionForward execute"+SIGNATURE+" { return mapping.findForward(request.getParameter(\"next\")); } }");
  write("src/main/java/sample/HelperAction.java","package sample; "+IMPORTS+" public class HelperAction extends DispatchAction { public ActionForward execute"+SIGNATURE+" { return Routes.pick(mapping); } }");
  write("src/main/java/sample/Routes.java","package sample; import org.apache.struts.action.*; public class Routes { static ActionForward pick(ActionMapping m){ return m.findForward(\"other\"); } }");
  var graph=analyze("<action path='/dynamic' type='sample.DynamicAction'><forward name='success' path='/list.jsp'/></action>"
   +"<action path='/helper' type='sample.HelperAction'><forward name='other' path='/other.jsp'/></action>");
  assertEquals(List.of("list"),forwardsFrom(graph,"sample.DynamicAction"),"dynamic findForward name");
  assertEquals(List.of("other"),forwardsFrom(graph,"sample.HelperAction"),"mapping handed to other code");
  assertTrue(graph.diagnostics().stream().noneMatch(d->d.code().equals("STRUTS_FORWARD_UNUSED")),graph.diagnostics().toString());
 }
}
