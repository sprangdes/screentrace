package io.screentrace.adapter.struts;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
class MarkupIntegrationTest {
  @Test void bindsDynamicFormPropertiesAndKeepsMarkupRulesInCanonicalGraph() throws Exception {
    Path root=Files.createTempDirectory("struts-markup");Path jsp=root.resolve("src/main/webapp/form.jsp"),config=root.resolve("src/main/webapp/WEB-INF/struts-config.xml");
    Files.createDirectories(config.getParent());
    Files.writeString(config,"<struts-config><form-beans><form-bean name='order' type='org.apache.struts.action.DynaActionForm'><form-property name='email' type='java.lang.String'/></form-bean></form-beans><action-mappings><action path='/save' type='example.Save' name='order'/></action-mappings></struts-config>");
    Files.writeString(jsp,"<html:form action='/save'><c:if test='${show}'><html:text property='email' required='required'/></c:if></html:form>");
    var graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));GraphIntegrityValidator.validate(graph);
    var email=graph.nodes().stream().filter(n->"email".equals(n.attributes().get("property"))).findFirst().orElseThrow();
    assertEquals("CONFIRMED",email.attributes().get("bindingStatus"));assertEquals("true",email.attributes().get("conditional"));
    assertTrue(graph.relationships().stream().anyMatch(e->e.from().equals(email.id())&&e.type()==EdgeType.BINDS_TO));
    assertTrue(graph.validationRules().stream().anyMatch(r->r.layer()==ValidationLayer.MARKUP&&r.fields().contains(email.id())));
  }
  @Test void resolvesInheritedBeanPropertiesFromSourceWithoutLoadingClasses() throws Exception {
    Path root=Files.createTempDirectory("struts-bean"),jsp=root.resolve("src/main/webapp/form.jsp"),config=root.resolve("src/main/webapp/WEB-INF/struts-config.xml"),java=root.resolve("src/main/java/example/Order.java");
    Files.createDirectories(config.getParent());Files.createDirectories(java.getParent());
    Files.writeString(java,"package example; class Base { public String getURL(){ return \"source only\"; } } class Order extends Base {}");
    Files.writeString(config,"<struts-config><form-beans><form-bean name='order' type='example.Order'/></form-beans><action-mappings><action path='/save' type='example.Save' name='order'/></action-mappings></struts-config>");
    Files.writeString(jsp,"<html:form action='/save'><html:text property='URL'/></html:form>");
    var graph=new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    assertEquals("CONFIRMED",graph.nodes().stream().filter(n->"URL".equals(n.attributes().get("property"))).findFirst().orElseThrow().attributes().get("bindingStatus"));
  }

}
