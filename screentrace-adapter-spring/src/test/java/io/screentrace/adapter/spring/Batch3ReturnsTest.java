package io.screentrace.adapter.spring;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.parser.jsp.JavaSources;
import java.util.*;
class Batch3ReturnsTest {
 @Test void assignmentsInExclusiveBranchesKeepAllPossibleViewsAndGuards(){
  var m=JavaSources.parse("class C { Object go(){ ModelAndView m; if(logged){m=new ModelAndView(\"home\");}else{m=new ModelAndView(\"redirect:/login\");} return m; }}").findAll(com.github.javaparser.ast.body.MethodDeclaration.class).get(0);
  var ts=SpringControllerReturns.extract(m,"C.java","C",Map.of());
  assertEquals(Set.of("home","/login"),new HashSet<>(ts.stream().map(SpringControllerReturns.Target::value).toList()));
  assertTrue(ts.stream().allMatch(t->t.evidence().stream().anyMatch(e->e.detail().contains("logged"))));
 }
 @Test void feedbackIncludesOnlyConstantValuesProvenBeforeTheReturn(){
  var m=JavaSources.parse("class C { Object go(){ ModelAndView m=new ModelAndView(\"form\"); if(bad){m.addObject(\"error\",\"Mismatch\");return m;} String done=\"Saved\";m.addObject(\"success\",done);return m; }}").findAll(com.github.javaparser.ast.body.MethodDeclaration.class).get(0);
  var ts=SpringControllerReturns.extract(m,"C.java","C",Map.of());assertTrue(ts.get(0).evidence().stream().anyMatch(e->e.parser().equals("SpringModelFeedback")&&e.detail().contains("Mismatch")));assertTrue(ts.get(1).evidence().stream().anyMatch(e->e.parser().equals("SpringModelFeedback")&&e.detail().contains("Saved")));assertFalse(ts.get(1).evidence().stream().anyMatch(e->e.parser().equals("SpringModelFeedback")&&e.detail().contains("Mismatch")));
 }
 @Test void unknownAndEscapingAssignmentsAreNotPromoted(){
  for(String body:List.of("ModelAndView m; if(flag)m=new ModelAndView(\"home\"); return m;", "ModelAndView m; if(flag)m=new ModelAndView(\"home\");else m=external();return m;", "ModelAndView m; if(flag)m=new ModelAndView(\"home\");else m=new ModelAndView(\"login\"); mutate(m);return m;")){
   var m=JavaSources.parse("class C { Object go(){"+body+"}}").findAll(com.github.javaparser.ast.body.MethodDeclaration.class).get(0);
   assertTrue(SpringControllerReturns.extract(m,"C.java","C",Map.of()).stream().anyMatch(t->t.kind()==SpringControllerReturns.Kind.UNKNOWN));
  }
 }
}
