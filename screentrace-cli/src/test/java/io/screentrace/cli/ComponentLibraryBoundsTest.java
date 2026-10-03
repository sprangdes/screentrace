package io.screentrace.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.screentrace.report.ComponentLibrary;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class ComponentLibraryBoundsTest {
    private final ObjectMapper json = new ObjectMapper();
    @TempDir Path temp;

    private ObjectNode sample() throws Exception {
        return (ObjectNode) json.readTree(Files.readAllBytes(Path.of("../docs/examples/component-library.sample.json")));
    }

    @Test void textLimitsAcceptBoundaryAndRejectOverflowWithFieldPath() throws Exception {
        String[][] fields = {
            {"/library", "name", "200", "$.library.name"},
            {"/library", "version", "200", "$.library.version"},
            {"/components/0", "id", "200", "$.components[0].id"},
            {"/components/0", "name", "200", "$.components[0].name"},
            {"/components/0", "selector", "200", "$.components[0].selector"},
            {"/components/0", "category", "200", "$.components[0].category"},
            {"/components/0", "description", "4000", "$.components[0].description"},
            {"/components/0", "usage", "4000", "$.components[0].usage"},
            {"/components/0/inputs/0", "description", "4000", "$.components[0].inputs[0].description"},
            {"/components/0/outputs/0", "description", "4000", "$.components[0].outputs[0].description"},
            {"/components/0/slots/0", "description", "4000", "$.components[0].slots[0].description"}
        };
        for (String[] field : fields) {
            var data = sample();
            var owner = (ObjectNode) data.at(field[0]);
            int limit = Integer.parseInt(field[2]);
            // JSON Schema length counts Unicode code points, not UTF-16 units.
            owner.put(field[1], "\uD83D\uDE00".repeat(limit));
            assertNotNull(ComponentLibrary.validate(json.writeValueAsBytes(data)), field[3]);
            owner.put(field[1], "x".repeat(limit + 1));
            String error = assertThrows(IllegalArgumentException.class,
                    () -> ComponentLibrary.validate(json.writeValueAsBytes(data)), field[3]).getMessage();
            assertTrue(error.contains(field[3]), error);
            assertTrue(error.contains("長度不得超過 " + limit + " 個字元"), error);
            assertFalse(error.contains("x".repeat(limit + 1)), error);
        }
    }

    @Test void componentArraysAcceptTwoHundredAndRejectTwoHundredOneWithFieldPath() throws Exception {
        for (String field : new String[]{"inputs", "outputs", "slots", "matches"}) {
            var data = sample();
            var items = (ArrayNode) data.at("/components/0/" + field);
            var item = items.get(0).deepCopy();
            items.removeAll();
            for (int i = 0; i < 200; i++) items.add(item.deepCopy());
            assertNotNull(ComponentLibrary.validate(json.writeValueAsBytes(data)), field);
            items.add(item.deepCopy());
            String error = assertThrows(IllegalArgumentException.class,
                    () -> ComponentLibrary.validate(json.writeValueAsBytes(data)), field).getMessage();
            assertTrue(error.contains("$.components[0]." + field), error);
            assertTrue(error.contains("項目不得超過 200 筆"), error);
        }
    }

    @Test void fictionalExamplePassesCliAndOverflowDiagnosticsRetainFieldPath() throws Exception {
        Path file = temp.resolve("sample.json");
        var data = sample();
        Files.write(file, json.writeValueAsBytes(data));
        assertTrue(LibraryCommands.run(new String[]{"library", "validate", file.toString()}, temp)
                .startsWith("manifest 驗證通過 "));
        ((ObjectNode) data.at("/library")).put("name", "x".repeat(201));
        Files.write(file, json.writeValueAsBytes(data));
        for (String action : new String[]{"validate", "import"}) {
            String error = assertThrows(IllegalArgumentException.class,
                    () -> LibraryCommands.run(new String[]{"library", action, file.toString()}, temp)).getMessage();
            assertTrue(error.contains("$.library.name"), error);
            assertTrue(error.contains("長度不得超過 200 個字元"), error);
            assertFalse(error.contains(temp.toString()), error);
        }
        assertEquals("", new LibraryStore(temp).list());
    }
}
