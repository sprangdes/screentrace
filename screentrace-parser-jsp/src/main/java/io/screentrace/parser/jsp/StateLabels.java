package io.screentrace.parser.jsp;

import com.fasterxml.jackson.databind.JsonNode;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.util.*;

/**
 * The words the project's own frontend shows for an enum's constants (ADR 0160). The AST tool
 * reports literal label groups (an object keyed by constants, {@code { value, label }} items, the
 * options of one select); a group belongs to an enum when at least two of its keys, and at least
 * half of them, are constants of that enum and of no other written enum. A constant gets a word
 * only when every group that names it agrees; a disagreement leaves the constant name alone.
 */
final class StateLabels {
  record Label(String text, SourceLocation source) {}

  static final StateLabels NONE = new StateLabels(Map.of());

  private final Map<String, Map<String, Label>> labels;

  private StateLabels(Map<String, Map<String, Label>> labels) {
    this.labels = labels;
  }

  Label label(String enumName, String constant) {
    return labels.getOrDefault(enumName, Map.of()).get(constant);
  }

  static StateLabels read(
      ProjectInventory inventory, Map<String, BackendCallChains.EnumType> enums) {
    if (enums.isEmpty()) return NONE;
    List<Map<String, Object>> files = new ArrayList<>();
    for (var file : inventory.files()) {
      String relative = inventory.root().relativize(file).toString().replace('\\', '/');
      if (!ReactGraphContribution.isSource(relative)) continue;
      try {
        files.add(
            Map.of(
                "file",
                relative,
                "code",
                SafeProjectFiles.readUtf8Limited(
                    inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES)));
      } catch (Exception unreadable) {
        // A file that cannot be read gives no label; the React analysis reports it.
      }
    }
    if (files.isEmpty()) return NONE;
    JsonNode result;
    try {
      result = JavaScriptGraphContribution.run(Map.of("mode", "state-labels", "files", files));
    } catch (Exception toolUnavailable) {
      return NONE; // without the AST tool the constants keep their names
    }
    return fromGroups(result.path("groups"), enums);
  }

  static StateLabels fromGroups(JsonNode groups, Map<String, BackendCallChains.EnumType> enums) {
    // constant -> label -> first source, per enum
    Map<String, Map<String, TreeMap<String, SourceLocation>>> seen = new TreeMap<>();
    for (JsonNode group : groups) {
      Map<String, String> entries = new TreeMap<>();
      group
          .path("entries")
          .fields()
          .forEachRemaining(e -> entries.put(e.getKey(), e.getValue().asText()));
      var source =
          new SourceLocation(
              group.path("source").path("file").asText("."),
              group.path("source").path("line").asInt(1));
      List<String> owners = new ArrayList<>();
      for (var type : enums.values()) {
        long shared = entries.keySet().stream().filter(type.constants()::contains).count();
        if (shared >= 2 && shared * 2 >= entries.size()) owners.add(type.name());
      }
      if (owners.size() != 1) continue;
      var type = enums.get(owners.get(0));
      entries.forEach(
          (constant, text) -> {
            if (!type.constants().contains(constant)) return;
            var byText =
                seen.computeIfAbsent(type.name(), k -> new TreeMap<>())
                    .computeIfAbsent(constant, k -> new TreeMap<>());
            byText.merge(text, source, (a, b) -> compare(a, b) <= 0 ? a : b);
          });
    }
    Map<String, Map<String, Label>> out = new TreeMap<>();
    seen.forEach(
        (type, constants) ->
            constants.forEach(
                (constant, texts) -> {
                  if (texts.size() != 1) return; // the frontend disagrees with itself
                  var only = texts.firstEntry();
                  out.computeIfAbsent(type, k -> new TreeMap<>())
                      .put(constant, new Label(only.getKey(), only.getValue()));
                }));
    return new StateLabels(out);
  }

  private static int compare(SourceLocation a, SourceLocation b) {
    int file = a.file().compareTo(b.file());
    return file != 0 ? file : Integer.compare(a.line(), b.line());
  }
}
