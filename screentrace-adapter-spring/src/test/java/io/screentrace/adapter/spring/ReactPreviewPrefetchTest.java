package io.screentrace.adapter.spring;

import io.screentrace.parser.jsp.ReactGraphContribution;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

/** R34: the React preview pass started before the graph pass writes exactly what the pass run afterwards writes. */
class ReactPreviewPrefetchTest {
 @TempDir Path root;
 @TempDir Path afterwards;
 @TempDir Path alongside;

 @Test void aPreviewPassStartedAlongsideTheGraphPassWritesTheSamePreview() throws Exception {
  Files.writeString(root.resolve("App.tsx"),"""
   import {Routes,Route,Link} from 'react-router-dom';
   function Home(){return <main><h1>Home</h1><Link to="/next">Next</Link></main>;}
   function Next(){return <form><button>Save</button></form>;}
   export default function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/next" element={<Next/>}/></Routes>;}
   """);
  var inventory=new ProjectScanner().scan(root);
  ReactGraphContribution.writePreview(inventory,afterwards);
  try(var prefetch=ReactGraphContribution.prefetchPreview(inventory)){
   assertNotNull(prefetch.result(),"a React project starts the preview pass");
   new SpringBootAnalyzer().analyze(inventory);
   ReactGraphContribution.writePreview(inventory,alongside,prefetch);
  }
  var file=Path.of("static-preview","react-preview.json");
  assertTrue(Files.isRegularFile(afterwards.resolve(file)));
  assertArrayEquals(Files.readAllBytes(afterwards.resolve(file)),Files.readAllBytes(alongside.resolve(file)));
 }

 @Test void anUnusedPreviewPassIsStoppedAndAProjectWithoutReactStartsNone() throws Exception {
  Files.writeString(root.resolve("App.tsx"),"export default function App(){return <p>Only</p>;}");
  var prefetch=ReactGraphContribution.prefetchPreview(new ProjectScanner().scan(root));
  assertDoesNotThrow(prefetch::close);
  assertTrue(prefetch.result()==null||prefetch.result().isDone(),"closing stops the pass");
  Path plain=Files.createDirectory(root.resolve("plain"));
  Files.writeString(plain.resolve("index.html"),"<p>static</p>");
  assertSame(ReactGraphContribution.PreviewPrefetch.NONE,ReactGraphContribution.prefetchPreview(new ProjectScanner().scan(plain)));
 }
}
