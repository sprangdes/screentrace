package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class TilesMarkupTest {
  @Test void expandsExtendsNestedDefinitionsAndInsertPutWithActualDefinitionLines() throws Exception {
    Path root=Files.createTempDirectory("tiles-markup");Path config=root.resolve("tiles.xml"),layout=root.resolve("layout.jsp"),body=root.resolve("body.jsp"),page=root.resolve("page.jsp");
    Files.writeString(config,"<tiles-definitions>\n<definition name='base' template='/layout.jsp'/>\n<definition name='child' extends='base'><put-attribute name='body' value='nested'/></definition>\n<definition name='nested' template='/body.jsp'/>\n</tiles-definitions>");
    Files.writeString(layout,"<div></div>");Files.writeString(body,"<input name='nestedField' required/>");
    Files.writeString(page,"<tiles:insert definition='child'><tiles:put name='extra' value='/body.jsp'/></tiles:insert>");
    var files=List.of(config,layout,body,page);var jsp=new JspProjectParser().analyze(root,files);
    var child=jsp.tilesDefinitions().stream().filter(d->d.name().equals("child")).findFirst().orElseThrow();
    assertEquals("/layout.jsp",child.template());assertEquals(3,child.source().line());
    var proof=List.of(new AnalysisEvidence(new SourceLocation("page.jsp",1),"Fixture",ResolutionStatus.CONFIRMED,null));
    var graph=new ApplicationGraph(new Application("test","",List.of()),List.of(new GraphNode("screen",NodeType.SCREEN,"page",Map.of("view","page.jsp"),new SourceLocation("page.jsp",1),Confidence.CONFIRMED,proof)),List.of(),List.of(),List.of(),"2.2",List.of(),List.of());
    var enriched=MarkupGraphContribution.enrich(graph,jsp);GraphIntegrityValidator.validate(enriched);
    var field=enriched.nodes().stream().filter(n->"nestedField".equals(n.attributes().get("name"))).findFirst().orElseThrow();
    assertTrue(enriched.relationships().stream().anyMatch(e->e.from().equals("screen")&&e.to().equals(field.id())&&e.type()==EdgeType.CONTAINS));
    var reversed=new ArrayList<>(files);Collections.reverse(reversed);
    assertEquals(enriched,MarkupGraphContribution.enrich(graph,new JspProjectParser().analyze(root,reversed)));
  }
  @Test void cyclesMissingParentsAndDuplicateDefinitionsAreDiagnosedWithoutChoosing() throws Exception {
    Path root=Files.createTempDirectory("tiles-errors"),config=root.resolve("tiles.xml");
    Files.writeString(config,"<tiles-definitions><definition name='a' extends='b'/><definition name='b' extends='a'/><definition name='missing' extends='unknown'/><definition name='duplicate' template='/a.jsp'/><definition name='duplicate' template='/b.jsp'/></tiles-definitions>");
    var jsp=new JspProjectParser().analyze(root,List.of(config));
    assertFalse(jsp.diagnostics().isEmpty());assertTrue(jsp.tilesDefinitions().stream().noneMatch(d->d.name().equals("duplicate")));
  }
}
