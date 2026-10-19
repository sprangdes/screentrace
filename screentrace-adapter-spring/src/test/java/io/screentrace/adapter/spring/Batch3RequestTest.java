package io.screentrace.adapter.spring;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import io.screentrace.scanner.ProjectScanner;
import io.screentrace.core.ApplicationGraph.*;
class Batch3RequestTest {
 private void write(Path root,String file,String text)throws Exception{var p=root.resolve(file);Files.createDirectories(p.getParent());Files.writeString(p,text);}
 @Test void relativeApiUsesTheUniqueRequestDirectoryAndNeverChoosesBetweenDirectories()throws Exception{
  for(boolean ambiguous:new boolean[]{false,true}){
   var r=Files.createTempDirectory("batch3-request");write(r,"src/main/webapp/WEB-INF/jsp/list.jsp","<button onclick=\"fetch('search')\">Search</button>");
   write(r,"C.java","@Controller class C { @GetMapping("+(ambiguous?"{\"/a/list\",\"/b/list\"}":"\"/inventory\"")+") String list(){return \"list\";} @ResponseBody @GetMapping(\"/search\") String search(){return \"response\";} }");
   var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));var api=g.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT&&"/search".equals(n.attributes().get("path"))).findFirst().orElseThrow();
   var calls=g.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API).toList();assertFalse(calls.isEmpty());assertEquals(!ambiguous,calls.stream().anyMatch(b->api.id().equals(b.targetId())));
   if(!ambiguous)assertTrue(calls.stream().anyMatch(b->b.evidence().stream().anyMatch(e->e.parser().equals("RelativeRequestPath")&&e.resolution()==ResolutionStatus.INFERRED)));
  }
 }
 @Test void partialReturnsStayUnknownAndSameLineBranchesKeepTheirEvidence()throws Exception{
  var r=Files.createTempDirectory("batch3-partial");write(r,"src/main/webapp/WEB-INF/jsp/home.jsp","<p>Home</p>");
  write(r,"C.java","@Controller class C { @GetMapping(\"/partial\") Object partial(){ModelAndView m;if(flag)m=new ModelAndView(\"home\");else m=external();return m;} @GetMapping(\"/same\") Object same(){ModelAndView m;if(flag)m=new ModelAndView(\"home\");else m=new ModelAndView(\"home\");return m;} }");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));var partial=g.nodes().stream().filter(n->n.type()==NodeType.HANDLER&&"partial".equals(n.attributes().get("method"))).findFirst().orElseThrow();assertEquals("1",partial.attributes().get("unresolvedReturnCount"));assertTrue(partial.evidence().stream().anyMatch(e->e.resolution()==ResolutionStatus.UNRESOLVED));
  var same=g.nodes().stream().filter(n->n.type()==NodeType.HANDLER&&"same".equals(n.attributes().get("method"))).findFirst().orElseThrow();assertEquals(2,g.relationships().stream().filter(e->e.type()==EdgeType.RENDERS&&e.from().equals(same.id())).count());
 }
 @Test void htmlWindowTargetOnModalTriggerDoesNotBecomeNavigation()throws Exception{
  var r=Files.createTempDirectory("batch3-modal");write(r,"src/main/webapp/WEB-INF/jsp/list.jsp","<a target=\"_blank\" data-toggle=\"modal\" data-target=\"#edit\">Edit</a><div class=\"modal\" id=\"edit\">Form</div>");write(r,"C.java","@Controller class C { @GetMapping(\"/\") String list(){return \"list\";} }");
  var g=new SpringMvcAnalyzer().analyze(new ProjectScanner().scan(r));var trigger=g.nodes().stream().filter(n->n.type()==NodeType.COMPONENT&&"a".equals(n.attributes().get("tag"))).findFirst().orElseThrow();
  assertEquals("_blank",trigger.attributes().get("htmlTarget"));assertTrue(g.behaviors().stream().anyMatch(b->b.triggerId().equals(trigger.id())&&b.type()==BehaviorType.OPEN_DIALOG));assertFalse(g.behaviors().stream().anyMatch(b->b.triggerId().equals(trigger.id())&&b.type()==BehaviorType.NAVIGATE));
 }
}
