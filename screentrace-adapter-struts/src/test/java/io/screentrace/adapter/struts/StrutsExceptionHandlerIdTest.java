package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

/** Exception handler IDs come from config file, scope, exception type and key; blank lines or comments above them never change them. */
class StrutsExceptionHandlerIdTest {
  private static final String CONFIG = """
      <struts-config>%s
        <global-exceptions>
          <exception key="error" type="sample.Failure" path="/WEB-INF/jsp/home.jsp"/>
          <exception key="error" type="sample.Timeout" path="/WEB-INF/jsp/home.jsp"/>
        </global-exceptions>
        <action-mappings><action path="/edit" type="sample.EditAction">
          <exception key="error" type="sample.Failure" path="/WEB-INF/jsp/home.jsp"/>
          <forward name="ok" path="/WEB-INF/jsp/home.jsp"/>
        </action></action-mappings>
      </struts-config>
      """;

  private static List<String> exceptionHandlers(String prefix) throws Exception {
    Path root = Files.createTempDirectory("struts-exception-ids");
    Path jsp = root.resolve("src/main/webapp/WEB-INF/jsp/home.jsp");
    Files.createDirectories(jsp.getParent());
    Files.writeString(jsp, "<p>home</p>");
    Files.writeString(root.resolve("src/main/webapp/WEB-INF/struts-config.xml"), CONFIG.formatted(prefix));
    ApplicationGraph graph = new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    return graph.nodes().stream().filter(n -> n.type() == NodeType.HANDLER && "例外處理".equals(n.name())).map(GraphNode::id).sorted().toList();
  }

  @Test void blankLinesAndCommentsAboveExceptionsKeepTheirIds() throws Exception {
    var before = exceptionHandlers("");
    var after = exceptionHandlers("\n\n        <!-- moved down by a comment -->\n");
    assertEquals(3, before.size(), before.toString());
    assertEquals(before, after);
  }

  @Test void scopeAndExceptionTypeKeepSameKeyMappingsApart() throws Exception {
    var ids = exceptionHandlers("");
    assertEquals(3, new HashSet<>(ids).size(), ids.toString());
  }
}
