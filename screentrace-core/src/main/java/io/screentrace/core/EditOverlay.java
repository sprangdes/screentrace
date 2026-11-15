package io.screentrace.core;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.*;

/** User-owned target-state changes; never alters source-derived graph or prototype data. */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record EditOverlay(String version, List<EditOperation> operations) {
  public EditOverlay {
    operations = operations == null ? List.of() : List.copyOf(operations);
  }

  public record EditOperation(
      String screenId, String componentId, Operation operation, Map<String, Object> changes) {
    public EditOperation {
      // Sorted for deterministic JSON; a null value is kept (RV-115).
      changes =
          changes == null
              ? Map.of()
              : java.util.Collections.unmodifiableMap(new java.util.TreeMap<>(changes));
    }
  }

  public enum Operation {
    HIDE,
    UPDATE,
    MOVE,
    ADD
  }
}
