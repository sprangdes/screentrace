package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.nio.charset.Charset;
import java.nio.file.*;
import org.junit.jupiter.api.Test;

/** The MVC pipeline enriches URLs twice; source-derived node evidence must still appear once. */
class RepeatedUrlEnrichmentTest {
  private static long evidence(ApplicationGraph.GraphNode node,String parser){return node.evidence().stream().filter(e->e.parser().equals(parser)).count();}
  @Test void conditionalTargetsAndEncodingEvidenceAreNotDuplicated() throws Exception {
    Path root=Files.createTempDirectory("st-repeat");Path views=root.resolve("src/main/webapp/WEB-INF/views");Files.createDirectories(views);
    Files.writeString(root.resolve("pom.xml"),"<project><dependency>spring-webmvc</dependency></project>");
    Files.writeString(views.resolve("edit.jsp"),"<c:set var=\"route\" value=\"/one\"/>\n<c:choose>\n<c:when test=\"${edit}\"><c:set var=\"route\" value=\"/two\"/></c:when>\n<c:otherwise><c:set var=\"route\" value=\"/one\"/></c:otherwise>\n</c:choose>\n<form action=\"${route}\"><button type=\"submit\">Save</button></form>");
    Files.write(views.resolve("legacy.jsp"),"<%@ page pageEncoding=\"Big5\"%>\n<title>訂單</title>".getBytes(Charset.forName("Big5")));
    var graph=new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    var form=graph.nodes().stream().filter(n->"FORM".equals(n.attributes().get("kind"))&&n.attributes().containsKey("requestAlternatives")).findFirst().orElseThrow();
    assertEquals(2,evidence(form,"ConditionalUrlTargets"),form.evidence().toString());
    var button=graph.nodes().stream().filter(n->form.id().equals(n.attributes().get("formId"))&&n.attributes().containsKey("requestAlternatives")).findFirst().orElseThrow();
    assertEquals(2,evidence(button,"ConditionalUrlTargets"),button.evidence().toString());
    var legacy=graph.nodes().stream().filter(n->n.type()==ApplicationGraph.NodeType.SCREEN&&n.attributes().getOrDefault("view","").endsWith("legacy.jsp")).findFirst().orElseThrow();
    assertEquals("BIG5",legacy.attributes().get("sourceEncoding"));assertEquals(1,evidence(legacy,"SourceEncoding"));
  }
}
