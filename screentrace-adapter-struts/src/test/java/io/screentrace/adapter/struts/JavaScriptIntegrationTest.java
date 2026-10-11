package io.screentrace.adapter.struts;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
class JavaScriptIntegrationTest {
  @Test void minifiedOwnedScriptUsesCanonicalBehaviorsAndStrictEvidence() throws Exception {
    var root=Files.createTempDirectory("struts-js");var web=root.resolve("src/main/webapp");Files.createDirectories(web);
    Files.writeString(web.resolve("page.jsp"),"<button id='save'>Save</button><script src='/owned.min.js'></script>");
    Files.writeString(web.resolve("owned.min.js"),"function send(){fetch('/api')}$('#save').click(send);");
    Files.writeString(web.resolve("struts-config.xml"),"<struts-config><action-mappings><action path='/page' forward='/page.jsp'/></action-mappings></struts-config>");
    var graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    assertEquals("2.2",graph.schemaVersion());assertTrue(graph.behaviors().stream().anyMatch(b->b.type()==BehaviorType.CALL_API));assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
  }
}
