package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph.NodeType;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class R18StylesheetPackageTest {
 @TempDir Path root;
 private void source() throws Exception {
  Files.createDirectories(root.resolve("src"));
  Files.writeString(root.resolve("src/main.tsx"),"""
   import 'pkg-a/dist/a.css';
   import '@scope/pkg-b/b.css';
   import {Routes,Route} from 'react-router-dom';
   function Page(){return <h1>Styles</h1>;}
   export default function App(){return <Routes><Route path="/" element={<Page/>}/></Routes>;}
   """);
 }
 @Test void reportsMissingPackagesAtImportsAndMarksScreens() throws Exception {
  source();var graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));
  var diagnostics=graph.diagnostics().stream().filter(d->d.code().equals("STYLESHEET_PACKAGE_MISSING")).toList();
  assertEquals(2,diagnostics.size());assertEquals(java.util.Set.of(1,2),diagnostics.stream().map(d->d.source().line()).collect(java.util.stream.Collectors.toSet()));
  var screens=graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN&&n.attributes().getOrDefault("viewSources","").contains("src/main.tsx")).toList();
  assertFalse(screens.isEmpty());assertTrue(screens.stream().allMatch(n->"@scope/pkg-b|pkg-a".equals(n.attributes().get("missingStylePackages"))));
 }
 @Test void installedPackagesAndRelativeStylesAreNotReported() throws Exception {
  source();Files.createDirectories(root.resolve("node_modules/pkg-a"));Files.createDirectories(root.resolve("node_modules/@scope/pkg-b"));
  var graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));assertTrue(graph.diagnostics().stream().noneMatch(d->d.code().equals("STYLESHEET_PACKAGE_MISSING")));
  assertTrue(graph.nodes().stream().filter(n->n.type()==NodeType.SCREEN).noneMatch(n->n.attributes().containsKey("missingStylePackages")));
  Files.writeString(root.resolve("src/main.tsx"),"import './local.css'; import '/abs.css'; export default function App(){return <h1>Ok</h1>;}");
  graph=new SpringBootAnalyzer().analyze(new ProjectScanner().scan(root));assertTrue(graph.diagnostics().stream().noneMatch(d->d.code().equals("STYLESHEET_PACKAGE_MISSING")));
 }
}
