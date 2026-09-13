package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
}
