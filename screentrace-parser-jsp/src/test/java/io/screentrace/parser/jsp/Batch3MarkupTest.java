package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import java.nio.file.*;
import io.screentrace.scanner.ProjectScanner;
class Batch3MarkupTest {
 private void write(Path root,String file,String text)throws Exception{var p=root.resolve(file);Files.createDirectories(p.getParent());Files.writeString(p,text);}
 @Test void importOnlyHostInheritsItsFragmentActions()throws Exception{
  var r=Files.createTempDirectory("batch3-import");write(r,"src/main/webapp/main.jsp","<c:import url=\"fragment.jsp\"/>");write(r,"src/main/webapp/fragment.jsp","<a href=\"/next\">Next</a>");
  var i=new ProjectScanner().scan(r);var j=new JspProjectParser().analyze(i.root(),i.files());assertTrue(j.interactions().stream().anyMatch(x->x.viewPath().endsWith("main.jsp")&&x.source().file().endsWith("fragment.jsp")&&x.target().equals("/next")));
 }
 @Test void explicitWebRootExcludesStaleCopiesAndRelativeScriptRetainsInference()throws Exception{
  var r=Files.createTempDirectory("batch3-root");write(r,"nbproject/project.properties","web.docbase.dir=web\n");write(r,"web/WEB-INF/jsp/footer.jsp","<script src=\"resources/app.js\"></script>");write(r,"web/resources/app.js","fetch('/api');");write(r,"WebRoot/index.jsp","<a href=\"/stale\">Stale</a>");
  var i=new ProjectScanner().scan(r);assertFalse(i.files().stream().anyMatch(f->f.toString().contains("WebRoot")));var result=ScriptSources.collect(i);assertEquals(1,result.scripts().size());assertEquals("INFERRED",result.scripts().get(0).status());assertEquals("web/resources/app.js",result.scripts().get(0).file());
 }
 @Test void relativeScriptWithTwoRootsRemainsAmbiguous()throws Exception{
  var r=Files.createTempDirectory("batch3-ambiguous");write(r,"web/footer.jsp","<script src=\"resources/app.js\"></script>");write(r,"web/resources/app.js","fetch('/one');");write(r,"WebContent/resources/app.js","fetch('/two');");var result=ScriptSources.collect(new ProjectScanner().scan(r));assertTrue(result.scripts().isEmpty());assertEquals("AMBIGUOUS",result.references().get(0).status());
 }
 @Test void requestRelativeBootScriptNeedsProvenRequestDirectory()throws Exception{
  var r=Files.createTempDirectory("batch3-boot-script");write(r,"pom.xml","<project>spring-boot-starter-web</project>");write(r,"src/main/webapp/WEB-INF/jsp/footer.jsp","<script src=\"../js/app.js\"></script>");write(r,"src/main/resources/static/js/app.js","fetch('/api');");var i=new ProjectScanner().scan(r);
  assertTrue(ScriptSources.collect(i).scripts().isEmpty());
  var result=ScriptSources.collect(i,java.util.Map.of("src/main/webapp/WEB-INF/jsp/footer.jsp",java.util.List.of("/app/")));
  assertEquals(1,result.scripts().size());assertEquals("src/main/resources/static/js/app.js",result.scripts().get(0).file());assertEquals("INFERRED",result.scripts().get(0).status());assertEquals("../js/app.js",result.scripts().get(0).expression());
 }
 @Test void templateFieldProjectionIsLiteralAndPreservesUnknownExpressions(){
  var a=MarkupTag.scan(ThymeleafMarkup.normalize("<input th:field=\"*{code}\"/><input th:field=\"${builder()}\"/>")).stream().filter(t->!t.closing()).toList();assertEquals("code",a.get(0).attribute("name"));assertNull(a.get(1).attribute("name"));
 }
 @Test void dynamicBeanQueryPreservesUnknownParameterAndOriginalExpression(){
  String source="<a href=\"remove.do?id=<bean:write name=\"row\" property=\"id\"/>\">Delete</a>";var token=MarkupTag.scan(source).get(0);var resolution=new UrlVariableResolver("web/list.jsp",source).resolve(token.attribute("href"),token);assertEquals("remove.do?id={id}",resolution.value());assertEquals(token.attribute("href"),resolution.originalExpression());assertTrue(resolution.definitions().stream().allMatch(e->e.resolution()==io.screentrace.core.ApplicationGraph.ResolutionStatus.INFERRED));
 }
 @Test void onlyDirectPublicSourceAliasesProveRequestDirectories(){
  for(String[] sample:new String[][]{{"src/main/webapp/forms/input.jsp","/forms/input.jsp","/forms/"},{"src/main/webapp/forms/input.jsp","/start.do",""},{"src/main/webapp/WEB-INF/input.jsp","/WEB-INF/input.jsp",""},{"src/main/resources/templates/input.html","/input.html",""}}){
   var node=new io.screentrace.core.ApplicationGraph.GraphNode("screen",io.screentrace.core.ApplicationGraph.NodeType.SCREEN,"Input",java.util.Map.of("view",sample[0],"routeAliases",sample[1]),new io.screentrace.core.ApplicationGraph.SourceLocation(sample[0],1),io.screentrace.core.ApplicationGraph.Confidence.CONFIRMED,java.util.List.of());
   var graph=new io.screentrace.core.ApplicationGraph(new io.screentrace.core.ApplicationGraph.Application("sample",".",java.util.List.of()),java.util.List.of(node),java.util.List.of(),java.util.List.of(),java.util.List.of(),"2.2",java.util.List.of(),java.util.List.of());
   assertEquals(sample[2].isEmpty()?java.util.List.of():java.util.List.of(sample[2]),UrlGraphContribution.requestDirectories(graph,java.util.Set.of("screen")));
  }
 }
}
