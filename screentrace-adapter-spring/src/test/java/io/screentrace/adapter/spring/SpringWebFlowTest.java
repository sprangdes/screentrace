package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;

class SpringWebFlowTest {
  @Test
  void registeredFlowEntryAndNamedSubmittersFollowStatesWithoutExecutingActions() throws Exception {
    Path root = Files.createTempDirectory("flow-static");
    write(
        root,
        "src/main/webapp/WEB-INF/registry.xml",
        "<beans xmlns:flow=\"urn:flow\"><flow:flow-location id=\"checkout\" path=\"/WEB-INF/flow/checkout.xml\"/></beans>");
    write(
        root,
        "src/main/webapp/WEB-INF/flow/checkout.xml",
        """
   <flow><action-state id="begin"><evaluate expression="service.load()"/><transition to="address"/></action-state>
   <view-state id="address" view="address.jsp"><transition on="next" to="payment"/><transition on="cancel" to="cancel"/></view-state>
   <view-state id="payment" view="payment.jsp"><transition on="back" to="address"/></view-state>
   <end-state id="cancel" view="cancel.jsp"/></flow>
   """);
    write(root, "src/main/webapp/home.jsp", "<a href=\"/checkout\">Checkout</a>");
    write(
        root,
        "src/main/webapp/WEB-INF/flow/address.jsp",
        "<form:form><input type=\"submit\" name=\"_eventId_next\"/><button name=\"_eventId_cancel\">Cancel</button></form:form>");
    write(
        root,
        "src/main/webapp/WEB-INF/flow/payment.jsp",
        "<form:form><button name=\"_eventId_back\">Back</button></form:form>");
    write(root, "src/main/webapp/WEB-INF/flow/cancel.jsp", "<p>Cancelled</p>");
    var g = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    var next =
        g.nodes().stream()
            .filter(n -> "_eventId_next".equals(n.attributes().get("name")))
            .findFirst()
            .orElseThrow();
    var payment =
        g.nodes().stream()
            .filter(
                n ->
                    n.type() == NodeType.SCREEN
                        && n.attributes().getOrDefault("view", "").endsWith("payment.jsp"))
            .findFirst()
            .orElseThrow();
    assertEquals("true", next.attributes().get("submitterAction"));
    assertTrue(
        g.behaviors().stream()
            .anyMatch(b -> next.id().equals(b.triggerId()) && payment.id().equals(b.targetId())));
    assertTrue(
        g.nodes().stream()
            .anyMatch(
                n ->
                    n.type() == NodeType.ENDPOINT
                        && "/checkout".equals(n.attributes().get("path"))));
    assertTrue(
        g.relationships().stream()
            .anyMatch(
                e ->
                    e.type() == EdgeType.RENDERS
                        && g.nodes().stream()
                            .anyMatch(
                                n ->
                                    n.id().equals(e.to())
                                        && n.attributes()
                                            .getOrDefault("view", "")
                                            .endsWith("address.jsp"))));
  }

  @Test
  void missingRegisteredFlowIsDiagnosticRatherThanAGuessedEndpoint() throws Exception {
    Path root = Files.createTempDirectory("flow-missing");
    write(
        root,
        "registry.xml",
        "<beans xmlns:flow=\"urn:flow\"><flow:flow-location id=\"missing\" path=\"/WEB-INF/missing.xml\"/></beans>");
    var g = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(
        g.diagnostics().stream().anyMatch(d -> d.code().equals("FLOW_REFERENCE_UNRESOLVED")));
    assertTrue(g.nodes().stream().noneMatch(n -> n.type() == NodeType.ENDPOINT));
  }

  @Test
  void cyclicStartStateNeverInventsARenderedScreen() throws Exception {
    Path root = Files.createTempDirectory("flow-cycle");
    write(
        root,
        "src/main/webapp/WEB-INF/registry.xml",
        "<beans xmlns:flow=\"urn:flow\"><flow:flow-location id=\"cycle\" path=\"/WEB-INF/flow.xml\"/></beans>");
    write(
        root,
        "src/main/webapp/WEB-INF/flow.xml",
        "<flow><action-state id=\"a\"><transition to=\"b\"/></action-state><action-state id=\"b\"><transition to=\"a\"/></action-state></flow>");
    var g = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(g.diagnostics().stream().anyMatch(d -> d.code().equals("FLOW_START_UNRESOLVED")));
    assertTrue(g.relationships().stream().noneMatch(e -> e.type() == EdgeType.RENDERS));
  }

  @Test
  void brokenFlowIsReportedAloneAndOtherFlowsInTheRegistryAreStillRead() throws Exception {
    // RV-220: duplicate states in the first flow used to skip every later flow of the registry.
    Path root = Files.createTempDirectory("flow-partial");
    write(
        root,
        "src/main/webapp/WEB-INF/registry.xml",
        "<beans xmlns:flow=\"urn:flow\">\n<flow:flow-location id=\"broken\" path=\"/WEB-INF/flow/broken.xml\"/>\n<flow:flow-location id=\"good\" path=\"/WEB-INF/flow/good.xml\"/></beans>");
    write(
        root,
        "src/main/webapp/WEB-INF/flow/broken.xml",
        "<flow><view-state id=\"a\" view=\"a.jsp\"/><view-state id=\"a\" view=\"a.jsp\"/></flow>");
    write(
        root,
        "src/main/webapp/WEB-INF/flow/good.xml",
        "<flow><view-state id=\"start\" view=\"good.jsp\"/></flow>");
    write(root, "src/main/webapp/WEB-INF/flow/a.jsp", "<p>A</p>");
    write(root, "src/main/webapp/WEB-INF/flow/good.jsp", "<p>Good</p>");
    var g = new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(root));
    var paths =
        g.nodes().stream()
            .filter(n -> n.type() == NodeType.ENDPOINT)
            .map(n -> n.attributes().get("path"))
            .toList();
    assertTrue(paths.contains("/good"), paths.toString());
    assertFalse(paths.contains("/broken"), paths.toString());
    var broken = g.diagnostics().stream().filter(d -> d.code().equals("FLOW_UNRESOLVED")).toList();
    assertEquals(1, broken.size(), g.diagnostics().toString());
    assertEquals(2, broken.get(0).source().line());
  }

  private static void write(Path r, String f, String s) throws Exception {
    Path p = r.resolve(f);
    Files.createDirectories(p.getParent());
    Files.writeString(p, s);
  }
}
