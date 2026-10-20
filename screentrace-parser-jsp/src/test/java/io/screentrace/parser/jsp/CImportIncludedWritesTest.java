package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.Confidence;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

/** c:import reads its target from url, not file/page; a harmless import must not poison variable resolution. */
class CImportIncludedWritesTest {
  private JspAnalysis.Interaction link(String page,String header) throws Exception {
    Path root=Files.createTempDirectory("c-import");Files.writeString(root.resolve("header.jsp"),header);Path file=root.resolve("view.jsp");Files.writeString(file,page);
    return new JspProjectParser().analyze(root,List.of(file)).interactions().stream()
        .filter(i->i.type()==JspAnalysis.InteractionType.NAVIGATION&&"${url}".equals(i.originalExpression())).findFirst().orElseThrow();
  }
  private static final String USE="<c:url value='/items' var='url'/><a href='${url}'>Items</a>";
  @Test void literalImportWithoutWritesKeepsResolution() throws Exception {
    for(String url:List.of("/header.jsp","header.jsp","/header.jsp?tab=1")) {
      var item=link("<c:import url='"+url+"'/>"+USE,"<div>header</div>");
      assertEquals("/items",item.target(),url);assertEquals(Confidence.CONFIRMED,item.confidence(),url);
    }
  }
  @Test void importedPageThatWritesTheVariableStaysUnresolved() throws Exception {
    var item=link("<c:import url='/header.jsp'/>"+USE,"<c:set var='url' value='/other'/>");
    assertEquals(Confidence.UNRESOLVED,item.confidence());
  }
  @Test void externalImportCannotWritePageVariables() throws Exception {
    for(String url:List.of("https://cdn.example.com/banner.html","//cdn.example.com/banner.html"))
      assertEquals(Confidence.CONFIRMED,link("<c:import url='"+url+"'/>"+USE,"").confidence(),url);
  }
  @Test void dynamicMissingOrForeignContextImportIsUnknown() throws Exception {
    for(String tag:List.of("<c:import url='${part}'/>","<c:import url='/missing.jsp'/>","<c:import url='/header.jsp' context='/other'/>"))
      assertEquals(Confidence.UNRESOLVED,link(tag+USE,"<div/>").confidence(),tag);
  }
}
