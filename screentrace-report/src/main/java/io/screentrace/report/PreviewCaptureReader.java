package io.screentrace.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.GraphIntegrityValidator;
import io.screentrace.core.PreviewModel;
import io.screentrace.core.PreviewModel.*;
import io.screentrace.scanner.RealPaths;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.regex.Pattern;

/** Reads the WP6 contract without dropping unmatched elements or overflowing style data. */
final class PreviewCaptureReader {
  /**
   * Largest element-styles.json read; larger captures are reported, not read (ADR 0149). The bytes
   * are parsed directly, without first building a String of the whole file (R63).
   */
  static final long MAX_STYLE_BYTES = 256L * 1024 * 1024;

  /** The limit in effect; {@code -Dscreentrace.preview.maxStyleBytes} can lower or raise it. */
  static long maxStyleBytes() {
    return Long.getLong("screentrace.preview.maxStyleBytes", MAX_STYLE_BYTES);
  }

  private final ObjectMapper json = new ObjectMapper();

  PreviewModel read(ApplicationGraph graph, PreviewModel baseline, Path output) throws IOException {
    GraphIntegrityValidator.requireAnalysis(graph);
    var data =
        json.readTree(
            SafeProjectFiles.readBytesLimited(
                output, output.resolve("static-preview/element-styles.json"), maxStyleBytes()));
    if (!"2".equals(data.path("version").asText())
        || !"2.2".equals(data.path("schemaVersion").asText()))
      throw new IOException("Preview capture requires version 2 / schema 2.2");
    var rawStyles = dictionaries(data.path("styles"));
    var styles = new TreeMap<String, Map<String, String>>();
    var styleIds = new HashMap<String, String>();
    for (var entry : rawStyles.entrySet()) {
      var normalized = normalizeResources(entry.getValue(), output);
      String id = normalized.equals(entry.getValue()) ? entry.getKey() : styleHash(normalized);
      styleIds.put(entry.getKey(), id);
      styles.put(id, normalized);
    }
    var defaults = dictionaries(data.path("defaults"));
    for (var entry : defaults.entrySet())
      entry.setValue(normalizeResources(entry.getValue(), output));
    var screens = new ArrayList<PreviewScreen>();
    var elements = new ArrayList<PreviewElement>();
    var nodes = new HashMap<String, ApplicationGraph.GraphNode>();
    graph.nodes().forEach(n -> nodes.put(n.id(), n));
    // Components each screen CONTAINS, and those components by expansion anchor (sorted IDs), built
    // once instead of rescanning every relationship and node for each captured element (RV-702;
    // a 300-screen capture took 140 s here).
    var owned = new HashMap<String, Set<String>>();
    for (var e : graph.relationships())
      if (e.type() == ApplicationGraph.EdgeType.CONTAINS)
        owned.computeIfAbsent(e.from(), k -> new HashSet<>()).add(e.to());
    var anchored = new HashMap<String, Map<String, List<String>>>();
    var byScreen = new TreeMap<String, PreviewScreen>();
    baseline.screens().forEach(s -> byScreen.put(s.graphScreenId(), s));
    graph.nodes().stream()
        .filter(n -> n.type() == ApplicationGraph.NodeType.SCREEN)
        .forEach(
            n -> byScreen.putIfAbsent(n.id(), new PreviewScreen(n.id(), null, null, 1440, 900)));
    for (var screen : byScreen.values()) {
      var captured = data.path("screens").path(screen.graphScreenId());
      if (captured.isMissingNode()) {
        var diagnostic =
            new PreviewDiagnostic(
                "PREVIEW_CAPTURE_MISSING", screen.graphScreenId(), "未取得完整預覽資料", Map.of());
        screens.add(
            new PreviewScreen(
                screen.graphScreenId(),
                screen.staticDocument(),
                screen.screenshot(),
                screen.width(),
                screen.height(),
                new Rendering("skipped", diagnostic.message()),
                List.of(),
                null,
                List.of(diagnostic),
                screen.previewState()));
        continue;
      }
      for (var element : captured.path("elements")) {
        String styleId = optional(element, "styleId"), defaultId = optional(element, "defaultId");
        if (styleId == null
            || defaultId == null
            || !styleIds.containsKey(styleId)
            || !defaults.containsKey(defaultId))
          throw new IOException("Dangling preview style/default reference");
        var candidates = strings(element.path("graphComponentCandidates"));
        Set<String> screenOwned = owned.getOrDefault(screen.graphScreenId(), Set.of());
        for (String id : candidates) {
          if (!nodes.containsKey(id) || !screenOwned.contains(id))
            throw new IOException("Preview component does not belong to its screen");
        }
        String componentId = optional(element, "graphComponentId");
        String matchBasis = optional(element, "matchBasis"),
            anchor = optional(element, "expansionAnchor"),
            unmappedReason = optional(element, "unmappedReason");
        if (unmappedReason != null
            && (!Set.of(
                        "NO_GRAPH_COMPONENT",
                        "AMBIGUOUS_CANDIDATES",
                        "ANCHOR_MISSING",
                        "DYNAMIC_OR_UNRESOLVED_SOURCE",
                        "OTHER")
                    .contains(unmappedReason)
                || !Set.of("a", "button", "form", "select", "input", "textarea")
                    .contains(element.path("tag").asText())
                || !Set.of("UNRESOLVED", "AMBIGUOUS")
                    .contains(element.path("componentResolution").asText())
                || componentId != null)) throw new IOException("Invalid preview unmappedReason");
        if (matchBasis != null && !Set.of("ANCHOR", "HEURISTIC").contains(matchBasis))
          throw new IOException("Invalid preview matchBasis");
        if ("ANCHOR".equals(matchBasis)) {
          var byAnchor =
              anchored.computeIfAbsent(
                  screen.graphScreenId(),
                  id -> {
                    var result = new HashMap<String, List<String>>();
                    for (String component : screenOwned) {
                      var node = nodes.get(component);
                      if (node != null
                          && node.type() == ApplicationGraph.NodeType.COMPONENT
                          && node.attributes().get("expansionAnchor") != null)
                        result
                            .computeIfAbsent(
                                node.attributes().get("expansionAnchor"), k -> new ArrayList<>())
                            .add(component);
                    }
                    result.values().forEach(list -> list.sort(null));
                    return result;
                  });
          List<String> expected =
              anchor == null ? List.of() : byAnchor.getOrDefault(anchor, List.of());
          if (expected.isEmpty() || !expected.equals(candidates.stream().sorted().toList()))
            throw new IOException("Invalid preview anchor candidates");
          String resolution = element.path("componentResolution").asText();
          if (!resolution.equals(expected.size() == 1 ? "INFERRED" : "AMBIGUOUS")
              || (expected.size() == 1
                  ? !expected.get(0).equals(componentId)
                  : componentId != null))
            throw new IOException("Invalid preview anchor resolution");
        }
        if (componentId != null && (candidates.size() != 1 || !candidates.contains(componentId)))
          throw new IOException("Invalid preview component resolution");
        var bounds = element.path("bounds");
        var source = element.path("source");
        elements.add(
            new PreviewElement(
                screen.graphScreenId(),
                element.path("path").asText(),
                element.path("tag").asText(),
                optional(element, "id"),
                optional(element, "name"),
                optional(element, "className"),
                element.path("text").asText(),
                new RenderedBounds(
                    bounds.path("x").asDouble(),
                    bounds.path("y").asDouble(),
                    bounds.path("width").asDouble(),
                    bounds.path("height").asDouble()),
                styleIds.get(styleId),
                defaultId,
                componentId,
                candidates,
                element.path("componentResolution").asText(),
                strings(element.path("conditions")),
                source.isObject()
                    ? new ApplicationGraph.SourceLocation(
                        source.path("file").asText(), source.path("line").asInt())
                    : null,
                anchor,
                matchBasis,
                unmappedReason));
      }
      String thumbnail = optional(captured, "thumbnail");
      if (thumbnail != null) validateThumbnail(thumbnail);
      screens.add(
          new PreviewScreen(
              screen.graphScreenId(),
              screen.staticDocument(),
              screen.screenshot(),
              captured.path("width").asInt(screen.width()),
              captured.path("height").asInt(screen.height()),
              new Rendering(
                  captured.path("rendering").path("mode").asText("skipped"),
                  optional(captured.path("rendering"), "diagnostic")),
              strings(captured.path("dynamicExpressions")),
              thumbnail,
              diagnostics(captured.path("diagnostics")),
              screen.previewState()));
    }
    return new PreviewModel(
        "2",
        screens,
        baseline.components(),
        elements,
        styles,
        defaults,
        diagnostics(data.path("diagnostics")));
  }

  /**
   * Capture writes a resource under the analysis output as {@code st-preview-file:} plus its path
   * relative to the output (HC-009), so element-styles.json holds no local path; older captures
   * still hold absolute {@code file:} URLs. Both forms go through the same boundary check below.
   */
  private static final String OUTPUT_RELATIVE = "st-preview-file:";

  // Computed CSS URLs are browser-serialized URI tokens; target CSS is never evaluated here.
  private static final Pattern FILE_URI =
      Pattern.compile(
          "(?i)\"((?:file:/+|st-preview-file:)[^\"]+)\"|'((?:file:/+|st-preview-file:)[^']+)'"
              + "|((?:file:/+|st-preview-file:)[^\\s\"'()]+)");

  private Map<String, String> normalizeResources(Map<String, String> values, Path output)
      throws IOException {
    var result = new TreeMap<String, String>();
    Path root = output.toRealPath();
    for (var entry : values.entrySet()) {
      var matcher = FILE_URI.matcher(entry.getValue());
      var text = new StringBuffer();
      while (matcher.find()) {
        String stable;
        try {
          String raw =
              matcher.group(1) != null
                  ? matcher.group(1)
                  : matcher.group(2) != null ? matcher.group(2) : matcher.group(3);
          URI uri = resourceUri(raw, output);
          URI location = new URI(uri.getScheme(), uri.getAuthority(), uri.getPath(), null, null);
          Path resource = Path.of(location);
          Path realResource = RealPaths.resolveAllowMissing(resource);
          if (!realResource.startsWith(root))
            throw PreviewResourceBoundaryException.outside(resource);
          // A URI preserves escaped spaces, delimiters and Unicode without exposing the local root.
          String relative =
              root.relativize(realResource).toString().replace(java.io.File.separatorChar, '/');
          stable =
              "st-preview-resource:"
                  + new URI(null, null, relative, uri.getQuery(), uri.getFragment())
                      .toASCIIString();
        } catch (PreviewResourceBoundaryException unsafe) {
          throw unsafe;
        } catch (Exception invalid) {
          // Do not include the URI or its exception (both could disclose a local path).
          throw PreviewResourceBoundaryException.invalid();
        }
        String quote = matcher.group(1) != null ? "\"" : matcher.group(2) != null ? "'" : "";
        matcher.appendReplacement(
            text, java.util.regex.Matcher.quoteReplacement(quote + stable + quote));
      }
      matcher.appendTail(text);
      result.put(entry.getKey(), text.toString());
    }
    return result;
  }

  /** Resolves an output-relative reference against the output; it may not name another root. */
  private static URI resourceUri(String raw, Path output) {
    if (!raw.regionMatches(true, 0, OUTPUT_RELATIVE, 0, OUTPUT_RELATIVE.length()))
      return URI.create(raw);
    URI relative = URI.create(raw.substring(OUTPUT_RELATIVE.length()));
    if (relative.isAbsolute()
        || relative.getRawAuthority() != null
        || relative.getRawPath() == null
        || relative.getRawPath().startsWith("/"))
      throw new IllegalArgumentException("Output-relative resource is not a relative path");
    String base = output.toAbsolutePath().toUri().toString();
    return URI.create(base.endsWith("/") ? base : base + "/").resolve(relative);
  }

  private String styleHash(Map<String, String> values) throws IOException {
    try {
      return "style:"
          + HexFormat.of()
              .formatHex(
                  MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(values)));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }

  private static void validateThumbnail(String thumbnail) throws IOException {
    try {
      if (!thumbnail.startsWith("data:image/png;base64,")) throw new IllegalArgumentException();
      byte[] png =
          Base64.getDecoder().decode(thumbnail.substring("data:image/png;base64,".length()));
      byte[] signature = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};
      if (png.length < 24 || !Arrays.equals(signature, Arrays.copyOf(png, 8)))
        throw new IllegalArgumentException();
      int width = ByteBuffer.wrap(png, 16, 4).getInt(),
          height = ByteBuffer.wrap(png, 20, 4).getInt();
      if (width < 1 || width > 640 || height < 1) throw new IllegalArgumentException();
    } catch (IllegalArgumentException e) {
      throw new IOException("Invalid preview thumbnail (PNG, width 1..640 required)", e);
    }
  }

  private static String optional(JsonNode node, String key) {
    return node.hasNonNull(key) ? node.path(key).asText() : null;
  }

  private static List<String> strings(JsonNode node) {
    var result = new ArrayList<String>();
    node.forEach(n -> result.add(n.asText()));
    return result;
  }

  private static Map<String, Map<String, String>> dictionaries(JsonNode node) {
    var result = new TreeMap<String, Map<String, String>>();
    node.fields()
        .forEachRemaining(
            e -> {
              var values = new TreeMap<String, String>();
              e.getValue()
                  .fields()
                  .forEachRemaining(v -> values.put(v.getKey(), v.getValue().asText()));
              result.put(e.getKey(), values);
            });
    return result;
  }

  private static List<PreviewDiagnostic> diagnostics(JsonNode node) {
    var result = new ArrayList<PreviewDiagnostic>();
    node.forEach(
        n -> {
          var details = new TreeMap<String, String>();
          n.fields()
              .forEachRemaining(
                  e -> {
                    if (!Set.of("code", "screenId", "message").contains(e.getKey()))
                      details.put(e.getKey(), e.getValue().asText());
                  });
          result.add(
              new PreviewDiagnostic(
                  n.path("code").asText(),
                  optional(n, "screenId"),
                  n.path("message").asText(),
                  details));
        });
    return result;
  }
}
