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
