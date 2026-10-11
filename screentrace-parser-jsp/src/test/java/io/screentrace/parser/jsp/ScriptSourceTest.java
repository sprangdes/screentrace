package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import io.screentrace.scanner.ProjectScanner;
class ScriptSourceTest {
  Path project(String page, String... files) throws Exception {
    var root=Files.createTempDirectory("script-source");var jsp=root.resolve("src/main/webapp/form.jsp");Files.createDirectories(jsp.getParent());Files.writeString(jsp,page);
    for(String file:files){var p=root.resolve(file);Files.createDirectories(p.getParent());Files.writeString(p,"fetch('/api');");}return root;
  }
  @Test void opaqueLeadingContextIsInferredWithExactFileAndExpressionEvidence() throws Exception {
    for(String prefix:List.of("${ctx}","${base}","${pageContext.request.contextPath}","${pageContext.servletContext.contextPath}")) {
      var root=project("<script src='"+prefix+"/js/app.js'></script>","src/main/webapp/js/app.js");
      var result=ScriptSources.collect(new ProjectScanner().scan(root));
      assertEquals(1,result.scripts().size());assertEquals("INFERRED",result.scripts().get(0).status());
      assertEquals(prefix+"/js/app.js",result.scripts().get(0).expression());assertEquals("src/main/webapp/js/app.js",result.scripts().get(0).file());assertFalse(result.scripts().get(0).evidence().isEmpty());
    }
  }
  @Test void ambiguousCandidatesAreListedAndNeitherIsChosen() throws Exception {
    var root=project("<script src='${ctx}/js/app.js'></script>","src/main/webapp/js/app.js","WebContent/js/app.js");
    var result=ScriptSources.collect(new ProjectScanner().scan(root));assertTrue(result.scripts().isEmpty());
    assertEquals("AMBIGUOUS",result.references().get(0).status());assertEquals(List.of("WebContent/js/app.js","src/main/webapp/js/app.js"),result.references().get(0).candidates());
  }
  @Test void missingMiddleRemoteMultipleAndContradictoryDefinitionsRemainUnresolved() throws Exception {
    for(String src:List.of("${ctx}/missing.js","/x${ctx}/js/app.js","http://${ctx}/js/app.js","//${ctx}/js/app.js","${ctx}${base}/js/app.js")) {
      var root=project("<script src='"+src+"'></script>","src/main/webapp/js/app.js");var result=ScriptSources.collect(new ProjectScanner().scan(root));
      assertTrue(result.scripts().isEmpty());assertEquals("UNRESOLVED",result.references().get(0).status());assertFalse(result.diagnostics().isEmpty());
    }
    var root=project("<script src='${ctx}/js/app.js'></script>","src/main/webapp/js/app.js");
    Files.writeString(root.resolve("src/main/webapp/other.jsp"),"<c:set var='ctx' value='/different'/>");
    var result=ScriptSources.collect(new ProjectScanner().scan(root));assertTrue(result.scripts().isEmpty());assertEquals("UNRESOLVED",result.references().get(0).status());
  }
  @Test void provenDefinitionAndLiteralUrlTagInlineEventAndJavascriptAreCollected() throws Exception {
    var root=project("<c:set var='asset' value='/assets'/><c:url var='script' value='/js/app.js'/>\n<script src='${asset}/app.js'></script><script src='${script}'></script>\n<script type='module'>export const x=1;</script><button onclick='save(this)'>Save</button><a href='javascript:save()'>Save</a>","src/main/webapp/assets/app.js","src/main/webapp/js/app.js");
    var result=ScriptSources.collect(new ProjectScanner().scan(root));assertEquals(5,result.scripts().size());
    assertEquals("CONFIRMED",result.references().get(0).status());assertTrue(result.scripts().stream().anyMatch(s->s.module()));assertTrue(result.scripts().stream().anyMatch(s->s.event().equals("click")));assertTrue(result.scripts().stream().anyMatch(s->s.code().equals("save()")));
  }
  @Test void explicitStandardContextAliasAndBackendContradictionHaveSourceEvidence() throws Exception {
    var alias=project("<c:set var='ctx' value='${pageContext.request.contextPath}'/><script src='${ctx}/js/app.js'></script>","src/main/webapp/js/app.js");
    var known=ScriptSources.collect(new ProjectScanner().scan(alias));assertEquals(1,known.scripts().size());assertEquals("INFERRED",known.scripts().get(0).status());assertTrue(known.scripts().get(0).evidence().stream().anyMatch(e->e.detail().contains("context path 定義")));
    var conflict=project("<script src='${ctx}/js/app.js'></script>","src/main/webapp/js/app.js");
    var java=conflict.resolve("src/main/java/Controller.java");Files.createDirectories(java.getParent());Files.writeString(java,"class Controller { @ModelAttribute(\"ctx\") String ctx(){return \"/other\";} }");
    var unknown=ScriptSources.collect(new ProjectScanner().scan(conflict));assertTrue(unknown.scripts().isEmpty());assertEquals("UNRESOLVED",unknown.references().get(0).status());assertTrue(unknown.references().get(0).evidence().stream().anyMatch(e->e.source().file().endsWith("Controller.java")));
  }
}
