package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.GraphIntegrityValidator;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;

class StrutsProjectAnalyzerTest {
  @Test void resolvesStrutsActionFormForwardJspInteractionAndSpringManagedAction() throws Exception {
    Path root = Files.createTempDirectory("struts-spring");
    Path config = root.resolve("src/main/webapp/WEB-INF/struts-config.xml");
    Path spring = root.resolve("src/main/webapp/WEB-INF/applicationContext.xml");
    Path jsp = root.resolve("src/main/webapp/WEB-INF/jsp/orders/result.jsp");
    Files.createDirectories(config.getParent());
    Files.createDirectories(jsp.getParent());
    Files.writeString(config, """
        <struts-config><form-beans><form-bean name="orderForm" type="sample.OrderForm"/></form-beans><action-mappings>
          <action path="/orders/search" type="orderSearchAction" name="orderForm" input="/WEB-INF/jsp/orders/result.jsp">
            <forward name="success" path="/WEB-INF/jsp/orders/result.jsp"/>
          </action>
        </action-mappings><global-forwards><forward name="home" path="/WEB-INF/jsp/orders/result.jsp"/></global-forwards></struts-config>
        """);
    Files.writeString(spring, "<beans><bean id=\"orderSearchAction\" class=\"sample.OrderSearchAction\"/></beans>");
    Files.writeString(jsp, "<html:form action=\"/orders/search.do\"><html:submit value=\"Search\"/></html:form>");

    ApplicationGraph graph = new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));

    assertTrue(graph.application().technologies().contains("Struts 1"));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == ApplicationGraph.NodeType.FORM_MODEL && node.name().equals("orderForm")));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == ApplicationGraph.NodeType.HANDLER && node.name().equals("sample.OrderSearchAction.execute()")));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("ANY /orders/search.do")));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.TRIGGERS));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.FORWARDS_TO));
    assertDoesNotThrow(() -> GraphIntegrityValidator.validate(graph));
  }

  @Test void reportsUnknownForwardWithoutGuessingAScreen() throws Exception {
    Path root = Files.createTempDirectory("struts-unknown-forward");
    Path config = root.resolve("struts-config.xml");
    Files.writeString(config, "<struts-config><action-mappings><action path=\"/x\" type=\"sample.X\"><forward name=\"ok\" path=\"/missing.jsp\"/></action></action-mappings></struts-config>");

    ApplicationGraph graph = new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));

    assertTrue(graph.diagnostics().stream().anyMatch(item -> item.code().equals("STRUTS_FORWARD_UNRESOLVED")));
  }
}
