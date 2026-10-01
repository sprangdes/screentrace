package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class SpringBootAnalyzerTest {
    @Test
    void resolvesClassAndMethodMappingsAndView() throws Exception {
        Path root = Files.createTempDirectory("st");
        Path java = root.resolve("src/main/java/X.java");
        Files.createDirectories(java.getParent());
        Files.writeString(java, "import org.springframework.stereotype.*; import org.springframework.web.bind.annotation.*; @Controller @RequestMapping(\"/users\") class X { @GetMapping(\"/{id}\") String detail(){ return \"user/detail\"; }}");

        ApplicationGraph graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));

        assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("GET /users/{id}")));
        assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("user/detail")));
    }

    @Test
    void resolvesAReactViewImportedFromAnotherFile() throws Exception {
        Path root = Files.createTempDirectory("st-react");
        Path source = root.resolve("src");
        Files.createDirectories(source);
        Files.writeString(source.resolve("App.tsx"), "import Home from './Home';\n<Route path=\"/\" element={<Home />} />");
        Files.writeString(source.resolve("Home.tsx"), "export function Home() { return <Link to=\"/next\">Next</Link>; }");

        ApplicationGraph graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));

        assertEquals("src/Home.tsx", graph.nodes().stream()
                .filter(node -> node.type() == ApplicationGraph.NodeType.SCREEN)
                .findFirst().orElseThrow().attributes().get("viewSource"));
    }

    @Test
    void capturesApiContractAndPageLoadCall() throws Exception {
        Path root = Files.createTempDirectory("st-api");
        Path source = root.resolve("src");
        Files.createDirectories(source.resolve("main/java"));
        Files.writeString(source.resolve("main/java/Api.java"), """
            import org.springframework.web.bind.annotation.*;
            @RestController @RequestMapping("/api") class Api {
              @GetMapping("/pets") PetResponse[] list(){ return null; }
              @PostMapping(value="/pets", produces="application/json") PetResponse create(@RequestBody CreatePetRequest request, @RequestParam(required=false) String source){ return null; }
            }
            class CreatePetRequest { String name; int age; } class PetResponse { long id; String name; }
            """);
        Files.writeString(source.resolve("App.tsx"), "import Home from './Home';\n<Route path=\"/\" element={<Home />} />");
        Files.writeString(source.resolve("Home.tsx"), "import { useEffect } from 'react'; export function Home(){ useEffect(()=>{ fetch('/api/pets'); }, []); return <button onClick={()=>fetch('/api/pets',{method:'POST'})}>Save</button>; }");

        ApplicationGraph graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));

        var endpoint = graph.nodes().stream().filter(node -> node.name().equals("POST /api/pets")).findFirst()
                .orElseThrow(() -> new AssertionError(graph.nodes().toString()));
        var contract = graph.apiContracts().stream().filter(item -> item.endpointId().equals(endpoint.id())).findFirst().orElseThrow();
        assertTrue(contract.request().fields().stream().anyMatch(field -> field.name().equals("name") && field.location().equals("BODY")));
        assertTrue(contract.responses().get(0).fields().stream().anyMatch(field -> field.name().equals("id")));
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.CALLS));
        var save = graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.COMPONENT && node.name().equals("Save")).findFirst().orElseThrow();
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.TRIGGERS && edge.from().equals(save.id())));
    }

    @Test
    void rejectsReactImportThatEscapesTheProjectRoot() throws Exception {
        Path root = Files.createTempDirectory("st-react-boundary");
        Path source = root.resolve("src");
        Files.createDirectories(source);
        Path secret = root.getParent().resolve("OutsideView.tsx");
        Files.writeString(secret, "export function Evil(){ return <p>SECRET_OUTSIDE</p>; }");
        try {
            Files.writeString(source.resolve("App.tsx"), "import Evil from '../../../../../../OutsideView';\n<Route path=\"/\" element={<Evil />} />");
            ApplicationGraph graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
            var screen = graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.SCREEN).findFirst().orElseThrow();
            assertEquals("src/App.tsx", screen.attributes().get("viewSource"));
            assertFalse(screen.attributes().get("viewSources").contains("OutsideView"));
        } finally { Files.deleteIfExists(secret); }
    }
}
