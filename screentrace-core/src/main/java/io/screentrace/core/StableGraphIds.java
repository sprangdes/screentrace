package io.screentrace.core;

import io.screentrace.core.ApplicationGraph.*;
import java.util.*;

/** Length-prefixed stable keys: no line number, scan index, timestamp, or absolute project path. */
public final class StableGraphIds {
  private StableGraphIds() { }
  public static String screen(String relativeView) { return ApplicationGraph.id(NodeType.SCREEN, normalize(relativeView)); }
  public static String endpoint(String method, String route) { return ApplicationGraph.id(NodeType.ENDPOINT,key(method.toUpperCase(Locale.ROOT),route)); }
  public static String component(String path, ComponentKind kind, Map<String,String> attributes, int occurrence) {
    if(occurrence<0) throw new IllegalArgumentException("Negative occurrence");
    List<String> fields=new ArrayList<>(List.of(normalize(path),kind.name()));
    new TreeMap<>(attributes).forEach((k,v)->{fields.add(k);fields.add(v);});
    fields.add(Integer.toString(occurrence));
    return ApplicationGraph.id(NodeType.COMPONENT,key(fields.toArray(String[]::new)));
  }
  public static String behavior(String triggerId,String event,BehaviorType type,String expression,int occurrence) {
    return "behavior:"+ApplicationGraph.id(NodeType.COMPONENT,key(triggerId,event,type.name(),expression,Integer.toString(occurrence))).substring("component:".length());
  }
  public static String validation(String path,String field,String kind,String expression,int occurrence) {
    return "validation:"+ApplicationGraph.id(NodeType.COMPONENT,key(normalize(path),field,kind,expression,Integer.toString(occurrence))).substring("component:".length());
  }
  private static String normalize(String path) {
    String value=Objects.requireNonNull(path).replace('\\','/');
    if(value.startsWith("/")||value.matches("^[A-Za-z]:.*")) throw new IllegalArgumentException("Expected project-relative path");
    if(Arrays.asList(value.split("/")).contains("..")) throw new IllegalArgumentException("Path escapes project");
    return value.startsWith("./")?value.substring(2):value;
  }
  private static String key(String... parts) {
    StringBuilder out=new StringBuilder();
    for(String part:parts) {String value=Objects.toString(part,"");out.append(value.length()).append(':').append(value);}
    return out.toString();
  }
  public static Reconciliation reconcile(Collection<String> oldIds,Collection<String> analyzedIds) {
    TreeSet<String> old=new TreeSet<>(oldIds), current=new TreeSet<>(analyzedIds);
    var matched=new TreeSet<>(old);matched.retainAll(current);
    var orphaned=new TreeSet<>(old);orphaned.removeAll(current);
    var added=new TreeSet<>(current);added.removeAll(old);
    return new Reconciliation(List.copyOf(matched),List.copyOf(orphaned),List.copyOf(added));
  }
  public record Reconciliation(List<String> matched,List<String> orphaned,@com.fasterxml.jackson.annotation.JsonProperty("new") List<String> added) { }
}
