package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.core.StableGraphIds;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class StrutsR16ValidationDispatchTest {
  @TempDir Path root;

  private void file(String path, String text) throws Exception {
    Path target=root.resolve(path);Files.createDirectories(target.getParent());Files.writeString(target,text);
  }

  private ApplicationGraph analyze() throws Exception {
    return new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  private void base(String config) throws Exception {
    file("src/main/webapp/WEB-INF/web.xml","<web-app><servlet><servlet-name>action</servlet-name><servlet-class>org.apache.struts.action.ActionServlet</servlet-class><init-param><param-name>config</param-name><param-value>/WEB-INF/struts-config.xml</param-value></init-param></servlet><servlet-mapping><servlet-name>action</servlet-name><url-pattern>*.do</url-pattern></servlet-mapping></web-app>");
    file("src/main/webapp/WEB-INF/struts-config.xml",config);
  }

  @Test void validatorFieldsResolveToComponentsOnTheFormScreen() throws Exception {
    base("<struts-config><form-beans><form-bean name='LogonForm' type='sample.LogonForm'/></form-beans><action-mappings><action path='/logon' type='sample.LogonAction' name='LogonForm' input='/logon.jsp'/></action-mappings><message-resources parameter='Messages'/></struts-config>");
    file("src/main/java/sample/LogonForm.java","package sample; public class LogonForm extends org.apache.struts.validator.ValidatorForm { public String getUsername(){return null;} public String getPassword(){return null;} }");
    file("src/main/webapp/WEB-INF/validator-rules.xml","<validator-rules><validator name='required' classname='Required'/><validator name='minlength' classname='Min'/><validator name='maxlength' classname='Max'/></validator-rules>");
    file("src/main/webapp/WEB-INF/validation.xml","<form-validation><formset><form name='LogonForm'><field property='username' depends='required'><msg name='required' key='logon.username.required'/></field><field property='password' depends='required,minlength,maxlength'><msg name='required' key='logon.password.required'/><msg name='minlength' key='logon.password.min'/><msg name='maxlength' key='logon.password.max'/></field></form></formset></form-validation>");
    file("src/main/webapp/WEB-INF/classes/Messages.properties","logon.username.required=Username is required\nlogon.password.required=Password is required\nlogon.password.min=Password is too short\nlogon.password.max=Password is too long\n");
    file("src/main/webapp/logon.jsp","<html:form action='/logon'><html:text property='username'/><html:password property='password'/><html:submit value='Logon'/></html:form>");

    ApplicationGraph graph=analyze();
    Set<String> components=new HashSet<>();
    graph.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&Set.of("username","password").stream().anyMatch(value->value.equals(n.attributes().get("property")))).forEach(n->components.add(n.id()));
    List<ValidationRule> passwordRules=graph.validationRules().stream().filter(rule->rule.fields().contains("password")&&rule.layer()==ValidationLayer.SERVER).toList();
    assertEquals(Set.of("required","minlength","maxlength"),passwordRules.stream().map(ValidationRule::kind).collect(java.util.stream.Collectors.toSet()));
    assertTrue(passwordRules.stream().allMatch(rule->components.stream().anyMatch(id->rule.parameters().getOrDefault("componentIds","").contains(id))),passwordRules.toString());
    assertTrue(passwordRules.stream().allMatch(rule->rule.parameters().getOrDefault("screenIds","").contains(StableGraphIds.screen("src/main/webapp/logon.jsp"))),passwordRules.toString());
    ValidationRule username=graph.validationRules().stream().filter(rule->rule.fields().contains("username")&&rule.layer()==ValidationLayer.SERVER).findFirst().orElseThrow();
    assertTrue(username.parameters().getOrDefault("componentIds","").contains(graph.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&"username".equals(n.attributes().get("property"))).findFirst().orElseThrow().id()));
  }

  @Test void eventDispatchActionSubmitValueSelectsItsDeclaredMethod() throws Exception {
    base("<struts-config><action-mappings><action path='/events' type='sample.EventAction' parameter='event'/></action-mappings></struts-config>");
    file("src/main/java/sample/EventAction.java","package sample; public class EventAction extends org.apache.struts.actions.EventDispatchAction { public org.apache.struts.action.ActionForward add(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} public org.apache.struts.action.ActionForward remove(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} }");
    file("src/main/webapp/events.jsp","<html:form action='/events'><html:submit property='event' value='add'>Add</html:submit><html:submit property='event' value='remove'>Remove</html:submit></html:form>");

    ApplicationGraph graph=analyze();
    Set<String> dispatchHandlers=graph.nodes().stream().filter(n->n.type()==NodeType.HANDLER&&n.attributes().containsKey("method")).map(n->n.attributes().get("method")).collect(java.util.stream.Collectors.toSet());
    assertEquals(Set.of("add","remove"),dispatchHandlers);
    assertTrue(graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&n.attributes().containsKey("parameterValue")).map(n->n.attributes().get("parameterValue")).collect(java.util.stream.Collectors.toSet()).containsAll(Set.of("add","remove")));
  }

  @Test void dispatchActionReadsOrdinaryHtmlHiddenInputsAndReportsMissingMethod() throws Exception {
    base("<struts-config><action-mappings><action path='/dispatch' type='sample.Dispatch' parameter='dispatchMethod'/></action-mappings></struts-config>");
    file("src/main/java/sample/Dispatch.java","package sample; public class Dispatch extends org.apache.struts.actions.DispatchAction { public org.apache.struts.action.ActionForward doFoo(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} public org.apache.struts.action.ActionForward doBar(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} public org.apache.struts.action.ActionForward execute(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} }");
    file("src/main/webapp/dispatch.jsp","<form action='/dispatch'><input type='hidden' name='dispatchMethod' value='doFoo'><input type='submit' value='Foo'></form><form action='/dispatch'><input type='hidden' name='dispatchMethod' value='doBar'><input type='submit' value='Bar'></form><form action='/dispatch'><input type='hidden' name='dispatchMethod' value='doInvalid'><input type='submit' value='Invalid'></form><form action='/dispatch'><input type='hidden' name='dispatchMethod' value='execute'><input type='submit' value='Execute'></form>");

    ApplicationGraph graph=analyze();
    Set<String> methods=graph.nodes().stream().filter(n->n.type()==NodeType.HANDLER&&n.attributes().containsKey("method")).map(n->n.attributes().get("method")).collect(java.util.stream.Collectors.toSet());
    assertEquals(Set.of("doFoo","doBar","execute"),methods);
    List<Behavior> submits=graph.behaviors().stream().filter(b->b.type()==BehaviorType.SUBMIT_FORM&&b.expression()!=null&&b.expression().contains("/dispatch")).toList();
    assertTrue(submits.stream().anyMatch(b->Objects.toString(b.expression(),"").contains("doFoo")),submits.toString());
    assertTrue(submits.stream().anyMatch(b->Objects.toString(b.expression(),"").contains("doBar")),submits.toString());
    assertTrue(submits.stream().anyMatch(b->Objects.toString(b.expression(),"").contains("doInvalid")&&Objects.toString(b.expression(),"").contains("找不到此方法")),submits.toString());
    assertTrue(submits.stream().anyMatch(b->Objects.toString(b.expression(),"").contains("execute")),submits.toString());
  }

  @Test void dispatchActionKeepsEveryOrdinaryHtmlParameterCandidateAmbiguous() throws Exception {
    base("<struts-config><action-mappings><action path='/dispatch' type='sample.Dispatch' parameter='dispatchMethod'/></action-mappings></struts-config>");
    file("src/main/java/sample/Dispatch.java","package sample; public class Dispatch extends org.apache.struts.actions.DispatchAction { public org.apache.struts.action.ActionForward doFoo(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} public org.apache.struts.action.ActionForward doBar(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} }");
    file("src/main/webapp/dispatch.jsp","<form action='/dispatch'><input type='hidden' name='dispatchMethod' value='doFoo'><input type='hidden' name='dispatchMethod' value='doBar'><input type='submit' value='Run'></form>");

    ApplicationGraph graph=analyze();
    Behavior submit=graph.behaviors().stream().filter(b->b.type()==BehaviorType.SUBMIT_FORM&&b.expression()!=null&&b.expression().contains("/dispatch")).findFirst().orElseThrow();
    assertTrue(submit.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.AMBIGUOUS&&Objects.toString(e.detail(),"").contains("doFoo")&&e.detail().contains("doBar")),submit.toString());
    assertTrue(graph.diagnostics().stream().anyMatch(d->d.code().equals("STRUTS_DISPATCH_AMBIGUOUS")&&d.message().contains("doFoo")&&d.message().contains("doBar")));
  }

  @Test void dispatchActionCollectsNamedButtonAndSelectOptionValuesAsAmbiguousCandidates() throws Exception {
    base("<struts-config><action-mappings><action path='/dispatch' type='sample.Dispatch' parameter='dispatchMethod'/></action-mappings></struts-config>");
    file("src/main/java/sample/Dispatch.java","package sample; public class Dispatch extends org.apache.struts.actions.DispatchAction { public org.apache.struts.action.ActionForward doFoo(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} public org.apache.struts.action.ActionForward doBar(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} public org.apache.struts.action.ActionForward doInvalid(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} public org.apache.struts.action.ActionForward execute(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} }");
    file("src/main/webapp/dispatch.jsp","<form action='/dispatch'><input type='hidden' name='dispatchMethod' value='hiddenValue'><input type='submit' name='dispatchMethod' value='submitValue'><input type='image' name='dispatchMethod' value='imageValue'><input type='radio' name='dispatchMethod' value='radioValue'><button name='dispatchMethod' value='buttonValue'>Run</button><select name='dispatchMethod'><option value='selectValue'>Select</option></select></form>");
    ApplicationGraph graph=analyze();
    Diagnostic ambiguous=graph.diagnostics().stream().filter(item->item.code().equals("STRUTS_DISPATCH_AMBIGUOUS")).findFirst().orElseThrow();
    List<String> candidates=List.of("hiddenValue","submitValue","imageValue","radioValue","buttonValue","selectValue");
    for(String candidate:candidates)assertTrue(ambiguous.message().contains(candidate),ambiguous.message());
    Behavior submit=graph.behaviors().stream().filter(item->item.type()==BehaviorType.SUBMIT_FORM&&item.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.AMBIGUOUS)).findFirst().orElseThrow();
    for(String candidate:candidates)assertTrue(submit.expression().contains(candidate),submit.toString());
  }

  @Test void resolvedDispatchLinkDoesNotDuplicateMarkupBehavior() throws Exception {
    base("<struts-config><action-mappings><action path='/dispatch' type='sample.Dispatch' parameter='dispatchMethod'/></action-mappings></struts-config>");
    file("src/main/java/sample/Dispatch.java","package sample; public class Dispatch extends org.apache.struts.actions.DispatchAction { public org.apache.struts.action.ActionForward doFoo(org.apache.struts.action.ActionMapping m, org.apache.struts.action.ActionForm f, javax.servlet.http.HttpServletRequest q, javax.servlet.http.HttpServletResponse s){return null;} }");
    file("src/main/webapp/dispatch.jsp","<html:form action='/dispatch'><html:submit property='dispatchMethod' value='doFoo'/><html:link action='/dispatch?dispatchMethod=doFoo'>Run</html:link></html:form>");
    ApplicationGraph graph=analyze();
    GraphNode link=graph.nodes().stream().filter(node->node.type()==NodeType.COMPONENT&&"LINK".equals(node.attributes().get("kind"))&&node.source().file().endsWith("dispatch.jsp")).findFirst().orElseThrow();
    List<Behavior> behaviors=graph.behaviors().stream().filter(item->item.triggerId().equals(link.id())&&item.type()==BehaviorType.NAVIGATE).toList();
    assertEquals(1,behaviors.size(),behaviors.toString());
    assertTrue(behaviors.get(0).targetId()!=null,behaviors.toString());
    assertTrue(behaviors.get(0).expression().contains("doFoo"),behaviors.toString());
  }

  @Test void wildcardInheritedNameIsSubstitutedBeforeValidatorFieldBinding() throws Exception {
    base("<struts-config><form-beans><form-bean name='RegistrationForm' type='sample.RegistrationForm'/></form-beans><action-mappings><action path='//BaseAction' type='sample.BaseAction' name='{1}Form'/><action path='/Save*' type='sample.SaveAction' extends='//BaseAction' input='/registration.jsp'/></action-mappings></struts-config>");
    file("src/main/java/sample/RegistrationForm.java","package sample; public class RegistrationForm extends org.apache.struts.validator.ValidatorForm { public String getUsername(){return null;} }");
    file("src/main/webapp/WEB-INF/validator-rules.xml","<validator-rules><validator name='required' classname='Required'/></validator-rules>");
    file("src/main/webapp/WEB-INF/validation.xml","<form-validation><formset><form name='RegistrationForm'><field property='username' depends='required'/></form></formset></form-validation>");
    file("src/main/webapp/registration.jsp","<html:form action='/SaveRegistration'><html:text property='username'/><html:submit value='Save'/></html:form>");

    ApplicationGraph graph=analyze();
    ValidationRule rule=graph.validationRules().stream().filter(item->item.parameters().getOrDefault("form","").equals("RegistrationForm")&&item.fields().contains("username")).findFirst().orElseThrow();
    assertEquals(ResolutionStatus.CONFIRMED,rule.evidence().stream().filter(e->e.parser().equals("StrutsValidatorFieldBinding")).map(AnalysisEvidence::resolution).findFirst().orElse(null),rule.toString());
    assertTrue(rule.parameters().getOrDefault("screenIds","").contains(StableGraphIds.screen("src/main/webapp/registration.jsp")),rule.toString());
    assertTrue(rule.parameters().getOrDefault("componentIds","").contains(graph.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&"username".equals(n.attributes().get("property"))).findFirst().orElseThrow().id()),rule.toString());
  }
}
