package io.screentrace.adapter.spring;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import org.junit.jupiter.api.Test;
class Batch4SubmittedModelTest {
 @Test void directBoundFieldsRetainInputEvidenceWithoutGuessingNestedOrCalculatedData()throws Exception {
  Path r=Files.createTempDirectory("batch4-submitted");Path view=r.resolve("src/main/resources/templates/complete.html");Files.createDirectories(view.getParent());Files.writeString(view,"<span th:text=\"${#temporals.format(record.date, 'dd-MM-yyyy')}\">Sample</span>");
  Files.writeString(r.resolve("C.java"),"@Controller class C { @PostMapping(\"/send\") String send(@ModelAttribute Record record, Model model){model.addAttribute(\"record\",record);return \"complete\";} } class Record { private LocalDate date; private Other relation; private double price; public void setDate(LocalDate date){this.date=date;} public LocalDate getDate(){return date;} private String appended, privateValue, transformed; public void setAppended(String appended){this.appended+=appended;} public String getAppended(){return appended;} private void setPrivateValue(String privateValue){this.privateValue=privateValue;} public String getPrivateValue(){return privateValue;} public void setTransformed(String transformed){this.transformed=transformed;} public String getTransformed(){return \"constant\";} }");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));var proof=g.relationships().stream().filter(e->e.type()==EdgeType.RENDERS).flatMap(e->e.evidence().stream()).filter(e->e.parser().equals("SpringSubmittedModel")&&e.detail().startsWith("{")).findFirst().orElseThrow();
  assertEquals("{\"fields\":{\"record.date\":\"date\"},\"scope\":\"submitted-binding-demo\",\"version\":1}",proof.detail());assertFalse(proof.detail().contains("relation"));assertFalse(proof.detail().contains("price"));assertTrue(proof.source().file().endsWith("C.java"));
 }
 @Test void modelParameterFeedbackIsScopedToItsReturnBranch()throws Exception {
  Path r=Files.createTempDirectory("batch4-feedback");Files.writeString(r.resolve("C.java"),"@Controller class C { @PostMapping(\"/login\") String login(Model model){if(valid)return \"home\";else{model.addAttribute(\"error\",\"Denied\");return \"login\";}} }");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));for(var edge:g.relationships())if(edge.type()==EdgeType.RENDERS){var screen=g.nodes().stream().filter(n->n.id().equals(edge.to())).findFirst().orElseThrow();assertEquals(screen.attributes().get("view").equals("login"),edge.evidence().stream().anyMatch(e->e.parser().equals("SpringModelFeedback")));}
 }
}
