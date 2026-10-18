package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
class SpringWebFlowTest {
 @Test void registeredFlowEntryAndNamedSubmittersFollowStatesWithoutExecutingActions()throws Exception{
  Path root=Files.createTempDirectory("flow-static");
  write(root,"src/main/webapp/WEB-INF/registry.xml","<beans xmlns:flow=\"urn:flow\"><flow:flow-location id=\"checkout\" path=\"/WEB-INF/flow/checkout.xml\"/></beans>");
  write(root,"src/main/webapp/WEB-INF/flow/checkout.xml","""
   <flow><action-state id="begin"><evaluate expression="service.load()"/><transition to="address"/></action-state>
   <view-state id="address" view="address.jsp"><transition on="next" to="payment"/><transition on="cancel" to="cancel"/></view-state>
   <view-state id="payment" view="payment.jsp"><transition on="back" to="address"/></view-state>
   <end-state id="cancel" view="cancel.jsp"/></flow>
   """);
  write(root,"src/main/webapp/home.jsp","<a href=\"/checkout\">Checkout</a>");
  write(root,"src/main/webapp/WEB-INF/flow/address.jsp","<form:form><input type=\"submit\" name=\"_eventId_next\"/><button name=\"_eventId_cancel\">Cancel</button></form:form>");
  write(root,"src/main/webapp/WEB-INF/flow/payment.jsp","<form:form><button name=\"_eventId_back\">Back</button></form:form>");
  write(root,"src/main/webapp/WEB-INF/flow/cancel.jsp","<p>Cancelled</p>");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
  var next=g.nodes().stream().filter(n->"_eventId_next".equals(n.attributes().get("name"))).findFirst().orElseThrow();
  var payment=g.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&n.attributes().getOrDefault("view","").endsWith("payment.jsp")).findFirst().orElseThrow();
  assertEquals("true",next.attributes().get("submitterAction"));
  assertTrue(g.behaviors().stream().anyMatch(b->next.id().equals(b.triggerId())&&payment.id().equals(b.targetId())));
  assertTrue(g.nodes().stream().anyMatch(n->n.type()==NodeType.ENDPOINT&&"/checkout".equals(n.attributes().get("path"))));
  assertTrue(g.relationships().stream().anyMatch(e->e.type()==EdgeType.RENDERS&&g.nodes().stream().anyMatch(n->n.id().equals(e.to())&&n.attributes().getOrDefault("view","").endsWith("address.jsp"))));
 }
 private static void write(Path r,String f,String s)throws Exception{Path p=r.resolve(f);Files.createDirectories(p.getParent());Files.writeString(p,s);}
}
