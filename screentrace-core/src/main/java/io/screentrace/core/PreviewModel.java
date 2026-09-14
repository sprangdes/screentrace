package io.screentrace.core;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Framework-neutral, captured preview evidence consumed by the interactive report. */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record PreviewModel(String version, List<PreviewScreen> screens, List<PreviewComponent> components) {
  public PreviewModel {
    screens = screens == null ? List.of() : screens.stream().sorted().toList();
    components = components == null ? List.of() : components.stream().sorted().toList();
  }

  public record PreviewScreen(String graphScreenId, String staticDocument, String screenshot, int width, int height)
      implements Comparable<PreviewScreen> {
    @Override public int compareTo(PreviewScreen other) { return graphScreenId.compareTo(other.graphScreenId); }
  }

  public record PreviewComponent(String id, String graphComponentId, String graphScreenId, String type, String label,
      String target, String targetScreenId, PrototypeModel.Bounds bounds, Map<String, String> css)
      implements Comparable<PreviewComponent> {
    public PreviewComponent { css = css == null ? Map.of() : Map.copyOf(new TreeMap<>(css)); }
    @Override public int compareTo(PreviewComponent other) { return id.compareTo(other.id); }
  }
}
