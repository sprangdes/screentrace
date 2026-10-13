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
    void methodMappingWithoutPathUsesTheClassPathWithoutATrailingSlash() throws Exception {
        Path root = Files.createTempDirectory("st-empty-mapping");
        Path java = root.resolve("src/main/java/Api.java");
        Files.createDirectories(java.getParent());
        Files.writeString(java, "import org.springframework.web.bind.annotation.*; @RestController @RequestMapping(\"/api/notifications\") class Api { @GetMapping String list(){ return null; } @PostMapping(\"/\") String create(){ return null; } }");

        ApplicationGraph graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));

        assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("GET /api/notifications")), graph.nodes().toString());
        assertTrue(graph.nodes().stream().anyMatch(node -> node.name().equals("POST /api/notifications/")), graph.nodes().toString());
    }

    @Test
    void parsesControllersAndRecordDtosWrittenWithModernJavaSyntax() throws Exception {
        Path root = Files.createTempDirectory("st-java17");
        Path java = root.resolve("src/main/java/Api.java");
        Files.createDirectories(java.getParent());
        Files.writeString(java, """
            import org.springframework.web.bind.annotation.*;
            @RestController @RequestMapping("/api") class Api {
              @PostMapping("/pets") PetView create(@RequestBody CreatePet request) {
                String label = switch (request.kind()) { case "cat" -> "Cat"; default -> "Other"; };
                String text = \"\"\"
                    multi-line
                    \"\"\";
                return new PetView(label);
              }
            }
            record CreatePet(String kind, String name) { }
            record PetView(String label) { }
            """);

        ApplicationGraph graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));

        var endpoint = graph.nodes().stream().filter(node -> node.name().equals("POST /api/pets")).findFirst()
                .orElseThrow(() -> new AssertionError(graph.diagnostics().toString()));
        var contract = graph.apiContracts().stream().filter(item -> item.endpointId().equals(endpoint.id())).findFirst().orElseThrow();
        assertTrue(contract.request().fields().stream().anyMatch(field -> field.name().equals("name")));
        assertTrue(contract.responses().get(0).fields().stream().anyMatch(field -> field.name().equals("label")));
        assertTrue(graph.diagnostics().stream().noneMatch(item -> item.message().contains("Unable to parse")), graph.diagnostics().toString());
    }

    @Test
    void resolvesAReactViewImportedFromAnotherFile() throws Exception {
        Path root = Files.createTempDirectory("st-react");
        Path source = root.resolve("src");
        Files.createDirectories(source);
        Files.writeString(source.resolve("App.tsx"), "import { Route } from 'react-router-dom';\nimport Home from './Home';\n<Route path=\"/\" element={<Home />} />");
        Files.writeString(source.resolve("Home.tsx"), "import { Link } from 'react-router-dom'; export default function Home() { return <Link to=\"/next\">Next</Link>; }");

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
        Files.writeString(source.resolve("App.tsx"), "import { Route } from 'react-router-dom';\nimport Home from './Home';\n<Route path=\"/\" element={<Home />} />");
        Files.writeString(source.resolve("Home.tsx"), "import { useEffect } from 'react'; export default function Home(){ useEffect(()=>{ fetch('/api/pets'); }, []); return <button onClick={()=>fetch('/api/pets',{method:'POST'})}>Save</button>; }");

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
    void reactHandlersReachBackendEndpointsThroughAnApiWrapper() throws Exception {
        Path root = Files.createTempDirectory("st-react-api");
        Path java = root.resolve("src/main/java/Auth.java");
        Path web = root.resolve("web/src");
        Files.createDirectories(java.getParent());
        Files.createDirectories(web);
        Files.writeString(java, "import org.springframework.web.bind.annotation.*; @RestController @RequestMapping(\"/api/auth\") class Auth { @PostMapping(\"/login\") String login(){ return null; } @GetMapping(\"/unused\") String unused(){ return null; } }");
        Files.writeString(web.resolve("api.ts"), "async function request(path, options = {}) { return fetch(path, { ...options }); }\nexport const api = { login: () => request('/api/auth/login', { method: 'POST' }) };");
        Files.writeString(web.resolve("main.tsx"), "import { createRoot } from 'react-dom/client'; import App from './App'; import { api } from './api';\ncreateRoot(document.body).render(<><button onClick={() => api.login()}>Header sign in</button><App/></>);");
        Files.writeString(web.resolve("App.tsx"), "import { Routes, Route } from 'react-router-dom'; import Login from './Login';\nexport default function App(){ return <Routes><Route path=\"/login\" element={<Login/>}/><Route path=\"/home\" element={<p/>}/></Routes>; }");
        Files.writeString(web.resolve("Login.tsx"), "import { useNavigate } from 'react-router-dom'; import { api } from './api';\nexport default function Login(){ const navigate = useNavigate(); const submit = async (e) => { await api.login(); navigate('/home'); };\n return <form onSubmit={submit}><input name=\"user\"/><button>Sign in</button></form>; }");

        ApplicationGraph graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));

        var screen = graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.SCREEN && "/login".equals(node.attributes().get("route"))).findFirst().orElseThrow();
        assertEquals(io.screentrace.parser.jsp.ReactGraphContribution.screenId("web/src/App.tsx", "/login"), screen.id());
        assertEquals("Login", screen.attributes().get("view"));
        var button = graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.COMPONENT && node.name().equals("Sign in")).findFirst().orElseThrow();
        assertEquals("SUBMIT", button.attributes().get("kind"));
        var login = graph.nodes().stream().filter(node -> node.name().equals("POST /api/auth/login")).findFirst().orElseThrow();
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.TRIGGERS && edge.from().equals(button.id()) && edge.to().equals(login.id())), graph.relationships().toString());
        var home = graph.nodes().stream().filter(node -> "/home".equals(node.attributes().get("route"))).findFirst().orElseThrow();
        assertTrue(graph.relationships().stream().anyMatch(edge -> edge.type() == ApplicationGraph.EdgeType.NAVIGATES_TO && edge.from().equals(button.id()) && edge.to().equals(home.id())));
        assertTrue(graph.nodes().stream().anyMatch(node -> "TEXT_INPUT".equals(node.attributes().get("kind")) && "user".equals(node.attributes().get("name"))));
        var unused = graph.nodes().stream().filter(node -> node.name().equals("GET /api/auth/unused")).findFirst().orElseThrow();
        assertTrue(graph.relationships().stream().noneMatch(edge -> edge.to().equals(unused.id()) && edge.type() != ApplicationGraph.EdgeType.HANDLED_BY));

        assertEquals(1, graph.behaviors().stream().filter(item -> item.triggerId().equals(button.id()) && item.type() == ApplicationGraph.BehaviorType.CALL_API).count());
        var header = graph.nodes().stream().filter(node -> node.name().equals("Header sign in")).findFirst().orElseThrow();
        assertEquals(2, graph.relationships().stream().filter(edge -> edge.type() == ApplicationGraph.EdgeType.CONTAINS && edge.to().equals(header.id())).count());
        assertEquals(1, graph.behaviors().stream().filter(item -> item.triggerId().equals(header.id())).count());

        ApplicationGraph again = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
        assertEquals(graph.nodes().stream().map(ApplicationGraph.GraphNode::id).toList(), again.nodes().stream().map(ApplicationGraph.GraphNode::id).toList());
        assertEquals(graph.behaviors().stream().map(ApplicationGraph.Behavior::id).toList(), again.behaviors().stream().map(ApplicationGraph.Behavior::id).toList());
    }

    @Test
    void rejectsReactImportThatEscapesTheProjectRoot() throws Exception {
        Path root = Files.createTempDirectory("st-react-boundary");
        Path source = root.resolve("src");
        Files.createDirectories(source);
        Path secret = root.getParent().resolve("OutsideView.tsx");
        Files.writeString(secret, "export function Evil(){ return <p>SECRET_OUTSIDE</p>; }");
        try {
            Files.writeString(source.resolve("App.tsx"), "import { Route } from 'react-router-dom';\nimport Evil from '../../../../../../OutsideView';\n<Route path=\"/\" element={<Evil />} />");
            ApplicationGraph graph = new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
            var screen = graph.nodes().stream().filter(node -> node.type() == ApplicationGraph.NodeType.SCREEN).findFirst().orElseThrow();
            assertEquals("src/App.tsx", screen.attributes().get("viewSource"));
            assertFalse(screen.attributes().get("viewSources").contains("OutsideView"));
        } finally { Files.deleteIfExists(secret); }
    }
}
