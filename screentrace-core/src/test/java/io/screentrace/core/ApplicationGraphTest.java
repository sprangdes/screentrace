package io.screentrace.core;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*; import org.junit.jupiter.api.Test;
class ApplicationGraphTest { @Test void stableIdAndJsonContract() throws Exception { String id=ApplicationGraph.id(ApplicationGraph.NodeType.SCREEN,"a"); assertEquals(id,ApplicationGraph.id(ApplicationGraph.NodeType.SCREEN,"a")); var graph=new ApplicationGraph(new ApplicationGraph.Application("sample","/sample",List.of("Java")),List.of(new ApplicationGraph.GraphNode(id,ApplicationGraph.NodeType.SCREEN,"a",Map.of(),null,ApplicationGraph.Confidence.CONFIRMED)),List.of(),List.of()); assertTrue(new ObjectMapper().writeValueAsString(graph).contains("CONFIRMED")); } }
