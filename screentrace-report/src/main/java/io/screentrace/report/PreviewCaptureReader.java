package io.screentrace.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.GraphIntegrityValidator;
import io.screentrace.core.PreviewModel;
import io.screentrace.core.PreviewModel.*;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.net.URI;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.regex.Pattern;
import java.nio.file.Path;
import java.util.*;

/** Reads the WP6 contract without dropping unmatched elements or overflowing style data. */
final class PreviewCaptureReader {
  private final ObjectMapper json = new ObjectMapper();
  PreviewModel read(ApplicationGraph graph, PreviewModel baseline, Path output) throws IOException {
    GraphIntegrityValidator.requireAnalysis(graph);
    var data = json.readTree(SafeProjectFiles.readUtf8Limited(output, output.resolve("static-preview/element-styles.json"), 32L * 1024 * 1024));
    if (!"2".equals(data.path("version").asText()) || !"2.2".equals(data.path("schemaVersion").asText()))
      throw new IOException("Preview capture requires version 2 / schema 2.2");
    var rawStyles = dictionaries(data.path("styles"));
    var styles = new TreeMap<String,Map<String,String>>();
    var styleIds = new HashMap<String,String>();
    for (var entry : rawStyles.entrySet()) {
      var normalized = normalizeResources(entry.getValue(), output);
      String id = normalized.equals(entry.getValue()) ? entry.getKey() : styleHash(normalized);
      styleIds.put(entry.getKey(), id); styles.put(id, normalized);
    }
    var defaults = dictionaries(data.path("defaults"));
    for (var entry : defaults.entrySet()) entry.setValue(normalizeResources(entry.getValue(), output));
    var screens = new ArrayList<PreviewScreen>(); var elements = new ArrayList<PreviewElement>();
    var nodes = new HashMap<String, ApplicationGraph.GraphNode>(); graph.nodes().forEach(n -> nodes.put(n.id(), n));
    var byScreen = new TreeMap<String, PreviewScreen>();
    baseline.screens().forEach(s -> byScreen.put(s.graphScreenId(), s));
    graph.nodes().stream().filter(n -> n.type() == ApplicationGraph.NodeType.SCREEN).forEach(n ->
        byScreen.putIfAbsent(n.id(), new PreviewScreen(n.id(), null, null, 1440, 900)));
    for (var screen : byScreen.values()) {
      var captured = data.path("screens").path(screen.graphScreenId());
      if (captured.isMissingNode()) {
        var diagnostic = new PreviewDiagnostic("PREVIEW_CAPTURE_MISSING", screen.graphScreenId(), "未取得完整預覽資料", Map.of());
        screens.add(new PreviewScreen(screen.graphScreenId(), screen.staticDocument(), screen.screenshot(), screen.width(), screen.height(),
            new Rendering("skipped", diagnostic.message()), List.of(), null, List.of(diagnostic)));
        continue;
      }
      for (var element : captured.path("elements")) {
        String styleId = optional(element, "styleId"), defaultId = optional(element, "defaultId");
        if (styleId == null || defaultId == null || !styleIds.containsKey(styleId) || !defaults.containsKey(defaultId)) throw new IOException("Dangling preview style/default reference");
        var candidates = strings(element.path("graphComponentCandidates"));
        for (String id : candidates) {
          if (!nodes.containsKey(id) || graph.relationships().stream().noneMatch(e -> e.type() == ApplicationGraph.EdgeType.CONTAINS
              && e.from().equals(screen.graphScreenId()) && e.to().equals(id))) throw new IOException("Preview component does not belong to its screen");
        }
        String componentId = optional(element, "graphComponentId");
        if (componentId != null && (candidates.size() != 1 || !candidates.contains(componentId))) throw new IOException("Invalid preview component resolution");
        var bounds = element.path("bounds"); var source = element.path("source");
        elements.add(new PreviewElement(screen.graphScreenId(), element.path("path").asText(), element.path("tag").asText(), optional(element,"id"),
            optional(element,"name"), optional(element,"className"), element.path("text").asText(),
            new RenderedBounds(bounds.path("x").asDouble(),bounds.path("y").asDouble(),bounds.path("width").asDouble(),bounds.path("height").asDouble()),
            styleIds.get(styleId), defaultId, componentId, candidates, element.path("componentResolution").asText(), strings(element.path("conditions")),
            source.isObject() ? new ApplicationGraph.SourceLocation(source.path("file").asText(), source.path("line").asInt()) : null));
      }
      String thumbnail = optional(captured,"thumbnail"); if (thumbnail != null) validateThumbnail(thumbnail);
      screens.add(new PreviewScreen(screen.graphScreenId(), screen.staticDocument(), screen.screenshot(), captured.path("width").asInt(screen.width()),
          captured.path("height").asInt(screen.height()), new Rendering(captured.path("rendering").path("mode").asText("skipped"), optional(captured.path("rendering"),"diagnostic")),
          strings(captured.path("dynamicExpressions")), thumbnail, diagnostics(captured.path("diagnostics"))));
    }
    return new PreviewModel("2", screens, baseline.components(), elements, styles, defaults, diagnostics(data.path("diagnostics")));
  }
  // Computed CSS URLs are browser-serialized URI tokens; target CSS is never evaluated here.
  private static final Pattern FILE_URI = Pattern.compile("(?i)\"(file:/+[^\"]+)\"|'(file:/+[^']+)'|(file:/+[^\\s\"'()]+)");
  private Map<String,String> normalizeResources(Map<String,String> values, Path output) throws IOException {
    var result = new TreeMap<String,String>();
    Path root = output.toAbsolutePath().normalize();
    for (var entry : values.entrySet()) {
      var matcher = FILE_URI.matcher(entry.getValue()); var text = new StringBuffer();
      while (matcher.find()) {
        String stable;
        try {
          String raw = matcher.group(1) != null ? matcher.group(1) : matcher.group(2) != null ? matcher.group(2) : matcher.group(3);
          URI uri = URI.create(raw);
          URI location = new URI(uri.getScheme(), uri.getAuthority(), uri.getPath(), null, null);
          Path resource = Path.of(location).toAbsolutePath().normalize();
          if (!resource.startsWith(root)) throw new IllegalArgumentException();
          // A URI preserves escaped spaces, delimiters and Unicode without exposing the local root.
          String relative = root.relativize(resource).toString().replace(java.io.File.separatorChar, '/');
          stable = "st-preview-resource:" + new URI(null, null, relative, uri.getQuery(), uri.getFragment()).toASCIIString();
        } catch (Exception invalid) {
          // Do not include the URI or its exception (both could disclose a local path).
          throw new IOException("Preview local resource URL is invalid or outside the analysis output");
        }
        String quote = matcher.group(1) != null ? "\"" : matcher.group(2) != null ? "'" : "";
        matcher.appendReplacement(text, java.util.regex.Matcher.quoteReplacement(quote + stable + quote));
      }
      matcher.appendTail(text); result.put(entry.getKey(), text.toString());
    }
    return result;
  }
  private String styleHash(Map<String,String> values) throws IOException {
    try { return "style:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(values))); }
    catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
  }
  private static void validateThumbnail(String thumbnail) throws IOException {
    try {
      if (!thumbnail.startsWith("data:image/png;base64,")) throw new IllegalArgumentException();
      byte[] png = Base64.getDecoder().decode(thumbnail.substring("data:image/png;base64,".length()));
      byte[] signature = {(byte)137,80,78,71,13,10,26,10};
      if (png.length < 24 || !Arrays.equals(signature,Arrays.copyOf(png,8))) throw new IllegalArgumentException();
      int width = ByteBuffer.wrap(png,16,4).getInt(), height = ByteBuffer.wrap(png,20,4).getInt();
      if (width < 1 || width > 320 || height < 1) throw new IllegalArgumentException();
    } catch (IllegalArgumentException e) { throw new IOException("Invalid preview thumbnail (PNG, width 1..320 required)",e); }
  }
  private static String optional(JsonNode node, String key) { return node.hasNonNull(key) ? node.path(key).asText() : null; }
  private static List<String> strings(JsonNode node) { var result = new ArrayList<String>(); node.forEach(n -> result.add(n.asText())); return result; }
  private static Map<String,Map<String,String>> dictionaries(JsonNode node) {
    var result = new TreeMap<String,Map<String,String>>(); node.fields().forEachRemaining(e -> {
      var values = new TreeMap<String,String>(); e.getValue().fields().forEachRemaining(v -> values.put(v.getKey(),v.getValue().asText())); result.put(e.getKey(),values);
    }); return result;
  }
  private static List<PreviewDiagnostic> diagnostics(JsonNode node) {
    var result = new ArrayList<PreviewDiagnostic>(); node.forEach(n -> {
      var details = new TreeMap<String,String>(); n.fields().forEachRemaining(e -> { if (!Set.of("code","screenId","message").contains(e.getKey())) details.put(e.getKey(),e.getValue().asText()); });
      result.add(new PreviewDiagnostic(n.path("code").asText(),optional(n,"screenId"),n.path("message").asText(),details));
    }); return result;
  }
}
