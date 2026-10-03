package io.screentrace.cli;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.GraphIntegrityValidator;
import io.screentrace.scanner.ProjectScanner;
import java.lang.reflect.InvocationTargetException;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class SyntheticProjectIntegrationTest {
    @TempDir Path temp;
    private final ObjectMapper json = new ObjectMapper();
    private static Path root() {
        for (Path p = Path.of("").toAbsolutePath(); p != null; p = p.getParent())
            if (Files.isRegularFile(p.resolve("pom.xml")) && Files.isDirectory(p.resolve("screentrace-core"))) return p;
        throw new IllegalStateException("Source root missing");
    }
    private Map<String,String> snapshot(Path source) throws Exception {
        var result = new TreeMap<String,String>();
        try (var files = Files.walk(source)) {
            for (Path file : files.filter(Files::isRegularFile).toList())
                result.put(source.relativize(file).toString(), HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file))));
        }
        return result;
    }

    @Test void syntaxInventoryHasEveryDeclaredSourceTokenAndFiveSourceOnlyFamilies() throws Exception {
        Path fixtures = root().resolve("fixtures/wp10");
        JsonNode inventory = json.readTree(fixtures.resolve("coverage.json").toFile());
        assertEquals(Set.of("struts1", "struts1-spring", "spring-mvc-jsp", "spring-boot-jsp", "struts2-rejected"),
            json.convertValue(inventory.path("projects"), Set.class));
        Set<String> ids = new HashSet<>();
        for (JsonNode row : inventory.path("cases")) {
            assertTrue(ids.add(row.path("id").asText()), "duplicate coverage ID");
            Path file = fixtures.resolve(row.path("file").asText()).normalize();
            assertTrue(file.startsWith(fixtures));
            assertTrue(Files.isRegularFile(file), row.toString());
            String text = Files.readString(file);
            for (JsonNode token : row.path("tokens")) assertTrue(text.contains(token.asText()), row.toString());
        }
        assertTrue(ids.containsAll(Set.of("WP2.1", "WP2.2", "WP2.3", "WP2.4", "WP2.5", "WP2.6", "WP2.7", "WP2.8", "WP2.9",
            "WP3.1", "WP3.2", "WP3.3", "WP3.4", "WP3.5", "WP3.6", "WP3.7", "WP3.8",
            "WP4.1", "WP4.2", "WP4.3", "WP4.4", "WP4.5", "WP4.6", "WP4.7", "WP4.8", "WP4.9", "WP4.11",
            "WP5.1", "WP5.2", "WP5.3", "WP5.4", "WP5.5", "WP5.6", "WP5.7")));
        assertTrue(Files.readString(fixtures.resolve("README.md")).contains("自行撰寫"));
    }

    @Test void sourceOnlyCliPipelineTwiceProducesIdenticalGraphPreviewAndHtmlAndRejectsStrutsTwo() throws Exception {
        var analyze = ScreenTraceCli.class.getDeclaredMethod("analyze", ProjectCatalog.Project.class, WorkspaceSettings.class);
        analyze.setAccessible(true);
        String oldHome = System.getProperty("user.home");
        System.setProperty("user.home", temp.resolve("home").toString());
        try {
            Path fixtures = root().resolve("fixtures/wp10");
            Path workspace = WorkspaceSettings.defaultFile().getParent();
            Path manifest = root().resolve("docs/examples/component-library.sample.json");
            Path outputs = root().resolve("screentrace-cli/target/wp10-fixtures");
            for (String family : List.of("struts1", "struts1-spring", "spring-mvc-jsp", "spring-boot-jsp")) {
                Path original = fixtures.resolve(family);
                Path source = temp.resolve("home/projects").resolve(family);
                try (var files = Files.walk(original)) {
                    for (Path file : files.toList()) {
                        Path copied = source.resolve(original.relativize(file));
                        if (Files.isDirectory(file)) Files.createDirectories(copied);
                        else Files.copy(file, copied, StandardCopyOption.REPLACE_EXISTING);
                    }
                }
                var before = snapshot(source);
                assertFalse(before.isEmpty(), family);
                assertEquals("已綁定專案", LibraryCommands.run(new String[]{"library", "import", manifest.toString(), "--project", family}, workspace));
                Path first = outputs.resolve(family).resolve("first"), second = outputs.resolve(family).resolve("second");
                var settings = new WorkspaceSettings(fixtures, outputs, Map.of(source.toAbsolutePath().toString(), List.of("/fixture")));
                analyze.invoke(null, new ProjectCatalog.Project(family, source, first), settings);
                analyze.invoke(null, new ProjectCatalog.Project(family, source, second), settings);
                for (String artifact : List.of("application-graph.json", "preview-model.json", "viewer-documents.json", "report/screentrace-report.html"))
                    assertArrayEquals(Files.readAllBytes(first.resolve(artifact)), Files.readAllBytes(second.resolve(artifact)), family+":"+artifact);
                var graph = json.readValue(first.resolve("application-graph.json").toFile(), ApplicationGraph.class);
                GraphIntegrityValidator.requireAnalysis(graph);
                assertTrue(graph.nodes().stream().anyMatch(n -> n.type() == ApplicationGraph.NodeType.SCREEN), family);
                assertTrue(graph.nodes().stream().anyMatch(n -> n.type() == ApplicationGraph.NodeType.COMPONENT && "BUTTON".equals(n.attributes().get("kind"))), family);
                assertTrue(graph.behaviors().stream().anyMatch(b -> b.type() == ApplicationGraph.BehaviorType.CALL_API), family);
                assertTrue(graph.relationships().stream().anyMatch(e -> e.type() == ApplicationGraph.EdgeType.CALLS), family);
                assertTrue(graph.validationRules().stream().anyMatch(r -> r.layer() == ApplicationGraph.ValidationLayer.SERVER), family);
                assertTrue(graph.validationRules().stream().anyMatch(r -> r.layer() == ApplicationGraph.ValidationLayer.MARKUP), family);
                assertTrue(graph.validationRules().stream().anyMatch(r -> r.layer() == ApplicationGraph.ValidationLayer.CLIENT), family);
                assertEquals(EnumSet.allOf(ApplicationGraph.BehaviorType.class),
                    graph.behaviors().stream().map(ApplicationGraph.Behavior::type).collect(java.util.stream.Collectors.toSet()), family);
                assertEquals(EnumSet.allOf(ApplicationGraph.ComponentKind.class).stream().map(Enum::name).collect(java.util.stream.Collectors.toSet()),
                    graph.nodes().stream().filter(n -> n.type() == ApplicationGraph.NodeType.COMPONENT).map(n -> n.attributes().get("kind")).collect(java.util.stream.Collectors.toSet()), family);
                for (String code : List.of("JS_SYNTAX_ERROR", "JS_CALL_CYCLE", "JS_DEPTH_LIMIT", "UNKNOWN_CALL"))
                    assertTrue(graph.diagnostics().stream().anyMatch(d -> code.equals(d.code())), family+":"+code);
                assertTrue(graph.behaviors().stream().anyMatch(b -> b.parentId() != null), family);
                assertTrue(graph.behaviors().stream().anyMatch(b -> "load".equals(b.event()) && graph.nodes().stream().anyMatch(n -> n.id().equals(b.triggerId()) && n.type() == ApplicationGraph.NodeType.SCREEN)), family);
                assertTrue(graph.behaviors().stream().anyMatch(b -> b.evidence().stream().anyMatch(e -> e.resolution() == ApplicationGraph.ResolutionStatus.UNRESOLVED && e.detail() != null && e.detail().contains("#missing-element"))), family);
                for (String adversary : List.of("eval(", "obj[x]", "document.querySelector('#email').value"))
                    assertTrue(graph.behaviors().stream().anyMatch(b -> b.expression() != null && b.expression().contains(adversary) && b.evidence().stream().anyMatch(e -> e.resolution() == ApplicationGraph.ResolutionStatus.UNRESOLVED)), family+":"+adversary);
                if (family.startsWith("struts1")) {
                    for (String handler : List.of("synthetic.EditAction.save()", "synthetic.LookupAction.save()", "synthetic.MappingAction.save()"))
                        assertTrue(graph.nodes().stream().anyMatch(n -> handler.equals(n.name())), family+":"+handler);
                    assertTrue(graph.relationships().stream().anyMatch(e -> e.type() == ApplicationGraph.EdgeType.INCLUDES), family);
                    assertTrue(graph.validationRules().stream().anyMatch(r -> r.evidence().stream().anyMatch(e -> e.detail() != null && e.detail().contains("STRUTS_VALIDATOR"))), family);
                }
                if (!family.equals("struts1")) {
                    assertTrue(graph.diagnostics().stream().anyMatch(d -> "URL_METHOD_MISMATCH".equals(d.code())), family);
                    assertTrue(graph.behaviors().stream().anyMatch(b -> b.evidence().stream().anyMatch(e -> e.parser().equals("UrlResolution") && e.resolution() == ApplicationGraph.ResolutionStatus.AMBIGUOUS)), family);
                    assertTrue(graph.apiContracts().stream().anyMatch(c -> c.request().fields().stream().anyMatch(f -> "email".equals(f.name()))), family);
                    assertTrue(graph.validationRules().stream().anyMatch(r -> r.evidence().stream().anyMatch(e -> e.detail() != null && e.detail().contains("@InitBinder"))), family);
                }
                if (family.equals("struts1-spring")) assertTrue(graph.nodes().stream().anyMatch(n -> "synthetic.ManagedAction.execute()".equals(n.name())));
                JsonNode preview = json.readTree(first.resolve("preview-model.json").toFile());
                assertTrue(preview.path("elements").size() > 0, family);
                assertFalse(Files.readString(first.resolve("viewer-documents.json")).contains("<script"), family);
                assertFalse(Files.readString(first.resolve("report/screentrace-report.html")).contains(temp.toString()));
                assertEquals(before, snapshot(source), "target must remain unchanged");
                assertEquals(before, snapshot(original), "checked-in fixture must remain unchanged");
            }
            Path unsupported = fixtures.resolve("struts2-rejected"), rejected = outputs.resolve("struts2-rejected");
            var error = assertThrows(InvocationTargetException.class, () -> analyze.invoke(null,
                new ProjectCatalog.Project("struts2-rejected", unsupported, rejected), new WorkspaceSettings(fixtures, outputs)));
            assertTrue(error.getCause().getMessage().contains("UNSUPPORTED_FRAMEWORK"));
            assertFalse(Files.exists(rejected.resolve("application-graph.json")));
            assertFalse(Files.exists(rejected.resolve("report/screentrace-report.html")));
        } finally { System.setProperty("user.home", oldHome); }
    }

    @Test void sameSourceRetainsUnspecifiedContextAndEveryConflictingContextCandidate() throws Exception {
        Path source = root().resolve("fixtures/wp10/spring-mvc-jsp");
        var analyze = ScreenTraceCli.class.getDeclaredMethod("analyze", ProjectScanner.ProjectInventory.class);
        analyze.setAccessible(true);
        var inventory = new ProjectScanner().scan(source);
        var unknown = (ApplicationGraph) analyze.invoke(null, inventory);
        GraphIntegrityValidator.requireAnalysis(unknown);
        assertTrue(unknown.diagnostics().stream().anyMatch(d -> "CONTEXT_PATH_UNSPECIFIED".equals(d.code())));
        var ambiguous = (ApplicationGraph) analyze.invoke(null, inventory.withContextPaths(List.of("/fixture", "/other"), 1));
        GraphIntegrityValidator.requireAnalysis(ambiguous);
        assertTrue(ambiguous.behaviors().stream().anyMatch(b -> b.evidence().stream().anyMatch(e ->
            e.parser().equals("UrlResolution") && e.resolution() == ApplicationGraph.ResolutionStatus.AMBIGUOUS)));
        assertTrue(ambiguous.behaviors().stream().anyMatch(b -> b.evidence().stream().anyMatch(e ->
            e.parser().equals("UrlResolution") && e.source().file().equals("workspace:config.json")
            && e.detail().contains("/fixture") && e.detail().contains("/other"))));
        String serialized = json.writeValueAsString(ambiguous);
        assertTrue(serialized.contains("/fixture"));
        assertTrue(serialized.contains("/other"));
        assertFalse(serialized.contains(System.getProperty("user.home")));
    }
}
