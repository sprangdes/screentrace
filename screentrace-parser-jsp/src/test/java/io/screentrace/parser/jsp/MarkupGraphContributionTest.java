package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class MarkupGraphContributionTest {
  @Test void projectsNestedIncludesAndRulesWithoutLosingSharedIdsOrGuards() throws Exception {
    Path root=Files.createTempDirectory("markup-graph");
    Path a=root.resolve("a.jsp"),b=root.resolve("b.jsp"),part=root.resolve("part.jspf"),nested=root.resolve("nested.jspf");
    Files.writeString(a,"<c:if test='${show}'><%@ include file='part.jspf' %></c:if>");
    Files.writeString(b,"<jsp:include page='part.jspf'/>");
    Files.writeString(part,"<%@ include file='nested.jspf' %><button data-toggle='modal' data-target='#dialog'>Open</button>");
    Files.writeString(nested,"<form:form modelAttribute='order'><input name='email' required onclick='validate()'/></form:form><div id='dialog' role='dialog'></div>");
    var jsp=new JspProjectParser().analyze(root,List.of(a,b,part,nested));
    var evidence=List.of(new AnalysisEvidence(new SourceLocation("a.jsp",1),"Fixture",ResolutionStatus.CONFIRMED,null));
    var graph=new ApplicationGraph(new Application("test","",List.of()),List.of(
        new GraphNode("a",NodeType.SCREEN,"a",Map.of("view","a.jsp"),new SourceLocation("a.jsp",1),Confidence.CONFIRMED,evidence),
        new GraphNode("b",NodeType.SCREEN,"b",Map.of("view","b.jsp"),new SourceLocation("b.jsp",1),Confidence.CONFIRMED,evidence)),List.of(),List.of(),List.of(),"2.2",List.of(),List.of());
    var enriched=MarkupGraphContribution.enrich(graph,jsp);
    GraphIntegrityValidator.validate(enriched);
    var email=enriched.nodes().stream().filter(n->"email".equals(n.attributes().get("name"))).findFirst().orElseThrow();
    assertEquals(2,enriched.relationships().stream().filter(e->e.type()==EdgeType.CONTAINS&&e.to().equals(email.id())).count());
    assertEquals("UNRESOLVED",email.attributes().get("bindingStatus"));
    assertTrue(enriched.behaviors().stream().anyMatch(v->v.type()==BehaviorType.OPEN_DIALOG&&v.targetId()!=null));
    assertTrue(enriched.behaviors().stream().anyMatch(v->v.type()==BehaviorType.VALIDATE&&v.targetId()!=null));
    assertEquals(1,enriched.validationRules().size());
    assertTrue(enriched.relationships().stream().filter(e->e.from().equals("a")&&e.type()==EdgeType.CONTAINS)
        .allMatch(e->e.evidence().stream().anyMatch(x->Objects.toString(x.detail(),"").contains("${show}"))));
    assertEquals(enriched,MarkupGraphContribution.enrich(graph,jsp));
    assertTrue(email.attributes().containsKey("event.click"));
  }
  @Test void repeatedIncludeCarriesTheLoopMarkerIntoItsNestedComponents() throws Exception {
    Path root=Files.createTempDirectory("repeat-include"),page=root.resolve("page.jsp"),part=root.resolve("part.jspf");
    Files.writeString(page,"<c:forEach items='${items}'><jsp:include page='part.jspf'/></c:forEach>");Files.writeString(part,"<input name='repeatedField'>");
    var jsp=new JspProjectParser().analyze(root,List.of(page,part));
    var source=new SourceLocation("page.jsp",1);var proof=List.of(new AnalysisEvidence(source,"Fixture",ResolutionStatus.CONFIRMED,null));
    var graph=new ApplicationGraph(new Application("test","",List.of()),List.of(new GraphNode("screen",NodeType.SCREEN,"page",Map.of("view","page.jsp"),source,Confidence.CONFIRMED,proof)),List.of(),List.of(),List.of(),"2.2",List.of(),List.of());
    var enriched=MarkupGraphContribution.enrich(graph,jsp);
    assertEquals("true",enriched.nodes().stream().filter(n->"repeatedField".equals(n.attributes().get("name"))).findFirst().orElseThrow().attributes().get("repeated"));
  }

}
