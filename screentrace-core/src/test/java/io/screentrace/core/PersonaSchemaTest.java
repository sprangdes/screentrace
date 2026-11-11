package io.screentrace.core;

import static io.screentrace.core.ApplicationGraph.*;
import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;

class PersonaSchemaTest {
  private final ObjectMapper mapper = new ObjectMapper();
  private final String input =
      """
 {"schemaVersion":"2.4","application":{"name":"sample","path":".","technologies":[],"personas":[{"id":"guest","name":"訪客","facts":[{"text":"me","truth":false,"source":{"file":"workspace:config.json","line":3}}],"startPaths":["/"],"screens":{"screen":"APPLIES"},"navigations":[]}]},"nodes":[{"id":"screen","type":"SCREEN","name":"Page","attributes":{},"source":{"file":"App.tsx","line":2},"confidence":"INFERRED","evidence":[{"source":{"file":"App.tsx","line":2},"parser":"Fixture","resolution":"INFERRED"}]}],"relationships":[]}
 """;

  @Test
  void schema24ValidatesAndSerializes() throws Exception {
    var g = mapper.readValue(input, ApplicationGraph.class);
    assertDoesNotThrow(() -> GraphIntegrityValidator.requireAnalysis(g));
    assertTrue(mapper.writeValueAsString(g).contains("\"personas\""));
  }

  @Test
  void olderSchemaRejectsPersonas() throws Exception {
    var g = mapper.readValue(input.replace("2.4", "2.3"), ApplicationGraph.class);
    assertTrue(
        assertThrows(
                IllegalArgumentException.class, () -> GraphIntegrityValidator.requireAnalysis(g))
            .getMessage()
            .contains("schema 2.4"));
  }

  @Test
  void rejectsMissingScreen() throws Exception {
    var g =
        mapper.readValue(
            input.replace("\"screens\":{\"screen\"", "\"screens\":{\"missing\""),
            ApplicationGraph.class);
    assertThrows(IllegalArgumentException.class, () -> GraphIntegrityValidator.requireAnalysis(g));
  }

  @Test
  void personaMapsSerializeDeterministically() throws Exception {
    var a = new HashMap<String, PersonaStatus>();
    a.put("z", PersonaStatus.UNKNOWN);
    a.put("a", PersonaStatus.APPLIES);
    var b = new HashMap<String, PersonaStatus>();
    b.put("a", PersonaStatus.APPLIES);
    b.put("z", PersonaStatus.UNKNOWN);
    assertEquals(
        mapper.writeValueAsString(
            new Persona("guest", "訪客", null, List.of(), List.of(), a, List.of(), null)),
        mapper.writeValueAsString(
            new Persona("guest", "訪客", null, List.of(), List.of(), b, List.of(), null)));
  }

  @Test
  void descriptionIsWrittenOnlyWhenSetAndReadBack() throws Exception {
    var with =
        new Persona("guest", "訪客", "尚未登入的訪客", List.of(), List.of(), Map.of(), List.of(), null);
    var text = mapper.writeValueAsString(with);
    assertTrue(text.contains("\"description\":\"尚未登入的訪客\""));
    assertEquals(with, mapper.readValue(text, Persona.class));
    assertFalse(
        mapper
            .writeValueAsString(
                new Persona("guest", "訪客", null, List.of(), List.of(), Map.of(), List.of(), null))
            .contains("description"));
  }
}
