package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StrutsR16MessageResolutionTest {
  @TempDir Path root;

  private void file(String path, String text) throws Exception {
    Path target=root.resolve(path);Files.createDirectories(target.getParent());Files.writeString(target,text);
  }

  @Test void beanMessageUsesConfiguredDefaultBundleForComponentLabels() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml","<struts-config><message-resources parameter='ApplicationResources'/><message-resources key='secondary' parameter='ExtraMessages'/><action-mappings><action path='/save' type='sample.SaveAction' forward='/page.jsp'/></action-mappings></struts-config>");
    file("src/main/resources/ApplicationResources.properties","screen.title=Account Settings\nbutton.save=Save changes\n");
    file("src/main/resources/ApplicationResources_zh_TW.properties","screen.title=繁體標題\nbutton.save=繁體按鈕\n");
    file("src/main/resources/ExtraMessages.properties","button.save=Secondary bundle value\n");
    file("src/main/webapp/page.jsp","<html><head><title><bean:message key='screen.title'/></title></head><body><html:form action='/save'><button id='save'><bean:message bundle='secondary' key='button.save'/></button><button id='default'><bean:message key='button.save'/></button><button id='missing'><bean:message key='missing.key'/></button></html:form></body></html>");

    ApplicationGraph graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    var save=graph.nodes().stream().filter(node->node.type()==NodeType.COMPONENT&&"save".equals(node.attributes().get("id"))).findFirst().orElseThrow();
    assertEquals("Secondary bundle value",save.name());
    assertEquals("Secondary bundle value",save.attributes().get("visibleText"));
    var defaultBundle=graph.nodes().stream().filter(node->node.type()==NodeType.COMPONENT&&"default".equals(node.attributes().get("id"))).findFirst().orElseThrow();
    assertEquals("Save changes",defaultBundle.name());
    var missing=graph.nodes().stream().filter(node->node.type()==NodeType.COMPONENT&&"missing".equals(node.attributes().get("id"))).findFirst().orElseThrow();
    assertEquals("（訊息 key：missing.key）",missing.name());
    assertEquals("Account Settings",graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&"src/main/webapp/page.jsp".equals(node.attributes().get("view"))).findFirst().orElseThrow().name());
    assertTrue(graph.nodes().stream().filter(node->node.type()==NodeType.COMPONENT).noneMatch(node->node.name().contains("bean:message")));
  }
}
