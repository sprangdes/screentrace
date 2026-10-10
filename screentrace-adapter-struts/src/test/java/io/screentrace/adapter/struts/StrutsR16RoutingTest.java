package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StrutsR16RoutingTest {
  @TempDir Path root;

  void file(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  ApplicationGraph analyze() throws Exception {
    return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  void actionServlet(String mapping, String config) throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", """
        <web-app>
          <servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class>
            <init-param><param-name>config</param-name><param-value>%s</param-value></init-param>
          </servlet>
          <servlet-mapping><servlet-name>action</servlet-name><url-pattern>%s</url-pattern></servlet-mapping>
        </web-app>
        """.formatted(config, mapping));
  }

  void config(String actions) throws Exception {
    file("src/main/webapp/WEB-INF/struts-config.xml", "<struts-config><global-forwards><forward name=\"home\" path=\"/home.jsp\"/></global-forwards><action-mappings>" + actions + "</action-mappings></struts-config>");
  }

  long endpointCount(ApplicationGraph graph) {
    return graph.nodes().stream().filter(node -> node.type() == NodeType.ENDPOINT).count();
  }

  @Test void configuredExtensionMappingMergesLogicalAndPublicUrlIntoOneEndpoint() throws Exception {
    actionServlet("*.do", "/WEB-INF/struts-config.xml");
    config("<action path=\"/save\" type=\"sample.SaveAction\"><forward name=\"ok\" path=\"/done.jsp\"/></action>");
    file("src/main/webapp/form.jsp", "<html:form action=\"/save.do\"><html:submit value=\"Save\"/></html:form>");
    file("src/main/webapp/other.jsp", "<html:form action=\"/save\"><html:submit value=\"Save\"/></html:form>");
    file("src/main/webapp/done.jsp", "<h1>Done</h1>");

    var graph = analyze();
    var endpoints = graph.nodes().stream().filter(node -> node.type() == NodeType.ENDPOINT).toList();
    assertEquals(1, endpoints.size());
    assertEquals("/save.do", endpoints.get(0).attributes().get("path"));
    assertEquals("/save", endpoints.get(0).attributes().get("logicalPath"));
    assertEquals(2, graph.relationships().stream().filter(edge -> edge.type() == EdgeType.TRIGGERS && edge.to().equals(endpoints.get(0).id())).count());
  }

  @Test void provenMappingMarksMergedCallerConfirmedAndCarriesMappingEvidence() throws Exception {
    actionServlet("*.do", "/WEB-INF/struts-config.xml");
    config("<action path=\"/save\" type=\"sample.SaveAction\"/>");
    file("src/main/webapp/page.jsp", "<html:form action=\"/save.do\"><html:submit value=\"Save\"/></html:form><script>fetch('/save.do',{method:'POST'});</script>");
    file("src/main/java/sample/SaveAction.java", "package sample; class SaveAction extends Action { public ActionForward execute(ActionMapping m, ActionForm f, HttpServletRequest q, HttpServletResponse s){ return null; } }");

    var graph = analyze();
    var endpoint = graph.nodes().stream().filter(node -> node.type() == NodeType.ENDPOINT).findFirst().orElseThrow();
    assertTrue(endpoint.attributes().getOrDefault("aliases", "").contains("/save"));
    var caller = graph.relationships().stream().filter(edge -> edge.type() == EdgeType.CALLS && edge.to().equals(endpoint.id())).findFirst().orElseThrow();
    assertEquals(Confidence.CONFIRMED, caller.confidence());
    assertTrue(caller.evidence().stream().anyMatch(evidence -> Objects.toString(evidence.detail(), "").contains("servlet mapping 已證明")));
  }

  @Test void provenMappingsMergeAliasesIndependentlyAcrossModules() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", """
        <web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class>
          <init-param><param-name>config/admin</param-name><param-value>/WEB-INF/struts-config-admin.xml</param-value></init-param>
          <init-param><param-name>config/shop</param-name><param-value>/WEB-INF/struts-config-shop.xml</param-value></init-param>
        </servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>
        """);
    file("src/main/webapp/WEB-INF/struts-config-admin.xml", "<struts-config><action-mappings><action path=\"/save\" type=\"sample.AdminSave\"/></action-mappings></struts-config>");
    file("src/main/webapp/WEB-INF/struts-config-shop.xml", "<struts-config><action-mappings><action path=\"/save\" type=\"sample.ShopSave\"/></action-mappings></struts-config>");

    var graph = analyze();
    var endpoints = graph.nodes().stream().filter(node -> node.type() == NodeType.ENDPOINT).toList();
    assertEquals(2, endpoints.size());
    assertTrue(endpoints.stream().anyMatch(node -> "/admin/save.do".equals(node.attributes().get("path")) && "/admin/save".equals(node.attributes().get("aliases"))));
    assertTrue(endpoints.stream().anyMatch(node -> "/shop/save.do".equals(node.attributes().get("path")) && "/shop/save".equals(node.attributes().get("aliases"))));
  }

  @Test void unprovenServletMappingPreservesLegacyEndpointCandidatesAndAddsDiagnostic() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", "<web-app><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    config("<action path=\"/save\" type=\"sample.SaveAction\"/>");

    var graph = analyze();
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == NodeType.ENDPOINT && node.name().equals("ANY /save")));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == NodeType.ENDPOINT && node.name().equals("ANY /save.do")));
    assertTrue(graph.diagnostics().stream().anyMatch(diagnostic -> diagnostic.code().equals("STRUTS_SERVLET_MAPPING_UNRESOLVED") && diagnostic.message().contains("未證明")));
  }

  @Test void configuredPrefixMappingPublishesPrefixAndDoesNotInventAnExtension() throws Exception {
    actionServlet("/do/*", "/WEB-INF/struts-config.xml");
    config("<action path=\"/save\" type=\"sample.SaveAction\"/>");
    file("src/main/webapp/form.jsp", "<html:form action=\"/do/save\"><html:submit value=\"Save\"/></html:form>");

    var graph = analyze();
    var endpoints = graph.nodes().stream().filter(node -> node.type() == NodeType.ENDPOINT).toList();
    assertEquals(1, endpoints.size());
    assertEquals("/do/save", endpoints.get(0).attributes().get("path"));
    assertFalse(endpoints.get(0).attributes().get("path").endsWith(".do"));
  }

  @Test void oneActionServletWithTwoPatternsMergesAllPublicAliasesAsConfirmedWithoutDiagnostics() throws Exception {
    actionServlet("*.do", "/WEB-INF/struts-config.xml");
    file("src/main/webapp/WEB-INF/web.xml", Files.readString(root.resolve("src/main/webapp/WEB-INF/web.xml")).replace("</web-app>", "<servlet-mapping><servlet-name>action</servlet-name><url-pattern>/do/*</url-pattern></servlet-mapping></web-app>"));
    config("<action path=\"/save\" type=\"sample.SaveAction\"/>");

    var graph = analyze();
    var endpoints=graph.nodes().stream().filter(node -> node.type() == NodeType.ENDPOINT).toList();
    assertEquals(1, endpoints.size());
    assertEquals("/save.do", endpoints.get(0).attributes().get("path"), "the first web.xml pattern is the primary public URL");
    assertEquals(Set.of("/save", "/do/save"), new HashSet<>(Arrays.asList(endpoints.get(0).attributes().get("aliases").split(","))));
    assertEquals(Confidence.CONFIRMED, endpoints.get(0).confidence());
    assertTrue(graph.diagnostics().stream().noneMatch(diagnostic -> diagnostic.code().startsWith("STRUTS_SERVLET_MAPPING_")));
  }

  @Test void twoActionServletsForTheSameModuleProduceOnlyAmbiguousMappingDiagnostic() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", """
        <web-app>
          <servlet><servlet-name>actionA</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet>
          <servlet><servlet-name>actionB</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet>
          <servlet-mapping><servlet-name>actionA</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping>
          <servlet-mapping><servlet-name>actionB</servlet-name><url-pattern>/do/*</url-pattern></servlet-mapping>
        </web-app>
        """);
    config("<action path=\"/save\" type=\"sample.SaveAction\"/>");

    var graph = analyze();
    assertTrue(graph.diagnostics().stream().anyMatch(diagnostic -> diagnostic.code().equals("STRUTS_SERVLET_MAPPING_AMBIGUOUS") && diagnostic.message().contains("actionA") && diagnostic.message().contains("actionB") && diagnostic.message().contains("web.xml")));
    assertEquals(1, graph.diagnostics().stream().filter(diagnostic -> diagnostic.code().startsWith("STRUTS_SERVLET_MAPPING_")).count());
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == NodeType.ENDPOINT && node.attributes().get("path").equals("/save.do")));
  }

  @Test void declaredActionServletWithoutMappingProducesOnlyUnresolvedMappingDiagnostic() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", """
        <web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class>
          <init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param>
        </servlet></web-app>
        """);
    config("<action path=\"/save\" type=\"sample.SaveAction\"/>");

    var graph = analyze();
    assertTrue(graph.diagnostics().stream().anyMatch(diagnostic -> diagnostic.code().equals("STRUTS_SERVLET_MAPPING_UNRESOLVED")));
    assertEquals(1, graph.diagnostics().stream().filter(diagnostic -> diagnostic.code().startsWith("STRUTS_SERVLET_MAPPING_")).count());
    assertFalse(graph.diagnostics().stream().anyMatch(diagnostic -> diagnostic.code().equals("STRUTS_SERVLET_MAPPING_AMBIGUOUS")));
  }

  @Test void publicUrlForwardResolvesThroughTheMappedActionToItsView() throws Exception {
    actionServlet("*.do", "/WEB-INF/struts-config.xml");
    config("<action path=\"/start\" type=\"sample.StartAction\"><forward name=\"next\" path=\"/next.do\"/></action><action path=\"/next\" type=\"sample.NextAction\"><forward name=\"done\" path=\"/WEB-INF/done.jsp\"/></action>");
    file("src/main/webapp/WEB-INF/done.jsp", "<h1>Done</h1>");

    var graph = analyze();
    var start = graph.nodes().stream().filter(node -> node.type() == NodeType.HANDLER && node.name().contains("StartAction")).findFirst().orElseThrow();
    var done = graph.nodes().stream().filter(node -> node.type() == NodeType.SCREEN && node.attributes().getOrDefault("view", "").endsWith("done.jsp")).findFirst().orElseThrow();
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == EdgeType.FORWARDS_TO && edge.from().equals(start.id()) && edge.to().equals(done.id())));
    assertFalse(graph.diagnostics().stream().anyMatch(diagnostic -> diagnostic.code().equals("STRUTS_FORWARD_UNRESOLVED")));
  }

  @Test void actionLinkForwardChainDeclaresScreenRouteAliasForGraphValidation() throws Exception {
    actionServlet("*.do", "/WEB-INF/struts-config.xml");
    config("<action path=\"/start\" type=\"sample.StartAction\"><forward name=\"next\" path=\"/next.do\"/></action><action path=\"/next\" type=\"sample.NextAction\"><forward name=\"done\" path=\"/WEB-INF/next.jsp\"/></action>");
    file("src/main/webapp/index.jsp", "<html:link action=\"/start.do\">Continue</html:link>");
    file("src/main/webapp/WEB-INF/next.jsp", "<h1>Next</h1>");

    var graph=analyze();
    var destination=graph.nodes().stream().filter(node->node.type()==NodeType.SCREEN&&node.attributes().getOrDefault("view","").endsWith("next.jsp")).findFirst().orElseThrow();
    assertTrue(destination.attributes().getOrDefault("routeAliases","").contains("/start.do"),destination.attributes().toString());
    assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.NAVIGATES_TO&&edge.to().equals(destination.id())));
  }

  @Test void welcomeFileAndLogicRedirectForwardCreateProvableScreenEntrances() throws Exception {
    actionServlet("*.do", "/WEB-INF/struts-config.xml");
    file("src/main/webapp/WEB-INF/web.xml", Files.readString(root.resolve("src/main/webapp/WEB-INF/web.xml")).replace("</web-app>", "<welcome-file-list><welcome-file>index.jsp</welcome-file></welcome-file-list></web-app>"));
    config("<action path=\"/Welcome\" type=\"sample.WelcomeAction\"><forward name=\"page\" path=\"/WEB-INF/welcome.jsp\"/></action>");
    file("src/main/webapp/index.jsp", "<logic:redirect forward=\"home\"/>");
    file("src/main/webapp/home.jsp", "<h1>Home</h1>");
    file("src/main/webapp/WEB-INF/welcome.jsp", "<h1>Welcome</h1>");
    file("src/main/webapp/WEB-INF/struts-config.xml", "<struts-config><global-forwards><forward name=\"home\" path=\"/Welcome.do\"/></global-forwards><action-mappings><action path=\"/Welcome\" type=\"sample.WelcomeAction\"><forward name=\"page\" path=\"/WEB-INF/welcome.jsp\"/></action></action-mappings></struts-config>");

    var graph = analyze();
    var index = graph.nodes().stream().filter(node -> node.type() == NodeType.SCREEN && node.attributes().getOrDefault("view", "").endsWith("index.jsp")).findFirst().orElseThrow();
    var welcome = graph.nodes().stream().filter(node -> node.type() == NodeType.SCREEN && node.attributes().getOrDefault("view", "").endsWith("welcome.jsp")).findFirst().orElseThrow();
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == NodeType.ENDPOINT && "/".equals(node.attributes().get("path"))));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == EdgeType.NAVIGATES_TO && edge.to().equals(welcome.id())), graph.nodes().stream().filter(node->node.type()==NodeType.COMPONENT).toList()+"\n"+graph.relationships()+"\n"+graph.diagnostics());
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == EdgeType.RENDERS && edge.to().equals(index.id())));
  }

  @Test void moduleFormsAndLinksUseTheDeclaredModulePrefix() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", """
        <web-app>
          <servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class>
            <init-param><param-name>config/admin</param-name><param-value>/WEB-INF/struts-config-admin.xml</param-value></init-param>
            <init-param><param-name>config/shop</param-name><param-value>/WEB-INF/struts-config-shop.xml</param-value></init-param>
          </servlet>
          <servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping>
        </web-app>
        """);
    file("src/main/webapp/WEB-INF/struts-config-admin.xml", "<struts-config><action-mappings><action path=\"/save\" type=\"sample.AdminSave\"/></action-mappings></struts-config>");
    file("src/main/webapp/WEB-INF/struts-config-shop.xml", "<struts-config><action-mappings><action path=\"/save\" type=\"sample.ShopSave\"><forward name=\"ok\" path=\"/shop.jsp\"/></action></action-mappings></struts-config>");
    file("src/main/webapp/admin/form.jsp", "<html:form action=\"/save.do\" module=\"/admin\"><html:submit value=\"Save\"/></html:form><html:link action=\"/save.do\" module=\"/shop\">Shop</html:link>");
    file("src/main/webapp/shop.jsp", "<h1>Shop</h1>");

    var graph = analyze();
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == NodeType.ENDPOINT && node.attributes().getOrDefault("path", "").equals("/admin/save.do")));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == NodeType.ENDPOINT && node.attributes().getOrDefault("path", "").equals("/shop/save.do")));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == EdgeType.TRIGGERS && graph.nodes().stream().anyMatch(node -> node.id().equals(edge.to()) && node.attributes().getOrDefault("path", "").equals("/admin/save.do"))), graph.nodes()+"\n"+graph.relationships()+"\n"+graph.diagnostics());
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == EdgeType.NAVIGATES_TO && graph.nodes().stream().anyMatch(node -> node.id().equals(edge.to()) && node.type() == NodeType.SCREEN)),graph.relationships()+"\n"+graph.diagnostics());
  }

  @Test void missingServletMappingKeepsLogicalAndLiteralPublicTargetsSeparate() throws Exception {
    config("<action path=\"/save\" type=\"sample.SaveAction\"/>");
    file("src/main/webapp/form.jsp", "<html:form action=\"/save.do\"><html:submit value=\"Save\"/></html:form>");

    var graph = analyze();
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == NodeType.ENDPOINT && node.attributes().getOrDefault("path", "").equals("/save")));
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == NodeType.ENDPOINT && node.attributes().getOrDefault("path", "").equals("/save.do") && node.confidence() == Confidence.INFERRED));
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type()==EdgeType.TRIGGERS && edge.confidence()==Confidence.INFERRED));
    assertTrue(graph.diagnostics().stream().anyMatch(diagnostic -> diagnostic.code().equals("STRUTS_SERVLET_MAPPING_UNRESOLVED") && diagnostic.message().contains("未證明")));
  }

  @Test void inputForwardAndExceptionPublicPathsResolveThroughActions() throws Exception {
    actionServlet("*.do", "/WEB-INF/struts-config.xml");
    file("src/main/webapp/WEB-INF/struts-config.xml", """
        <struts-config>
          <controller inputForward=\"true\"/>
          <global-forwards><forward name=\"home\" path=\"/home.do\"/></global-forwards>
          <global-exceptions><exception key=\"failure\" type=\"sample.Failure\" path=\"/error.do\"/></global-exceptions>
          <action-mappings>
            <action path=\"/form\" type=\"sample.FormAction\" input=\"home\"/>
            <action path=\"/home\" type=\"sample.HomeAction\"><forward name=\"ok\" path=\"/home.jsp\"/></action>
            <action path=\"/error\" type=\"sample.ErrorAction\"><forward name=\"ok\" path=\"/error.jsp\"/></action>
          </action-mappings>
        </struts-config>
        """);
    file("src/main/webapp/home.jsp", "<h1>Home</h1>");
    file("src/main/webapp/error.jsp", "<h1>Error</h1>");

    var graph = analyze();
    assertTrue(graph.nodes().stream().anyMatch(node -> node.type() == NodeType.HANDLER && node.name().contains("FormAction")));
    assertTrue(graph.diagnostics().stream().noneMatch(diagnostic -> diagnostic.code().equals("STRUTS_FORWARD_UNRESOLVED")),graph.diagnostics().toString());
    assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == EdgeType.FORWARDS_TO && graph.nodes().stream().anyMatch(node -> node.id().equals(edge.to()) && node.type() == NodeType.SCREEN && node.attributes().getOrDefault("view", "").endsWith("home.jsp"))));
  }

  @Test void normalizesStrutsTagActionsAndResolvesModuleRelativeHtmlTargets() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", """
        <web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class>
          <init-param><param-name>config/exercise</param-name><param-value>/WEB-INF/exercise/struts-config.xml</param-value></init-param>
        </servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>
        """);
    file("src/main/webapp/WEB-INF/exercise/struts-config.xml", "<struts-config><action-mappings>"
        + "<action path='/registration-submit' type='sample.Registration'/><action path='/lookup-submit' type='sample.Lookup'/>"
        + "<action path='/mapping-foo' type='sample.Mapping'/><action path='/logic-forward-test-forward' type='sample.ForwardTest'/>"
        + "<action path='/logic-forward' type='sample.Forward'/><action path='/html-cancel-false' type='sample.Cancel'/>"
        + "<action path='/rewrite-target' type='sample.Rewrite'/><action path='/forward-target' type='sample.ForwardTag'/>"
        + "</action-mappings></struts-config>");
    file("src/main/webapp/exercise/registration.jsp", "<html:form action='registration-submit'><html:submit value='Register'/></html:form>");
    file("src/main/webapp/exercise/lookup.jsp", "<html:form action='lookup-submit'><html:submit value='Lookup'/></html:form>");
    file("src/main/webapp/exercise/mapping.jsp", "<html:form action='mapping-foo'><html:submit value='Map'/></html:form>");
    file("src/main/webapp/exercise/logic-forward.jsp", "<html:link action='/logic-forward-test-forward?value=test#top'>Forward</html:link><a href='logic-forward.do?value=test'>Relative</a><html:rewrite action='/rewrite-target.do?x=1#part'/><logic:forward action='forward-target?x=2'/>");
    file("src/main/webapp/exercise/redirect.jsp", "<logic:redirect action='/logic-forward?from=test'/>");
    file("src/main/webapp/exercise/cancel.jsp", "<html:form action='/html-cancel-false'><html:submit value='Cancel'/></html:form>");

    var graph=analyze();
    for(String path:List.of("/exercise/registration-submit.do","/exercise/lookup-submit.do","/exercise/mapping-foo.do",
        "/exercise/logic-forward-test-forward.do","/exercise/logic-forward.do","/exercise/html-cancel-false.do","/exercise/rewrite-target.do","/exercise/forward-target.do")) {
      var endpoint=graph.nodes().stream().filter(node->node.type()==NodeType.ENDPOINT&&path.equals(node.attributes().get("path"))).findFirst().orElseThrow(()->new AssertionError("missing endpoint "+path+"\n"+graph.nodes()));
      assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.TRIGGERS&&edge.to().equals(endpoint.id())),path+"\nEndpoints="+graph.nodes().stream().filter(node->node.type()==NodeType.ENDPOINT).map(node->node.name()+" "+node.attributes()).toList()+"\nComponents="+graph.nodes().stream().filter(node->node.type()==NodeType.COMPONENT).map(node->node.name()+" "+node.attributes()).toList()+"\nTriggers="+graph.relationships().stream().filter(edge->edge.type()==EdgeType.TRIGGERS).toList()+"\n"+graph.diagnostics());
    }
    assertTrue(graph.nodes().stream().filter(node->node.type()==NodeType.COMPONENT&&"/logic-forward?from=test".equals(node.attributes().get("originalTarget"))).anyMatch(node->node.evidence().stream().anyMatch(e->Objects.toString(e.detail(),"").contains("from=test"))));
  }

  @Test void oneJspForwardedFromTwoModulesKeepsBothModuleRelationships() throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", """
        <web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class>
          <init-param><param-name>config/alpha</param-name><param-value>/WEB-INF/struts-config-alpha.xml</param-value></init-param>
          <init-param><param-name>config/beta</param-name><param-value>/WEB-INF/struts-config-beta.xml</param-value></init-param>
        </servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>
        """);
    file("src/main/webapp/WEB-INF/struts-config-alpha.xml", "<struts-config><action-mappings><action path='/save' type='sample.Alpha'><forward name='page' path='/shared/form.jsp'/></action></action-mappings></struts-config>");
    file("src/main/webapp/WEB-INF/struts-config-beta.xml", "<struts-config><action-mappings><action path='/save' type='sample.Beta'><forward name='page' path='/shared/form.jsp'/></action></action-mappings></struts-config>");
    file("src/main/webapp/shared/form.jsp", "<html:form action='save'><html:submit value='Save'/></html:form>");

    var graph=analyze();
    var endpoints=graph.nodes().stream().filter(node->node.type()==NodeType.ENDPOINT&&Set.of("/alpha/save.do","/beta/save.do").contains(node.attributes().get("path"))).toList();
    assertEquals(Set.of("/alpha/save.do","/beta/save.do"),endpoints.stream().map(node->node.attributes().get("path")).collect(java.util.stream.Collectors.toSet()),graph.nodes()+"\n"+graph.diagnostics());
    assertEquals(2,endpoints.stream().filter(endpoint->graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.TRIGGERS&&edge.to().equals(endpoint.id()))).count(),graph.nodes()+"\n"+graph.relationships()+"\n"+graph.diagnostics());
    assertTrue(endpoints.stream().allMatch(endpoint->graph.relationships().stream().filter(edge->edge.type()==EdgeType.TRIGGERS&&edge.to().equals(endpoint.id())).flatMap(edge->edge.evidence().stream()).anyMatch(evidence->evidence.detail()!=null&&evidence.detail().contains("module"))));
  }

  @Test void dispatchActionCallerAlsoMarksThePublicActionMappingInUse() throws Exception {
    actionServlet("*.do", "/WEB-INF/struts-config.xml");
    config("<action path='/mapping-foo' type='sample.MappingAction' parameter='doFoo'/>");
    file("src/main/java/sample/MappingAction.java", "package sample; public class MappingAction extends org.apache.struts.actions.MappingDispatchAction { public org.apache.struts.action.ActionForward doFoo(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){ return null; } }");
    file("src/main/webapp/page.jsp", "<html:form action='/mapping-foo'><html:submit>Map</html:submit></html:form>");

    var graph=analyze();
    var publicEndpoint=graph.nodes().stream().filter(node->node.type()==NodeType.ENDPOINT&&"/mapping-foo.do".equals(node.attributes().get("path"))).findFirst().orElseThrow();
    assertTrue(graph.nodes().stream().anyMatch(node->node.type()==NodeType.ENDPOINT&&node.name().contains("mapping-foo?")),graph.nodes().toString());
    assertTrue(graph.relationships().stream().anyMatch(edge->edge.type()==EdgeType.TRIGGERS&&edge.to().equals(publicEndpoint.id())),graph.relationships().toString());
  }
}
