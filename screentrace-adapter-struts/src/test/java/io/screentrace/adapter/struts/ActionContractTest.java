package io.screentrace.adapter.struts;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class ActionContractTest {
 @TempDir Path root;
 @Test void actionFormsParametersAndForwardsProduceSourceContracts() throws Exception {
  Files.writeString(root.resolve("struts-config.xml"),"<struts-config><form-beans><form-bean name='input' type='Input'/></form-beans><action-mappings><action path='/save' type='SaveAction' name='input'><forward name='success' path='/done.jsp'/></action></action-mappings></struts-config>");Files.writeString(root.resolve("Input.java"),"class Input extends ActionForm{String email;int age;}");Files.writeString(root.resolve("SaveAction.java"),"class SaveAction extends Action{public ActionForward execute(ActionMapping m,ActionForm f,HttpServletRequest req,HttpServletResponse res){String token=req.getParameter(\"token\");return m.findForward(\"success\");}}");Files.writeString(root.resolve("done.jsp"),"Done");var g=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));var ep=g.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/save".equals(n.attributes().get("path"))).findFirst().orElseThrow();var c=g.apiContracts().stream().filter(x->x.endpointId().equals(ep.id())).findFirst().orElseThrow();assertTrue(c.request().fields().stream().anyMatch(f->f.name().equals("email")&&f.source().file().equals("Input.java")));assertTrue(c.request().fields().stream().anyMatch(f->f.name().equals("token")&&f.location().equals("QUERY")));assertTrue(c.responses().stream().anyMatch(r->r.bodyType().contains("done.jsp")));assertEquals(Confidence.CONFIRMED,c.confidence());
 }
 @Test void missingActionContractsRemainUnresolved() throws Exception {Files.writeString(root.resolve("struts-config.xml"),"<struts-config><action-mappings><action path='/missing' type='Missing'/></action-mappings></struts-config>");var g=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));assertFalse(g.apiContracts().isEmpty());assertTrue(g.apiContracts().stream().allMatch(c->c.confidence()==Confidence.UNRESOLVED));}
}
