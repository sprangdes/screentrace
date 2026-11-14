package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph.Relationship;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Relationships by ID, in ID order like a {@link TreeMap}, with an index by source node, so a
 * lookup from one node does not scan every relationship (HC-004, ADR 0139). Each per-node list
 * keeps ID order too, so a search over it finds the same relationship first as a search over all.
 */
final class RelationshipsByFrom extends TreeMap<String, Relationship> {
  private final Map<String, TreeMap<String, Relationship>> byFrom = new HashMap<>();

  @Override
  public Relationship put(String id, Relationship relationship) {
    Relationship previous = super.put(id, relationship);
    if (previous != null) {
      var bucket = byFrom.get(previous.from());
      bucket.remove(id);
      if (bucket.isEmpty()) byFrom.remove(previous.from());
    }
    byFrom.computeIfAbsent(relationship.from(), from -> new TreeMap<>()).put(id, relationship);
    return previous;
  }

  @Override
  public Relationship remove(Object id) {
    Relationship previous = super.remove(id);
    if (previous != null) {
      var bucket = byFrom.get(previous.from());
      bucket.remove(id);
      if (bucket.isEmpty()) byFrom.remove(previous.from());
    }
    return previous;
  }

  @Override
  public void clear() {
    super.clear();
    byFrom.clear();
  }

  /**
   * Relationships whose source is {@code from}, in ID order. Removals through the map's views
   * ({@code entrySet().removeIf}, iterators) bypass {@link #remove}, so each indexed entry is
   * checked against the map and stale ones are left out (RV-002).
   */
  Collection<Relationship> from(String from) {
    var bucket = byFrom.get(from);
    if (bucket == null) return List.of();
    return bucket.entrySet().stream()
        .filter(entry -> super.get(entry.getKey()) == entry.getValue())
        .map(Map.Entry::getValue)
        .toList();
  }
}
