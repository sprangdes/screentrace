package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StrutsCompletenessTest {
  @TempDir Path root;
  void file(String path,String text) throws Exception {Path file=root.resolve(path);Files.createDirectories(file.getParent());Files.writeString(file,text);}
  ApplicationGraph analyze() throws Exception {return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));}
  void base() throws Exception {
    file("src/main/webapp/WEB-INF/jsp/home.jsp","<html:form action=\"/edit.do\"><html:submit property=\"op\" value=\"save\"/></html:form>");
    file("src/main/webapp/WEB-INF/struts-config.xml","""
      <struts-config>
        <form-beans><form-bean name="editForm" type="org.apache.struts.action.DynaActionForm"><form-property name="name" type="java.lang.String" initial=""/></form-bean></form-beans>
        <global-forwards><forward name="home" path="/WEB-INF/jsp/home.jsp"/></global-forwards>
        <global-exceptions><exception key="error" type="sample.Failure" path="/WEB-INF/jsp/home.jsp"/></global-exceptions>
        <action-mappings><action path="/edit" type="sample.EditAction" name="editForm" scope="request" validate="true" input="/WEB-INF/jsp/home.jsp" parameter="op"><forward name="ok" path="/WEB-INF/jsp/home.jsp"/></action></action-mappings>
        <plug-in className="org.apache.struts.validator.ValidatorPlugIn"><set-property property="pathnames" value="/WEB-INF/validation.xml"/></plug-in>
      </struts-config>
      """);
    file("src/main/java/sample/EditAction.java","""
      package sample;
      import org.apache.struts.actions.DispatchAction;
      class EditAction extends DispatchAction {
        public ActionForward save(ActionMapping mapping, ActionForm form, HttpServletRequest request, HttpServletResponse response) { return mapping.findForward("ok"); }
        Object other(Object mapping, String dynamic) { return mapping.findForward(dynamic); }
      }
      """);
  }
  @Test void rejectsEveryStrutsTwoSignalWithoutPartialAnalysis() throws Exception {
    base();
    for(String signal:List.of("config","dependency","package")) {
      Path marker=root.resolve(signal.equals("config")?"struts.xml":signal.equals("dependency")?"pom.xml":"Unsupported.java");
      Files.writeString(marker,signal.equals("config")?"<struts/>":signal.equals("dependency")?"<project><dependencies><dependency><groupId>org.apache.struts</groupId><artifactId>struts2-core</artifactId></dependency></dependencies></project>":"import org.apache.struts2.ActionSupport;");
      var graph=analyze();
      assertTrue(graph.nodes().isEmpty(),signal);
      assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("UNSUPPORTED_FRAMEWORK")),signal);
      Files.delete(marker);
    }
  }
  @Test void retainsMappingDynaPropertiesPluginsExceptionsAndRealLines() throws Exception {
    base();var graph=analyze();
    var handler=graph.nodes().stream().filter(n->n.type()==NodeType.HANDLER && n.attributes().containsKey("scope")).findFirst().orElseThrow();
    assertEquals("request",handler.attributes().get("scope"));assertEquals("true",handler.attributes().get("validate"));assertEquals("op",handler.attributes().get("parameter"));
    assertEquals(5,handler.source().line());
    assertTrue(graph.nodes().stream().anyMatch(n->"java.lang.String".equals(n.attributes().get("field.name.type"))));
    assertTrue(graph.nodes().stream().anyMatch(n->"org.apache.struts.validator.ValidatorPlugIn".equals(n.attributes().get("className"))));
    assertTrue(graph.nodes().stream().anyMatch(n->"sample.Failure".equals(n.attributes().get("type"))));
    assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
    assertEquals("2.2",graph.schemaVersion());
    assertTrue(graph.nodes().stream().allMatch(n->n.evidence().stream().allMatch(e->!e.parser().equals("LEGACY"))));
  }
  @Test void resolvesDispatchRequestToActualMethodAndLiteralForward() throws Exception {
    base();var graph=analyze();
    assertTrue(graph.nodes().stream().anyMatch(n->n.name().equals("sample.EditAction.save()")&&n.confidence()==Confidence.CONFIRMED));
    var handler=graph.nodes().stream().filter(n->n.name().equals("sample.EditAction.save()")).findFirst().orElseThrow();
    assertTrue(graph.relationships().stream().anyMatch(e->e.from().equals(handler.id())&&e.type()==EdgeType.FORWARDS_TO));
    assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_FORWARD_EXPRESSION")));
    assertFalse(graph.behaviors().isEmpty());
  }
  @Test void keepsUnknownDispatchParametersUnresolved() throws Exception {
    base();file("src/main/webapp/WEB-INF/jsp/home.jsp","<html:form action=\"/edit.do\"><html:submit property=\"op\" value=\"${method}\"/></html:form>");
    assertTrue(analyze().diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_DISPATCH_UNRESOLVED")));
  }
  @Test void parsesValidatorRulesAndActionFormWithoutExecutingJava() throws Exception {
    base();
    file("src/main/webapp/WEB-INF/validation.xml","""
      <form-validation><formset><form name="editForm"><field property="name" depends="required,minlength"><msg name="required" key="name.required"/><var><var-name>minlength</var-name><var-value>2</var-value></var></field></form></formset></form-validation>
      """);
    file("src/main/webapp/WEB-INF/validator-rules.xml","<form-validation><global><validator name=\"required\" classname=\"sample.Rules\" method=\"check\"/><validator name=\"minlength\" classname=\"sample.Rules\" method=\"checkLength\"/></global></form-validation>");
    file("src/main/java/sample/EditForm.java","package sample; class EditForm extends ActionForm { Object validate() { ActionErrors errors = new ActionErrors(); errors.add(\"name\",new ActionMessage(\"name.required\")); if (runtimeFlag) errors.add(\"conditional\",new ActionMessage(\"conditional.bad\")); return errors; } }");
    var graph=analyze();assertEquals(2,graph.validationRules().stream().filter(r->r.evidence().stream().anyMatch(e->e.detail().contains("STRUTS_VALIDATOR"))).count());
    assertTrue(graph.validationRules().stream().anyMatch(r->r.parameters().getOrDefault("minlength","").equals("2")));
    assertTrue(graph.validationRules().stream().anyMatch(r->r.fields().contains("name")&&r.evidence().stream().anyMatch(e->e.detail().contains("ACTION_FORM")&&e.resolution()==ResolutionStatus.INFERRED)));
    assertFalse(graph.validationRules().stream().anyMatch(r->r.fields().contains("conditional")));
  }
  @Test void recognizesStrutsControlKindsAndStableIdsAfterLineChanges() throws Exception {
    base();String markup="""
      <html:form action="/edit.do"><html:text property="name"/><html:password property="password"/><html:textarea property="notes"/><html:select property="choice"><html:options collection="choices"/></html:select><html:checkbox property="enabled"/><html:multibox property="flags"/><html:radio property="one"/><html:file property="upload"/><html:hidden property="hidden"/><html:button value="open"/><html:cancel/><html:reset/><html:submit property="op" value="save"/><html:link action="/edit.do">Edit</html:link></html:form>
      """;
    file("src/main/webapp/WEB-INF/jsp/home.jsp",markup);var first=analyze();
    Set<String> kinds=new TreeSet<>();first.nodes().stream().filter(n->n.type()==NodeType.COMPONENT).forEach(n->kinds.add(n.attributes().get("kind")));
    assertTrue(kinds.containsAll(List.of("FORM","TEXT_INPUT","TEXTAREA","SELECT","CHECKBOX","MULTI_SELECT","RADIO","FILE_INPUT","OTHER","BUTTON","SUBMIT","LINK")));
    file("src/main/webapp/WEB-INF/jsp/home.jsp","\n\n"+markup);file("unrelated.txt","unrelated change");var second=analyze();
    assertEquals(first.nodes().stream().filter(n->n.type()==NodeType.COMPONENT).map(GraphNode::id).toList(),second.nodes().stream().filter(n->n.type()==NodeType.COMPONENT).map(GraphNode::id).toList());
  }
  @Test void resolvesMappingAndLookupDispatchFamilies() throws Exception {
    base();file("src/main/java/sample/EditAction.java","package sample; class EditAction extends MappingDispatchAction { public ActionForward save(ActionMapping mapping, ActionForm form, HttpServletRequest request, HttpServletResponse response) { return mapping.findForward(\"ok\"); } }");
    var config=root.resolve("src/main/webapp/WEB-INF/struts-config.xml");Files.writeString(config,Files.readString(config).replace("parameter=\"op\"","parameter=\"save\""));
    assertTrue(analyze().nodes().stream().anyMatch(n->n.name().equals("sample.EditAction.save()")));
    Files.writeString(config,Files.readString(config).replace("parameter=\"save\"","parameter=\"op\""));
    file("src/main/java/sample/EditAction.java","package sample; class EditAction extends LookupDispatchAction { protected java.util.Map<String,String> getKeyMethodMap(){ map.put(\"button.save\",\"save\"); return map; } public ActionForward save(ActionMapping mapping, ActionForm form, HttpServletRequest request, HttpServletResponse response) {return mapping.findForward(\"ok\");} }");
    file("src/main/resources/Messages.properties","button.save=save\n");
    Files.writeString(config,Files.readString(config).replace("</struts-config>","<message-resources parameter=\"Messages\"/></struts-config>"));
    assertTrue(analyze().nodes().stream().anyMatch(n->n.name().equals("sample.EditAction.save()")));
  }
  @Test void reportsDuplicatesMissingConfigsAndUnknownValidatorRules() throws Exception {
    file("home.jsp","<html:form action=\"/missing\"/>");assertTrue(analyze().diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_CONFIG_MISSING")));
    base();file("src/main/webapp/WEB-INF/struts-config-other.xml","<struts-config><action-mappings><action path=\"/edit\" type=\"sample.Other\"/></action-mappings></struts-config>");
    assertTrue(analyze().diagnostics().stream().anyMatch(d->d.code().equals("DUPLICATE_ROUTE")));
    file("validation.xml","<form-validation><formset><form name=\"unknown\"><field property=\"x\" depends=\"unknownRule\"/></form></formset></form-validation>");
    assertTrue(analyze().validationRules().stream().anyMatch(r->r.evidence().get(0).resolution()==ResolutionStatus.UNRESOLVED));
  }
  @Test void expandsInheritedNestedTilesAndJspTileInsert() throws Exception {
    base();file("src/main/webapp/WEB-INF/jsp/layout.jsp","<tiles:insert definition=\"nested\"/><tiles:put name=\"body\" value=\"/WEB-INF/jsp/home.jsp\"/>");
    file("tiles-defs.xml","<tiles-definitions><definition name=\"base\" path=\"/WEB-INF/jsp/layout.jsp\"><put name=\"body\" value=\"/WEB-INF/jsp/home.jsp\"/></definition><definition name=\"child\" extends=\"base\"/><definition name=\"nested\" path=\"/WEB-INF/jsp/home.jsp\"/><definition name=\"outer\" extends=\"child\"><put-attribute name=\"nested\" value=\"nested\"/></definition></tiles-definitions>");
    var graph=analyze();assertTrue(graph.nodes().stream().anyMatch(n->n.name().equals("child")&&"/WEB-INF/jsp/layout.jsp".equals(n.attributes().get("view"))));
    assertTrue(graph.relationships().stream().anyMatch(e->e.type()==EdgeType.INCLUDES));assertDoesNotThrow(()->GraphIntegrityValidator.validate(graph));
  }
  @Test void resolvesInheritedDispatchWithoutUsingUnconfiguredResourceBundles() throws Exception {
    base();
    file("src/main/java/sample/EditAction.java","package sample; class EditAction extends BaseAction { }");
    file("src/main/java/sample/BaseAction.java","package sample; class BaseAction extends DispatchAction { public ActionForward save(ActionMapping mapping, ActionForm form, HttpServletRequest request, HttpServletResponse response) { return mapping.findForward(\"ok\"); } }");
    assertTrue(analyze().nodes().stream().anyMatch(n->n.name().equals("sample.EditAction.save()") && n.source().file().endsWith("BaseAction.java")));
    file("src/main/java/sample/EditAction.java","package sample; class EditAction extends LookupDispatchAction { protected java.util.Map<String,String> getKeyMethodMap(){map.put(\"button.save\",\"save\");return map;} public ActionForward save(ActionMapping mapping, ActionForm form, HttpServletRequest request, HttpServletResponse response){return null;} }");
    file("unrelated.properties","button.save=save");
    assertTrue(analyze().diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_DISPATCH_UNRESOLVED")));
  }
  @Test void scopesDispatchHiddenParametersToTheirOwnForms() throws Exception {
    base();
    file("src/main/webapp/WEB-INF/jsp/home.jsp","<html:form action=\"/edit.do\"><html:hidden property=\"op\" value=\"save\"/><html:submit value=\"Save\"/></html:form><html:form action=\"/edit.do\"><html:submit value=\"Unknown\"/></html:form>");
    var graph=analyze();
    assertTrue(graph.nodes().stream().anyMatch(n->n.name().equals("sample.EditAction.save()")));
    assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_DISPATCH_UNRESOLVED")));
  }
  @Test void keepsValidationIdsStableWhenUnrelatedRulesAreAdded() throws Exception {
    base();
    file("validation.xml","<form-validation><formset><form name=\"editForm\"><field property=\"name\" depends=\"required\"/></form></formset></form-validation>");
    String id=analyze().validationRules().stream().filter(r->r.fields().contains("name")).findFirst().orElseThrow().id();
    file("a/validation.xml","<form-validation><formset><form name=\"other\"><field property=\"other\" depends=\"custom\"/></form></formset></form-validation>");
    assertEquals(id,analyze().validationRules().stream().filter(r->r.fields().contains("name")).findFirst().orElseThrow().id());
  }
  @Test void respectsMultipleModulesDeclaredByWebXml() throws Exception {
    base();
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><init-param><param-name>config/admin</param-name><param-value>/WEB-INF/struts-config-admin.xml</param-value></init-param></servlet></web-app>");
    file("src/main/webapp/WEB-INF/struts-config-admin.xml","<struts-config><action-mappings><action path=\"/edit\" type=\"sample.AdminAction\"/></action-mappings></struts-config>");
    assertTrue(analyze().nodes().stream().anyMatch(n->n.name().equals("ANY /admin/edit.do")));
    assertFalse(analyze().diagnostics().stream().anyMatch(d->d.code().equals("DUPLICATE_ROUTE")));
  }
  @Test void deterministicReadOnlyAnalysisIgnoresScanOrderAndNeverExecutesJava() throws Exception {
    base();
    file("src/main/java/sample/Probe.java","package sample; class Probe {static { throw new RuntimeException(\"must not execute\"); }}");
    var inventory=new ProjectScanner().scan(root);
    Map<Path,String> contents=new TreeMap<>();for(Path path:inventory.files()) contents.put(path,Files.readString(path));
    var reversed=new ArrayList<>(inventory.files());Collections.reverse(reversed);
    var json=new com.fasterxml.jackson.databind.ObjectMapper();
    assertEquals(json.writeValueAsString(analyze()),json.writeValueAsString(new StrutsProjectAnalyzer().analyze(new ProjectScanner.ProjectInventory(inventory.root(),reversed,inventory.technologies()))));
    for(var entry:contents.entrySet()) assertEquals(entry.getValue(),Files.readString(entry.getKey()));
  }
  @Test void frameworkDetectionIgnoresCommentsAndStringMentions() throws Exception {
    base();file("src/main/java/sample/Notes.java","package sample; // org.apache.struts2.ActionSupport\n class Notes {String text=\"org.apache.struts2.Foo\";}");
    assertFalse(analyze().nodes().isEmpty());
    assertFalse(analyze().diagnostics().stream().anyMatch(d->d.code().equals("UNSUPPORTED_FRAMEWORK")));
  }
  @Test void doesNotConfirmAnExecuteMethodAbsentFromSource() throws Exception {
    base();file("struts-config-missing-class.xml","<struts-config><action-mappings><action path=\"/missing\" type=\"sample.MissingAction\"/></action-mappings></struts-config>");
    assertEquals(Confidence.INFERRED,analyze().nodes().stream().filter(n->n.name().equals("sample.MissingAction.execute()")).findFirst().orElseThrow().confidence());
  }
}
