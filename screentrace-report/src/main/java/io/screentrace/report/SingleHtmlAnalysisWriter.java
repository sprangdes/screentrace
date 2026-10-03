package io.screentrace.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import io.screentrace.core.*;
import io.screentrace.core.PreviewModel.*;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;

/** Data assembly only. Rendering and review are owned by screentrace-viewer. */
public final class SingleHtmlAnalysisWriter {
  private final ObjectMapper json = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
  /** Save canonical strict analysis before the source-only capture tools read it. */
  public void prepare(ApplicationGraph graph, Path output) throws IOException {
    GraphIntegrityValidator.requireAnalysis(graph);
    Files.createDirectories(output);
    write(output, "application-graph.json", graph);
    write(output, "prototype-model.json", new PrototypeModelGenerator().generate(graph));

  }
  public SingleHtmlReportGenerator.Output generate(Path output) throws IOException {return generate(output,null);}
  public SingleHtmlReportGenerator.Output generate(Path output,ComponentLibrary library) throws IOException {
    var data = json.readTree(SafeProjectFiles.readUtf8Limited(output, output.resolve("application-graph.json"),
        SafeProjectFiles.MAX_PROJECT_TOTAL_BYTES));
    String version = data.path("schemaVersion").asText("未設定");
    if (!ApplicationGraph.BEHAVIOR_SCHEMA_VERSION.equals(version))
      throw new IllegalArgumentException("檢視器只接受 schema 2.2，收到 " + version);
    var graph = json.treeToValue(data, ApplicationGraph.class);
    return generate(graph, output,library);
  }
  public SingleHtmlReportGenerator.Output generate(ApplicationGraph graph, Path output) throws IOException {return generate(graph,output,null);}
  public SingleHtmlReportGenerator.Output generate(ApplicationGraph graph,Path output,ComponentLibrary library) throws IOException {
    prepare(graph, output);
    var screens = new ArrayList<PreviewScreen>();
    Map<String,String> documents = new TreeMap<>();
    Map<String,Object> manifest = new TreeMap<>();
    if (Files.exists(output.resolve("static-preview/manifest.json"), LinkOption.NOFOLLOW_LINKS)) {
      var paths = read(output, "static-preview/manifest.json");
      for (var node : graph.nodes()) if (node.type() == ApplicationGraph.NodeType.SCREEN)
        screens.add(new PreviewScreen(node.id(), paths.path(node.id()).isTextual() ? paths.path(node.id()).asText() : null,
            null, 1440, 900, new Rendering("skipped", "未取得完整預覽資料"), List.of(), null, List.of()));
    } else for (var node : graph.nodes()) if (node.type() == ApplicationGraph.NodeType.SCREEN)
      screens.add(new PreviewScreen(node.id(), null, null, 1440, 900, new Rendering("skipped", "未取得重建預覽"), List.of(), null, List.of()));
    PreviewModel preview = new PreviewModel("2", screens, List.of());
    if (Files.exists(output.resolve("static-preview/element-styles.json"), LinkOption.NOFOLLOW_LINKS))
      preview = new PreviewCaptureReader().read(graph, preview, output);
    if (Files.exists(output.resolve("viewer-documents.json"), LinkOption.NOFOLLOW_LINKS)) {
      var packed = read(output, "viewer-documents.json");
      if (!"2.2".equals(packed.path("schemaVersion").asText())) throw new IOException("Packed preview requires schema 2.2");
      Set<String> ids = new HashSet<>(); graph.nodes().stream().filter(n -> n.type() == ApplicationGraph.NodeType.SCREEN).forEach(n -> ids.add(n.id()));
      packed.path("documents").fields().forEachRemaining(e -> { if (ids.contains(e.getKey())) documents.put(e.getKey(), e.getValue().asText()); });
      manifest.put("assets", json.convertValue(packed.path("assets"), Map.class));
      manifest.put("diagnostics", json.convertValue(packed.path("diagnostics"), List.class));
    }
    write(output, "preview-model.json", preview);
    return new SingleHtmlReportGenerator().generate(graph, preview, documents, manifest, output,library);
  }
  private com.fasterxml.jackson.databind.JsonNode read(Path root, String file) throws IOException {
    return json.readTree(SafeProjectFiles.readUtf8Limited(root, root.resolve(file), SafeProjectFiles.MAX_PROJECT_TOTAL_BYTES));
  }
  private void write(Path root, String file, Object value) throws IOException {
    json.writeValue(SafeProjectFiles.requireWritePathWithin(root, root.resolve(file)).toFile(), value);
  }
}
