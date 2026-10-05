package io.screentrace.core;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Framework-neutral, complete rendered-element preview contract. */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record PreviewModel(String version, List<PreviewScreen> screens, List<PreviewComponent> components,
    List<PreviewElement> elements, Map<String, Map<String, String>> styles,
    Map<String, Map<String, String>> defaults, List<PreviewDiagnostic> diagnostics) {
  public PreviewModel {
    screens = screens == null ? List.of() : screens.stream().sorted().toList();
    components = components == null ? List.of() : components.stream().sorted().toList();
    elements = elements == null ? List.of() : List.copyOf(elements);
    styles = dictionaries(styles); defaults = dictionaries(defaults);
    diagnostics = diagnostics == null ? List.of() : List.copyOf(diagnostics);
  }
  /** Compatibility for the preview contract replaced by the WP7 viewer. */
  public PreviewModel(String version, List<PreviewScreen> screens, List<PreviewComponent> components) {
    this(version, screens, components, List.of(), Map.of(), Map.of(), List.of());
  }
  private static Map<String, Map<String, String>> dictionaries(Map<String, Map<String, String>> input) {
    var result = new TreeMap<String, Map<String, String>>();
    if (input != null) input.forEach((key, value) -> result.put(key, Collections.unmodifiableMap(new TreeMap<>(value))));
    return Collections.unmodifiableMap(result);
  }
  public record Rendering(String mode, String diagnostic) {}
  public record PreviewDiagnostic(String code, String screenId, String message, Map<String, String> details) {
    public PreviewDiagnostic { details = details == null ? Map.of() : Collections.unmodifiableMap(new TreeMap<>(details)); }
  }
  public record RenderedBounds(double x, double y, double width, double height) {}
  public record PreviewElement(String graphScreenId, String path, String tag, String id, String name,
      String className, String text, RenderedBounds bounds, String styleId, String defaultId,
      String graphComponentId, List<String> graphComponentCandidates, String componentResolution,
      List<String> conditions, ApplicationGraph.SourceLocation source,
      @JsonInclude(JsonInclude.Include.NON_EMPTY) String expansionAnchor,
      @JsonInclude(JsonInclude.Include.NON_EMPTY) String matchBasis,
      @JsonInclude(JsonInclude.Include.NON_EMPTY) String unmappedReason) {
    public PreviewElement(String graphScreenId,String path,String tag,String id,String name,String className,String text,
        RenderedBounds bounds,String styleId,String defaultId,String graphComponentId,List<String> graphComponentCandidates,
        String componentResolution,List<String> conditions,ApplicationGraph.SourceLocation source) {
      this(graphScreenId,path,tag,id,name,className,text,bounds,styleId,defaultId,graphComponentId,graphComponentCandidates,componentResolution,conditions,source,null,null,null);
    }
    public PreviewElement(String graphScreenId,String path,String tag,String id,String name,String className,String text,
        RenderedBounds bounds,String styleId,String defaultId,String graphComponentId,List<String> graphComponentCandidates,
        String componentResolution,List<String> conditions,ApplicationGraph.SourceLocation source,String expansionAnchor,String matchBasis) {
      this(graphScreenId,path,tag,id,name,className,text,bounds,styleId,defaultId,graphComponentId,graphComponentCandidates,componentResolution,conditions,source,expansionAnchor,matchBasis,null);
    }
    public PreviewElement {
      graphComponentCandidates = graphComponentCandidates == null ? List.of() : List.copyOf(graphComponentCandidates);
      conditions = conditions == null ? List.of() : List.copyOf(conditions);
    }
  }
  public record PreviewScreen(String graphScreenId, String staticDocument, String screenshot, int width, int height,
      Rendering rendering, List<String> dynamicExpressions, String thumbnail, List<PreviewDiagnostic> diagnostics)
      implements Comparable<PreviewScreen> {
    public PreviewScreen {
      dynamicExpressions = dynamicExpressions == null ? List.of() : List.copyOf(dynamicExpressions);
      diagnostics = diagnostics == null ? List.of() : List.copyOf(diagnostics);
    }
    public PreviewScreen(String graphScreenId, String staticDocument, String screenshot, int width, int height) {
      this(graphScreenId, staticDocument, screenshot, width, height, null, List.of(), null, List.of());
    }
    @Override public int compareTo(PreviewScreen other) { return graphScreenId.compareTo(other.graphScreenId); }
  }
  public record PreviewComponent(String id, String graphComponentId, String graphScreenId, String type, String label,
      String target, String targetScreenId, PrototypeModel.Bounds bounds, Map<String, String> css)
      implements Comparable<PreviewComponent> {
    public PreviewComponent { css = css == null ? Map.of() : Map.copyOf(new TreeMap<>(css)); }
    @Override public int compareTo(PreviewComponent other) { return id.compareTo(other.id); }
  }
}
