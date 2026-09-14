package io.screentrace.core;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.*;

/** Editable, framework-neutral visual projection of an ApplicationGraph. */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record PrototypeModel(String version, List<PrototypeScreen> screens, List<PrototypeComponent> components) {
  public PrototypeModel { screens = screens.stream().sorted().toList(); components = components.stream().sorted().toList(); }
  public record PrototypeScreen(String id, String graphScreenId, String name, String route) implements Comparable<PrototypeScreen> { public int compareTo(PrototypeScreen other) { return id.compareTo(other.id); } }
  public record PrototypeComponent(String id, String screenId, String graphComponentId, String type, String label, Bounds bounds, Map<String, String> style, PrototypeAction action, ApplicationGraph.SourceLocation source, ApplicationGraph.Confidence confidence) implements Comparable<PrototypeComponent> { public PrototypeComponent { style = style == null ? Map.of() : Map.copyOf(new TreeMap<>(style)); } public int compareTo(PrototypeComponent other) { return id.compareTo(other.id); } }
  public record Bounds(int x, int y, int width, int height) { }
  public record PrototypeAction(String type, String targetScreenId, String targetEndpointId) { }
}
