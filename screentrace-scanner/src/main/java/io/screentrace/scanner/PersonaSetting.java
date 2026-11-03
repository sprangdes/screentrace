package io.screentrace.scanner;

import java.util.List;

/** An analyst-defined persona from the workspace settings: a name and the conditions assumed true or false. */
public record PersonaSetting(String id, String name, List<Fact> facts, List<String> startPaths) {
  public record Fact(String text, boolean truth) { }
  public PersonaSetting {
    facts = List.copyOf(facts);
    startPaths = startPaths == null || startPaths.isEmpty() ? List.of("/") : List.copyOf(startPaths);
  }
}
