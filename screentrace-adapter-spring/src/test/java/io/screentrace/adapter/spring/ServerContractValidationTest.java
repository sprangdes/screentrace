package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class ServerContractValidationTest {
 @TempDir Path root;
 void source(String name,String text) throws Exception {Files.writeString(root.resolve(name),text);}
 ApplicationGraph analyze(boolean boot) throws Exception {var inventory=new ProjectScanner().scan(root);return boot?new SpringBootAnalyzer().analyze(inventory):new SpringMvcAnalyzer().analyze(inventory);}
 GraphNode endpoint(ApplicationGraph g,String path){return g.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&path.equals(n.attributes().get("path"))).findFirst().orElseThrow();}
 @Test void responseBodyAndResponseEntityEndpointsHaveContractsWithoutScreens() throws Exception {
  source("Api.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;import org.springframework.http.*;@Controller class Api {@GetMapping(value=\"/text\",produces=\"text/plain\") @ResponseBody String text(){return \"hello\";}@PostMapping(value=\"/dto\",consumes=\"application/json\") ResponseEntity<Reply> dto(@RequestBody Input body){return null;}} class Input {String email;}class Reply{long id;}");
  for(boolean boot:List.of(false,true)){var g=analyze(boot);assertTrue(g.nodes().stream().noneMatch(n->n.type()==NodeType.SCREEN));for(String path:List.of("/text","/dto")){var ep=endpoint(g,path);assertEquals("REST_API",ep.attributes().get("category"));var c=g.apiContracts().stream().filter(x->x.endpointId().equals(ep.id())).findFirst().orElseThrow();if(path.equals("/text"))assertEquals("String",c.responses().get(0).bodyType());else{assertEquals("application/json",c.request().contentType());assertTrue(c.request().fields().stream().anyMatch(f->f.name().equals("email")));assertTrue(c.responses().get(0).fields().stream().anyMatch(f->f.name().equals("id")));}}}
 }
 @Test void javaxAndJakartaConstraintsAreServerRulesLinkedToEndpoints() throws Exception {
  source("Api.java","import org.springframework.web.bind.annotation.*;import javax.validation.Valid;import org.springframework.validation.annotation.Validated;@RestController class Api{@PostMapping(\"/one\") Reply one(@Valid @RequestBody Legacy input){return null;}@PostMapping(\"/two\") Reply two(@Validated @RequestBody Modern input){return null;}}class Reply{long id;}");
  source("Legacy.java","import javax.validation.constraints.*;class Legacy{@NotNull(message=\"required\") String name;@Size(min=2,max=20) String code;@Min(1) int age;}");source("Modern.java","import jakarta.validation.constraints.*;class Modern{@Email String email;@Pattern(regexp=\"[A-Z]+\") String key;@NotBlank String text;@Max(99) int age;}");
  for(boolean boot:List.of(false,true)){var g=analyze(boot);assertEquals(7,g.validationRules().stream().filter(r->r.layer()==ValidationLayer.SERVER).count());for(String path:List.of("/one","/two")){var ep=endpoint(g,path);assertNotNull(ep.attributes().get("validationRuleIds"));assertTrue(g.validationRules().stream().anyMatch(r->r.parameters().getOrDefault("endpointIds","").contains(ep.id())));}assertTrue(g.validationRules().stream().allMatch(r->r.evidence().stream().anyMatch(e->e.detail().contains("Bean Validation"))));}
 }
 @Test void constraintsDoNotActivateWithoutValidationAndSameNamedAnnotationsDoNotGuess() throws Exception {
  source("Api.java","import org.springframework.web.bind.annotation.*;@RestController class Api{@PostMapping(\"/plain\") String plain(@RequestBody Input input){return null;}}class Input{@jakarta.validation.constraints.NotNull String name;}");assertTrue(analyze(false).validationRules().isEmpty());
  source("Api.java","import org.springframework.web.bind.annotation.*;@RestController class Api{@PostMapping(\"/fake\") String fake(@com.example.Valid @RequestBody Input input){return null;}}class Input{@com.example.NotNull String name;}");assertTrue(analyze(false).validationRules().isEmpty());
 }
 @Test void inheritedGetterRecordAndCascadeConstraintsHaveSourceEvidence() throws Exception {
  source("Api.java","import org.springframework.web.bind.annotation.*;import jakarta.validation.Valid;@RestController class Api{@PostMapping(\"/nested\") String nested(@Valid @RequestBody Child child){return null;}@PostMapping(\"/record\") String record(@Valid @RequestBody RecordInput child){return null;}}");
  source("Input.java","import jakarta.validation.Valid;import jakarta.validation.constraints.*;class Parent{@NotNull String inherited;}class Child extends Parent{@Valid Nested nested;@Email public String getEmail(){return null;}}class Nested{@NotBlank String city;}record RecordInput(@NotNull String key){}");
  var g=analyze(false);for(String field:List.of("inherited","email","nested.city","key"))assertTrue(g.validationRules().stream().anyMatch(r->r.fields().contains(field)),field);assertTrue(g.validationRules().stream().allMatch(r->r.evidence().stream().anyMatch(e->e.source().file().equals("Input.java"))));
 }
 @Test void initBinderCustomValidatorPreservesConditionMessageAndFieldEndpointLinks() throws Exception {
  source("Controller.java","import org.springframework.stereotype.*;import org.springframework.web.bind.annotation.*;import org.springframework.web.bind.*;@Controller class Controller{@InitBinder(\"input\") void binder(WebDataBinder binder){binder.addValidators(new InputValidator());}@PostMapping(\"/save\") String save(@ModelAttribute(\"input\") Input input){return \"page\";}}class Input{String email;}");
  source("InputValidator.java","import org.springframework.validation.*;class InputValidator implements Validator{public boolean supports(Class<?> type){return Input.class.equals(type);}public void validate(Object input,Errors errors){if(input==null){errors.rejectValue(\"email\",\"email.invalid\",\"Invalid email\");}}}");
  source("page.jsp","<form:form modelAttribute='input' action='/save' method='post'><form:input path='email'/></form:form>");var g=analyze(false);var ep=endpoint(g,"/save");var rule=g.validationRules().stream().filter(r->r.layer()==ValidationLayer.SERVER&&r.kind().equals("custom")).findFirst().orElseThrow();assertEquals("Invalid email",rule.message());assertTrue(rule.parameters().get("endpointIds").contains(ep.id()));assertTrue(rule.parameters().get("condition").contains("input == null"));assertTrue(rule.evidence().stream().anyMatch(e->e.detail().contains("@InitBinder")));assertTrue(rule.evidence().stream().anyMatch(e->e.detail().contains("Validator")));assertTrue(rule.fields().stream().anyMatch(id->g.nodes().stream().anyMatch(n->n.id().equals(id)&&"email".equals(n.attributes().get("field")))));
 }
 @Test void cyclicCascadesStopAndRetainDiagnostics() throws Exception {
  source("Api.java","import org.springframework.web.bind.annotation.*;import jakarta.validation.Valid;@RestController class Api{@PostMapping(\"/cycle\") String save(@Valid @RequestBody Input input){return null;}}class Input{@jakarta.validation.constraints.NotNull String name;@Valid Input next;}");var g=analyze(false);assertTrue(g.validationRules().stream().anyMatch(r->r.fields().contains("name")));assertTrue(g.diagnostics().stream().anyMatch(d->d.code().equals("SERVER_VALIDATION_CYCLE")));
 }
 @Test void rulesHaveStableIdsAcrossLineChangesAndDeterministicRepeatedAnalysis() throws Exception {
  String source="import org.springframework.web.bind.annotation.*;import jakarta.validation.Valid;@RestController class Api{@PostMapping(\"/api\") String save(@Valid @RequestBody Input input){return null;}}class Input{@jakarta.validation.constraints.NotNull String name;}";source("Api.java",source);var one=analyze(false);assertFalse(one.validationRules().isEmpty());assertEquals(one,analyze(false));source("Api.java","\n\n"+source);assertEquals(one.validationRules().stream().map(ValidationRule::id).toList(),analyze(false).validationRules().stream().map(ValidationRule::id).toList());
 }
 @Test void ambiguousDtoDefinitionsAreAllRetainedAndNeverChosen() throws Exception {
  source("Api.java","import org.springframework.web.bind.annotation.*;@RestController class Api{@PostMapping(\"/ambiguous\") String api(@RequestBody Input input){return null;}}");source("One.java","package one;class Input{String a;}");source("Two.java","package two;class Input{long b;}");var g=analyze(false);var ep=endpoint(g,"/ambiguous");var c=g.apiContracts().stream().filter(x->x.endpointId().equals(ep.id())).findFirst().orElseThrow();assertEquals(Confidence.AMBIGUOUS,c.confidence());assertTrue(c.request().fields().stream().anyMatch(f->f.name().equals("a")));assertTrue(c.request().fields().stream().anyMatch(f->f.name().equals("b")));
 }
 @Test void explicitDtoImportResolvesOnlyItsDeclaredType() throws Exception {
  source("Api.java","import org.springframework.web.bind.annotation.*;import one.Input;@RestController class Api{@PostMapping(\"/imported\") String api(@RequestBody Input input){return null;}}");source("One.java","package one;class Input{String a;}");source("Two.java","package two;class Input{long b;}");var g=analyze(false);var ep=endpoint(g,"/imported");var c=g.apiContracts().stream().filter(x->x.endpointId().equals(ep.id())).findFirst().orElseThrow();assertTrue(c.request().fields().stream().anyMatch(f->f.name().equals("a")));assertFalse(c.request().fields().stream().anyMatch(f->f.name().equals("b")));
 }
 @Test void unsupportedValidationGroupsAndDynamicConstraintValuesStayUnresolved() throws Exception {
  source("Api.java","import org.springframework.web.bind.annotation.*;import org.springframework.validation.annotation.Validated;@RestController class Api{@PostMapping(\"/groups\") String api(@Validated(Group.class) @RequestBody Input input){return null;}}class Group{}class Input{@jakarta.validation.constraints.NotNull(message=UNKNOWN_MESSAGE) String name;}");var g=analyze(false);assertFalse(g.validationRules().isEmpty());assertTrue(g.validationRules().stream().allMatch(r->r.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.UNRESOLVED)));assertTrue(g.validationRules().stream().allMatch(r->r.message()==null));
 }
}
