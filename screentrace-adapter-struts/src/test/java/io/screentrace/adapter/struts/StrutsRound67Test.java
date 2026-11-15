package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R67: remaining Struts findings of the 2026-11-14 code review. */
class StrutsRound67Test {
  private static final String WEB_XML =
      "<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>";
  private static final String SIGNATURE =
      "(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;}";

  @TempDir Path root;

  void file(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  ApplicationGraph analyze(String actions) throws Exception {
    file("src/main/webapp/WEB-INF/web.xml", WEB_XML);
    file(
        "src/main/webapp/WEB-INF/struts-config.xml",
        "<struts-config><action-mappings>" + actions + "</action-mappings></struts-config>");
    return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  static GraphNode screen(ApplicationGraph graph, String suffix) {
    return graph.nodes().stream()
        .filter(
            n ->
                n.type() == NodeType.SCREEN
                    && n.attributes().getOrDefault("view", "").endsWith(suffix))
        .findFirst()
        .orElseThrow(() -> new AssertionError(graph.nodes().toString()));
  }

  @Test
  void inputForwardUsesTheActionsOwnForwardFirst() throws Exception {
    // RV-303
    file("src/main/webapp/WEB-INF/struts-config-controller.xml", "");
    file("src/main/webapp/edit.jsp", "<h1>Edit</h1>");
    var graph =
        analyze(
            "</action-mappings><controller inputForward=\"true\"/><action-mappings><action path=\"/save\" type=\"s.Save\" input=\"failure\"><forward name=\"failure\" path=\"/edit.jsp\"/></action>");
    assertTrue(
        graph.diagnostics().stream().noneMatch(d -> d.message().contains("failure")),
        graph.diagnostics().toString());
  }

  @Test
  void prefixAndPageOnAnOrdinaryActionAreNotASwitchAction() throws Exception {
    // RV-315
    file("src/main/webapp/list.jsp", "<a href=\"/search.do?prefix=ab&page=2\">Next</a>");
    file("src/main/webapp/result.jsp", "<p>Result</p>");
    var graph =
        analyze(
            "<action path=\"/search\" type=\"s.Search\"><forward name=\"ok\" path=\"/result.jsp\"/></action><action path=\"/list\" type=\"s.List\" forward=\"/list.jsp\"/>");
    assertTrue(
        graph.diagnostics().stream().noneMatch(d -> d.code().equals("STRUTS_ROUTE_UNRESOLVED")),
        graph.diagnostics().toString());
  }

  @Test
  void mappingDispatchActionInventsNoRequestParameter() throws Exception {
    // RV-316
    file(
        "src/main/java/s/Users.java",
        "package s; public class Users extends org.apache.struts.actions.MappingDispatchAction { public org.apache.struts.action.ActionForward save"
            + SIGNATURE
            + " }");
    file(
        "src/main/webapp/form.jsp",
        "<html:form action=\"/save\"><html:submit value=\"Save\"/></html:form>");
    var graph = analyze("<action path=\"/save\" type=\"s.Users\" parameter=\"save\"/>");
    assertTrue(
        graph.nodes().stream().noneMatch(n -> n.name().contains("?save=save")),
        graph.nodes().stream().map(GraphNode::name).toList().toString());
  }

  @Test
  void bundleMatchesOnlyAtAFileNameBoundary() {
    // RV-318
    assertTrue(StrutsMessages.bundleFile("src/main/resources/Messages.properties", "Messages"));
    assertTrue(
        StrutsMessages.bundleFile(
            "src/main/resources/com/x/Messages.properties", "com.x.Messages"));
    assertFalse(
        StrutsMessages.bundleFile("src/main/resources/AdminMessages.properties", "Messages"));
  }

  @Test
  void validationFilesNamedByThePlugInAreRead() throws Exception {
    // RV-321
    file(
        "src/main/webapp/WEB-INF/validation-user.xml",
        "<form-validation><formset><form name=\"userForm\"><field property=\"name\" depends=\"required\"/></form></formset></form-validation>");
    var graph =
        analyze(
            "</action-mappings><plug-in className=\"org.apache.struts.validator.ValidatorPlugIn\"><set-property property=\"pathnames\" value=\"/WEB-INF/validator-rules.xml,/WEB-INF/validation-user.xml\"/></plug-in><action-mappings>");
    assertTrue(
        graph.validationRules().stream().anyMatch(r -> r.fields().contains("name")),
        graph.validationRules().toString());
  }

  @Test
  void tilesPutContentAttributeAndBodyAreRead() throws Exception {
    // RV-322
    file(
        "tiles-defs.xml",
        "<tiles-definitions><definition name=\".page\" path=\"/layout.jsp\"><put name=\"body\" content=\"/body.jsp\"/></definition></tiles-definitions>");
    file(
        "src/main/webapp/layout.jsp",
        "<html><body><tiles:insert attribute=\"body\"/></body></html>");
    file("src/main/webapp/body.jsp", "<h1>Body Title</h1>");
    file("src/main/webapp/other/userbody.jsp", "<h1>Wrong</h1>");
    var graph = analyze("<action path=\"/p\" type=\"s.P\" forward=\".page\"/>");
    var page =
        graph.nodes().stream()
            .filter(n -> n.id().equals(ApplicationGraph.id(NodeType.SCREEN, "tiles:.page")))
            .findFirst()
            .orElseThrow();
    assertEquals("Body Title", page.name());
  }

  @Test
  void dispatchResolutionIsRecordedOnTheComponent() throws Exception {
    // RV-307
    file(
        "src/main/java/s/D.java",
        "package s; public class D extends org.apache.struts.actions.DispatchAction { public org.apache.struts.action.ActionForward save"
            + SIGNATURE
            + " }");
    file("src/main/webapp/page.jsp", "<a href=\"/d.do?method=save\">Save</a>");
    var graph = analyze("<action path=\"/d\" type=\"s.D\" parameter=\"method\"/>");
    assertTrue(
        graph.nodes().stream()
            .anyMatch(
                n ->
                    n.type() == NodeType.COMPONENT
                        && "save".equals(n.attributes().get("dispatchMethod"))
                        && "方法存在".equals(n.attributes().get("dispatchMethodStatus"))),
        graph.nodes().toString());
  }

  @Test
  void inheritedDispatchMethodIsFollowedThroughAForward() throws Exception {
    // RV-309
    file(
        "src/main/java/s/Base.java",
        "package s; public abstract class Base extends org.apache.struts.actions.DispatchAction { public org.apache.struts.action.ActionForward list"
            + SIGNATURE
            + " }");
    file("src/main/java/s/Users.java", "package s; public class Users extends Base {}");
    file("src/main/webapp/page.jsp", "<a href=\"/start.do\">Start</a>");
    var graph =
        analyze(
            "<action path=\"/start\" type=\"s.Start\"><forward name=\"go\" path=\"/users.do?method=list\" redirect=\"true\"/></action><action path=\"/users\" type=\"s.Users\" parameter=\"method\"/>");
    assertTrue(
        graph.nodes().stream()
            .anyMatch(
                n -> n.type() == NodeType.HANDLER && "list".equals(n.attributes().get("method"))),
        graph.nodes().stream().filter(n -> n.type() == NodeType.HANDLER).toList().toString());
  }

  @Test
  void theWebRootDescriptorWinsOverASampleOne() throws Exception {
    // RV-314
    file("docs/sample/WEB-INF/web.xml", WEB_XML.replace("*.do", "/sample/*"));
    var graph = analyze("<action path=\"/list\" type=\"s.List\"/>");
    assertTrue(
        graph.nodes().stream()
            .anyMatch(
                n ->
                    n.type() == NodeType.ENDPOINT && "/list.do".equals(n.attributes().get("path"))),
        graph.nodes().stream().filter(n -> n.type() == NodeType.ENDPOINT).toList().toString());
  }
}
