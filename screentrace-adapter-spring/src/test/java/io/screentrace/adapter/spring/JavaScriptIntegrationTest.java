package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class JavaScriptIntegrationTest {
  Path project(String page,String js) throws Exception {
    var root=Files.createTempDirectory("javascript-graph");var jsp=root.resolve("src/main/webapp/form.jsp");Files.createDirectories(jsp.getParent());Files.writeString(jsp,page);
    var script=root.resolve("src/main/webapp/app.js");Files.writeString(script,js);return root;
  }
  @Test void adaptersReadJsonPreserveLoadAndFailedBindingAndNeverRunProbe() throws Exception {
    var root=project("<button id='save'>Save</button><input name='email' id='email'/><script src='/app.js'></script>","");var probe=root.resolve("executed-probe");
    Files.writeString(root.resolve("src/main/webapp/app.js"),"require('node:fs').writeFileSync('"+probe+"','EXECUTED');fetch('/load');$('#missing').on('click',function(){fetch('/failed');});$('#save').click(function(){fetch('/clicked');});");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));assertFalse(Files.exists(probe));
    var calls=graph.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).toList();assertEquals(3,calls.size());
    assertTrue(calls.stream().anyMatch(b->b.event().equals("load")&&graph.nodes().stream().anyMatch(n->n.id().equals(b.triggerId())&&n.type()==NodeType.SCREEN)));
    assertTrue(calls.stream().anyMatch(b->b.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.UNRESOLVED&&e.detail().contains("#missing"))));
    assertTrue(ApiUsage.derive(graph,Map.of(),Map.of()).entrySet().stream().filter(e->graph.nodes().stream().anyMatch(n->n.id().equals(e.getKey())&&"javascript-request".equals(n.attributes().get("origin")))).allMatch(e->e.getValue().status()==ApiUsage.Status.IN_USE));
    assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
  }
  @Test void sourceOnlyIncludeLoadCustomValidationAndCallbacksEnterCanonicalGraph() throws Exception {
    var root=project("<form id='form'><input id='email' name='email'/><button id='save' onclick='send()'>Save</button></form><%@ include file='only-script.jspf' %><script src='/app.js'></script>","function send(){$.ajax({url:'/send',success:function(){location.href='/next';}});}$('#form').validate({rules:{email:{required:true}}});");
    Files.writeString(root.resolve("src/main/webapp/only-script.jspf"),"<script>fetch('/include-load');</script>");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));assertTrue(graph.validationRules().stream().anyMatch(r->r.layer()==ValidationLayer.CLIENT));
    assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.NAVIGATE&&b.parentId()!=null));assertTrue(graph.nodes().stream().anyMatch(n->"/include-load".equals(n.attributes().get("path"))));
    assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
  }
  @Test void repeatedAnalysisIsDeterministicAndSyntaxErrorDoesNotLoseOtherUnits() throws Exception {
    var root=project("<script>const = ;fetch('/recovered')</script><script>fetch('/ok')</script>","");
    var inventory=new ProjectScanner().scan(root);var first=new SpringMvcAnalyzer().analyze(inventory);var second=new SpringMvcAnalyzer().analyze(inventory);
    assertEquals(first,second);assertTrue(first.diagnostics().stream().anyMatch(d->d.code().equals("JS_SYNTAX_ERROR")));assertTrue(first.behaviors().stream().anyMatch(b->b.expression().equals("fetch('/ok')")));
  }
  @Test void localModuleFilesAndJspConstantsHaveDefinitionEvidence() throws Exception {
    var root=project("<c:set var='api' value='/api'/><script>fetch('${api}/known');</script><script type='module' src='/app.js'></script>","import {send} from './helper.js';send();");
    Files.writeString(root.resolve("src/main/webapp/helper.js"),"export function send(){fetch('/module');}");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(graph.nodes().stream().anyMatch(n->"/api/known".equals(n.attributes().get("path"))));
    assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API&&b.evidence().stream().anyMatch(e->e.detail().contains("JSP 常值定義：api"))));
    assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API&&b.evidence().stream().anyMatch(e->e.source().file().endsWith("helper.js"))));
  }
  @Test void eventBoundStaticDivBecomesAnOtherComponentWithSourceAndCaller() throws Exception {
    var root=project("<div id='choice' class='choice'>Pick</div><script>$('.choice').click(function(){fetch('/div');});</script>","");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));var call=graph.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).findFirst().orElseThrow();
    var component=graph.nodes().stream().filter(n->n.id().equals(call.triggerId())).findFirst().orElseThrow();assertEquals(NodeType.COMPONENT,component.type());assertEquals("OTHER",component.attributes().get("kind"));assertEquals("choice",component.attributes().get("id"));assertEquals(1,component.source().line());assertEquals(ApiUsage.Status.IN_USE,ApiUsage.derive(graph,java.util.Map.of(),java.util.Map.of()).get(call.targetId()).status());assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
  }
  @Test void multilineScriptOpeningTagRetainsActualOperationLine() throws Exception {
    var root=project("<script\n type='module'>\nfetch('/line');\n</script>","");
    var graph=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API&&b.expression().equals("fetch('/line')")&&b.evidence().stream().anyMatch(e->e.source().file().endsWith("form.jsp")&&e.source().line()==3)));
  }
}
