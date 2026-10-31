package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;

/** A server template alone must not route a React project away from the pipeline that contributes React screens. */
class AnalyzerRoutingTest {
  private static long reactScreens(ApplicationGraph graph) {
    return graph.nodes().stream().filter(n->n.type()==ApplicationGraph.NodeType.SCREEN&&"src/main/frontend/Home.tsx".equals(n.attributes().get("viewSource"))).count();
  }
  @Test void reactProjectWithOneTemplateKeepsReactScreens() throws Exception {
    Path root=Files.createTempDirectory("st-route-react");
    Files.createDirectories(root.resolve("src/main/frontend"));Files.createDirectories(root.resolve("src/main/resources/templates"));
    Files.writeString(root.resolve("pom.xml"),"<project><dependency>spring-boot-starter-web</dependency></project>");
    Files.writeString(root.resolve("src/main/frontend/App.tsx"),"import { Route } from 'react-router-dom';\nimport Home from './Home';\n<Route path=\"/\" element={<Home />} />");
    Files.writeString(root.resolve("src/main/frontend/Home.tsx"),"import { Link } from 'react-router-dom'; export default function Home() { return <Link to=\"/next\">Next</Link>; }");
    Files.writeString(root.resolve("src/main/resources/templates/error.html"),"<html><body>Error</body></html>");
    assertEquals(1,reactScreens(new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root))));
  }
  @Test void reactScreensSurviveAJspOrTemplateInTheSameProject() throws Exception {
    Path root=Files.createTempDirectory("st-route-react-jsp");
    Files.createDirectories(root.resolve("src/main/java"));Files.createDirectories(root.resolve("src/main/frontend"));
    Files.writeString(root.resolve("pom.xml"),"<project><dependency>spring-boot-starter-web</dependency></project>");
    Files.writeString(root.resolve("src/main/java/Api.java"),"import org.springframework.web.bind.annotation.*;\n@RestController class Api { @PostMapping(\"/api/pets\") String create(){ return null; } }");
    Files.writeString(root.resolve("src/main/frontend/App.tsx"),"import { Route } from 'react-router-dom';\nimport Home from './Home';\n<Route path=\"/react\" element={<Home />} />");
    Files.writeString(root.resolve("src/main/frontend/Home.tsx"),"export default function Home(){ return <button onClick={()=>fetch('/api/pets',{method:'POST'})}>Save</button>; }");
    var reactOnly=new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    Files.createDirectories(root.resolve("src/main/webapp"));Files.writeString(root.resolve("src/main/webapp/error.jsp"),"<html><body>Error</body></html>");
    var withJsp=new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    Files.createDirectories(root.resolve("src/main/resources/templates"));Files.writeString(root.resolve("src/main/resources/templates/owners.html"),"<html><body>Owners</body></html>");
    var withTemplate=new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    for(var graph:java.util.List.of(reactOnly,withJsp,withTemplate)){
      assertTrue(graph.nodes().stream().anyMatch(n->n.type()==ApplicationGraph.NodeType.SCREEN&&"/react".equals(n.attributes().get("route"))),graph.nodes().toString());
      var save=graph.nodes().stream().filter(n->n.type()==ApplicationGraph.NodeType.COMPONENT&&n.name().equals("Save")).findFirst().orElseThrow(()->new AssertionError(graph.nodes().toString()));
      var endpoint=graph.nodes().stream().filter(n->n.type()==ApplicationGraph.NodeType.ENDPOINT&&n.name().equals("POST /api/pets")).findFirst().orElseThrow(()->new AssertionError(graph.nodes().toString()));
      assertTrue(graph.relationships().stream().anyMatch(e->e.type()==ApplicationGraph.EdgeType.TRIGGERS&&e.from().equals(save.id())&&e.to().equals(endpoint.id())),graph.relationships().toString());
    }
    assertTrue(withJsp.nodes().stream().anyMatch(n->n.type()==ApplicationGraph.NodeType.SCREEN&&"src/main/webapp/error.jsp".equals(n.attributes().get("view"))));
    assertTrue(withTemplate.nodes().stream().anyMatch(n->n.type()==ApplicationGraph.NodeType.SCREEN&&"src/main/resources/templates/owners.html".equals(n.attributes().get("view"))));
  }

  @Test void createReactAppWithJsxInJsFilesContributesScreens() throws Exception {
    // oktadev/okta-spring-boot-react-crud-example: JSX in app/src/*.js, react declared in app/package.json.
    Path root=Files.createTempDirectory("st-route-cra");
    Files.createDirectories(root.resolve("app/src"));
    Files.writeString(root.resolve("pom.xml"),"<project><dependency>spring-boot-starter-web</dependency></project>");
    Files.writeString(root.resolve("app/package.json"),"{\"dependencies\":{\"react\":\"^18.2.0\",\"react-router-dom\":\"^6.8.0\"}}");
    Files.writeString(root.resolve("app/src/App.js"),"import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';\nimport Home from './Home';\nimport GroupList from './GroupList';\n"
        +"const App = () => <Router><Routes><Route exact path=\"/\" element={<Home/>}/><Route path=\"/groups\" element={<GroupList/>}/></Routes></Router>;\nexport default App;");
    Files.writeString(root.resolve("app/src/Home.js"),"import { Link } from 'react-router-dom'; const Home = () => <Link to=\"/groups\">Manage</Link>; export default Home;");
    Files.writeString(root.resolve("app/src/GroupList.js"),"const GroupList = () => <h2>Groups</h2>; export default GroupList;");
    var graph=new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    var routes=graph.nodes().stream().filter(n->n.type()==ApplicationGraph.NodeType.SCREEN).map(n->n.attributes().get("route")).sorted().toList();
    assertEquals(java.util.List.of("/","/groups"),routes);
    var names=new java.util.HashMap<String,String>();graph.nodes().forEach(n->names.put(n.id(),n.name()));
    assertTrue(graph.relationships().stream().anyMatch(e->e.type()==ApplicationGraph.EdgeType.NAVIGATES_TO&&"Manage".equals(names.get(e.from()))&&"groups".equals(names.get(e.to()))),graph.relationships().toString());
  }
  @Test void templateOnlyProjectUsesTemplateScreens() throws Exception {
    Path root=Files.createTempDirectory("st-route-thymeleaf");
    Files.createDirectories(root.resolve("src/main/resources/templates"));
    Files.writeString(root.resolve("pom.xml"),"<project><dependency>spring-boot-starter-thymeleaf</dependency></project>");
    Files.writeString(root.resolve("src/main/resources/templates/owners.html"),"<html><body><a th:href=\"@{/owners/new}\">Add</a></body></html>");
    var graph=new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    assertTrue(graph.nodes().stream().anyMatch(n->n.type()==ApplicationGraph.NodeType.SCREEN&&"src/main/resources/templates/owners.html".equals(n.attributes().get("view"))));
  }
}
