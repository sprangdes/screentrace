package io.screentrace.core;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AudienceSchemaTest {
 @Test void readsAudienceSchemaWithSourceAndKeepsOlderGraphsReadable() throws Exception {
  String input="""
   {"schemaVersion":"2.3","application":{"name":"sample","path":".","technologies":[]},
    "nodes":[{"id":"screen","type":"SCREEN","name":"Page","attributes":{},"source":{"file":"App.tsx","line":2},"confidence":"INFERRED",
    "evidence":[{"source":{"file":"App.tsx","line":2},"parser":"Fixture","resolution":"INFERRED"}],
    "audience":[{"text":"visitor","truth":true,"source":{"file":"App.tsx","line":2}}]}],"relationships":[]}
   """;
  var mapper=new ObjectMapper();var graph=mapper.readValue(input,ApplicationGraph.class);
  assertDoesNotThrow(()->GraphIntegrityValidator.requireAnalysis(graph));
  assertTrue(mapper.writeValueAsString(graph).contains("\"audience\""));
  assertDoesNotThrow(()->mapper.readValue(input.replace("2.3","2.2").replace(",\n    \"audience\":[{\"text\":\"visitor\",\"truth\":true,\"source\":{\"file\":\"App.tsx\",\"line\":2}}]",""),ApplicationGraph.class));
 }
}
