package io.screentrace.core;

import io.screentrace.core.ApplicationGraph.*;
import java.util.*;

/** Pure R-API-1..6 derivation. UNREFERENCED never authorizes removal. */
public final class ApiUsage {
  private ApiUsage() { }
  public enum Decision { KEEP, REMOVE, UNDECIDED }
  public enum Status { IN_USE, REMOVABLE, UNREFERENCED }
  public record Caller(String screenId,String componentId,String behaviorId) implements Comparable<Caller> {
    @Override public int compareTo(Caller other) {
      int result=screenId.compareTo(other.screenId);
      if(result==0) result=Objects.toString(componentId,"").compareTo(Objects.toString(other.componentId,""));
      if(result==0) result=Objects.toString(behaviorId,"").compareTo(Objects.toString(other.behaviorId,""));
      return result;
    }
  }
  public record Usage(Status status,List<Caller> callers) { }
  public static Map<String,Usage> derive(ApplicationGraph graph,Map<String,Decision> decisions) {
    Map<String,GraphNode> nodes=new HashMap<>();graph.nodes().forEach(node->nodes.put(node.id(),node));
    Map<String,Set<String>> owners=new TreeMap<>();
    graph.relationships().stream().filter(e->e.type()==EdgeType.CONTAINS && nodes.containsKey(e.from()) && nodes.get(e.from()).type()==NodeType.SCREEN)
        .forEach(e->owners.computeIfAbsent(e.to(),id->new TreeSet<>()).add(e.from()));
    Map<String,SortedSet<Caller>> callers=new TreeMap<>();
    graph.nodes().stream().filter(n->n.type()==NodeType.ENDPOINT).forEach(n->callers.put(n.id(),new TreeSet<>()));
    for(Relationship edge:graph.relationships()) if(callers.containsKey(edge.to()) && (edge.type()==EdgeType.CALLS||edge.type()==EdgeType.TRIGGERS)) {
      GraphNode from=nodes.get(edge.from());
      if(from==null) continue;
      if(from.type()==NodeType.SCREEN) callers.get(edge.to()).add(new Caller(from.id(),null,null));
      if(from.type()==NodeType.COMPONENT && graph.behaviors().stream().noneMatch(b -> b.type()==BehaviorType.CALL_API && from.id().equals(b.triggerId()) && edge.to().equals(b.targetId())))
        for(String screen:owners.getOrDefault(from.id(),Set.of())) callers.get(edge.to()).add(new Caller(screen,from.id(),null));
    }
    Map<String,Behavior> behaviors=new TreeMap<>();graph.behaviors().forEach(b->behaviors.put(b.id(),b));
    for(Behavior behavior:graph.behaviors()) if(behavior.type()==BehaviorType.CALL_API && callers.containsKey(behavior.targetId())) {
      Behavior parent=behavior;Set<String> seen=new HashSet<>();
      while(parent.triggerId()==null && parent.parentId()!=null && seen.add(parent.id()) && behaviors.containsKey(parent.parentId())) parent=behaviors.get(parent.parentId());
      GraphNode trigger=nodes.get(parent.triggerId());if(trigger==null) continue;
      if(trigger.type()==NodeType.SCREEN) callers.get(behavior.targetId()).add(new Caller(trigger.id(),null,behavior.id()));
      if(trigger.type()==NodeType.COMPONENT) for(String screen:owners.getOrDefault(trigger.id(),Set.of())) callers.get(behavior.targetId()).add(new Caller(screen,trigger.id(),behavior.id()));
    }
    Map<String,Usage> result=new TreeMap<>();
    callers.forEach((id,values)->{
      boolean removed=!values.isEmpty()&&values.stream().allMatch(c->decisions.get(c.screenId())==Decision.REMOVE || c.componentId()!=null&&decisions.get(c.componentId())==Decision.REMOVE);
      result.put(id,new Usage(values.isEmpty()?Status.UNREFERENCED:removed?Status.REMOVABLE:Status.IN_USE,List.copyOf(values)));
    });
    return Collections.unmodifiableMap(result);
  }
}
