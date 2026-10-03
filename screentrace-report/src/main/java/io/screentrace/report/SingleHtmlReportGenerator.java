package io.screentrace.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import io.screentrace.core.*;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;

/** Strict modern data injection; UI is compiled independently in screentrace-viewer. */
public final class SingleHtmlReportGenerator {
  private final ObjectMapper json=new ObjectMapper().enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
  public record Output(Path path,long bytes,boolean warning) {}
  public static boolean sizeWarning(long bytes){return bytes>100_000_000;}
  public Output generate(ApplicationGraph graph,PreviewModel preview,Map<String,String> documents,Map<String,Object> manifest,Path output) throws IOException {
    return generate(graph,preview,documents,manifest,output,null);
  }
  public Output generate(ApplicationGraph graph,PreviewModel preview,Map<String,String> documents,Map<String,Object> manifest,Path output,ComponentLibrary library) throws IOException {
    GraphIntegrityValidator.requireAnalysis(graph);
    String script=resource("viewer.js"),hash=resource("viewer.sha256").trim();
    if(!hash.equals(Base64.getEncoder().encodeToString(digest(script))))throw new IOException("Viewer bundle hash mismatch; rebuild screentrace-viewer");
    var data=new TreeMap<String,Object>();data.put("graph",graph);data.put("preview",preview);data.put("documents",new TreeMap<>(documents));data.put("manifest",new TreeMap<>(manifest));
    if(library!=null){ComponentLibrary.validate(json.writeValueAsBytes(library.manifest()));if(!library.sha256().matches("[a-f0-9]{64}"))throw new IllegalArgumentException("manifest_sha256 格式錯誤");data.put("componentLibrary",library);}
    data.put("toolVersion",resource("viewer.version").trim());
    data.put("fingerprint",HexFormat.of().formatHex(digest(json.writeValueAsString(graph))));
    String encoded=json.writeValueAsString(data).replace("<","\\u003c").replace("\u2028","\\u2028").replace("\u2029","\\u2029");
    String csp="default-src 'none'; script-src 'sha256-"+hash+"'; style-src 'unsafe-inline' data:; img-src data:; font-src data:; connect-src 'none'; frame-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
    String html=resource("template.html").replace("<!--ST_CSP-->",csp).replace("<!--ST_STYLE-->",resource("viewer.css")).replace("<!--ST_DATA-->",encoded).replace("<!--ST_SCRIPT-->",script);
    Files.createDirectories(output);Path directory=SafeProjectFiles.requireWritePathWithin(output,output.resolve("report"));Files.createDirectories(directory);
    Path file=SafeProjectFiles.requireWritePathWithin(output,directory.resolve("screentrace-report.html"));Files.writeString(file,html,StandardCharsets.UTF_8);
    long bytes=Files.size(file);boolean warning=sizeWarning(bytes);
    var size=new TreeMap<String,Object>();size.put("file","report/screentrace-report.html");size.put("bytes",bytes);size.put("warning",warning);size.put("message",warning?"單一 HTML 超過 100 MB，仍完整產出":"單一 HTML 大小未超過 100 MB");
    Files.writeString(SafeProjectFiles.requireWritePathWithin(output,output.resolve("report-size.json")),json.writeValueAsString(size));
    return new Output(file,bytes,warning);
  }
  private static byte[] digest(String text){try{return MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));}catch(NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}}
  private static String resource(String name) throws IOException {try(var input=SingleHtmlReportGenerator.class.getResourceAsStream("/viewer/"+name)){if(input==null)throw new IOException("Missing viewer build; run npm --prefix screentrace-viewer run build");return new String(input.readAllBytes(),StandardCharsets.UTF_8);}}
}
