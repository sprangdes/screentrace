package io.screentrace.report;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PreviewResourceDeterminismTest {
 @TempDir Path temp;
 private final ObjectMapper json=new ObjectMapper();
 private ApplicationGraph graph(){var source=new SourceLocation("page.jsp",1);var evidence=List.of(new AnalysisEvidence(source,"SyntheticFixture",ResolutionStatus.CONFIRMED,null));return new ApplicationGraph(new Application("resource fixture",".",List.of()),List.of(new GraphNode("screen",NodeType.SCREEN,"資源測試",Map.of("view","page.jsp"),source,Confidence.CONFIRMED,evidence)),List.of(),List.of(),List.of(),"2.2",List.of(),List.of());}
 private Path repository(){for(Path p=Path.of("").toAbsolutePath();p!=null;p=p.getParent())if(Files.exists(p.resolve("pom.xml"))&&Files.isDirectory(p.resolve("screentrace-core")))return p;throw new IllegalStateException();}
 private Path fixture(Path output) throws Exception {
  Path project=temp.resolve("project-root");Files.createDirectories(project);Path source=project.resolve("page.jsp");if(!Files.exists(source))Files.writeString(source,"<html><body><div style='background-image:url(assets/image.svg)'>Fixture</div></body></html>");
  Files.createDirectories(output.resolve("static-preview/assets"));
  Files.copy(source,output.resolve("static-preview/page.html"));
  Files.writeString(output.resolve("static-preview/assets/image.svg"),"<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'><rect width='1' height='1' fill='red'/></svg>");
  Files.writeString(output.resolve("static-preview/manifest.json"),"{\"screen\":\"static-preview/page.html\"}");
  String value="url(\""+output.resolve("static-preview/assets/image.svg").toUri()+"\")";
  var styles=new TreeMap<String,String>();styles.put("background-image",value);styles.put("border-image-source",value);styles.put("cursor",value+", auto");styles.put("list-style-image",value);styles.put("mask-image",value+", "+value);
  String style="style:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(styles)));
  var element=Map.of("path","body>div[1]","tag","div","text","Fixture","styleId",style,"defaultId","html:div","graphComponentCandidates",List.of(),"componentResolution","UNRESOLVED");
  var data=Map.of("version","2","schemaVersion","2.2","styles",Map.of(style,styles),"defaults",Map.of("html:div",Map.of("background-image",value)),"screens",Map.of("screen",Map.of("elements",List.of(element),"rendering",Map.of("mode","reconstructed"))),"diagnostics",List.of());
  Path capture=output.resolve("static-preview/element-styles.json");json.writeValue(capture.toFile(),data);
  var process=new ProcessBuilder("node",repository().resolve("screentrace-capture/pack-preview.mjs").toString(),output.toString()).redirectErrorStream(true).start();String log=new String(process.getInputStream().readAllBytes());assertEquals(0,process.waitFor(),log);
  return capture;
 }
 @Test void sameSyntheticProjectInDifferentOutputDirectoriesHasIdenticalHtmlStyleIdsAndPackedDocuments() throws Exception {
  Path first=temp.resolve("output one"),second=temp.resolve("output two");var a=fixture(first);var b=fixture(second);byte[] rawA=Files.readAllBytes(a),rawB=Files.readAllBytes(b);
  var writer=new SingleHtmlAnalysisWriter();var firstHtml=writer.generate(graph(),first);var secondHtml=writer.generate(graph(),second);
  assertArrayEquals(Files.readAllBytes(first.resolve("viewer-documents.json")),Files.readAllBytes(second.resolve("viewer-documents.json")));
  var pa=json.readTree(first.resolve("preview-model.json").toFile());var pb=json.readTree(second.resolve("preview-model.json").toFile());assertEquals(pa.path("elements").get(0).path("styleId"),pb.path("elements").get(0).path("styleId"));assertEquals(pa.path("styles"),pb.path("styles"));assertEquals(pa.path("defaults"),pb.path("defaults"));assertArrayEquals(Files.readAllBytes(firstHtml.path()),Files.readAllBytes(secondHtml.path()));
  assertArrayEquals(rawA,Files.readAllBytes(a));assertArrayEquals(rawB,Files.readAllBytes(b));
 }
 @Test void finalHtmlContainsNoActualOutputProjectOrHomeAbsolutePathsOrPlatformFileUrls() throws Exception {
  Path project=temp.resolve("project-root"),output=temp.resolve("output-private");Files.createDirectories(project);fixture(output);String html=Files.readString(new SingleHtmlAnalysisWriter().generate(graph(),output).path());
  for(String forbidden:List.of(output.toString(),project.toString(),System.getProperty("user.home"),"file://","/Users/","C:\\Users\\","C:\\\\Users\\\\"))assertFalse(html.contains(forbidden),"Leaked local path category: "+(forbidden.startsWith("file")?"file URL":"absolute path"));
 }
}
