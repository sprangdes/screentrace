package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.core.StableGraphIds;
import java.nio.file.Path;
import java.util.*;

/** Applies shared source components to proven screen owners without making routing guesses. */
public final class MarkupGraphContribution {
  private MarkupGraphContribution() { }
  public static ApplicationGraph enrich(ApplicationGraph graph,JspAnalysis jsp) {
    Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));
    Map<String,Relationship> edges=new TreeMap<>();graph.relationships().forEach(e->edges.put(e.id(),e));
    Map<String,Behavior> behaviors=new TreeMap<>();graph.behaviors().forEach(b->behaviors.put(b.id(),b));
    Map<String,ValidationRule> rules=new TreeMap<>();graph.validationRules().forEach(r->rules.put(r.id(),r));
    for(var markup:jsp.markup().values()) for(var c:markup.components()) {
      var old=nodes.get(c.id());var attrs=new TreeMap<>(c.attributes());if(old!=null)attrs.putAll(old.attributes());
      attrs.put("kindStatus",MarkupAnalysis.dynamic(c.attributes().get("type"))||MarkupAnalysis.dynamic(c.attributes().get("multiple"))?"UNRESOLVED":"CONFIRMED");
      attrs.put("kind",c.kind().name());attrs.put("tag",c.tag());attrs.put("conditional",Boolean.toString(c.guard()!=null));attrs.put("repeated",Boolean.toString(c.repeated()));
      if(c.guard()!=null)attrs.put("guard",c.guard());if(c.formId()!=null)attrs.put("formId",c.formId());
      if(c.field()!=null) {attrs.put("field",c.field());attrs.put("bindingStatus","UNRESOLVED");}if(c.model()!=null)attrs.put("model",c.model());
      markup.events().stream().filter(e->e.componentId().equals(c.id())).forEach(e->{attrs.put("event."+e.event(),e.expression());attrs.put("eventLine."+e.event(),Integer.toString(e.source().line()));});
      List<AnalysisEvidence> evidence=new ArrayList<>();if(old!=null)evidence.addAll(old.evidence());evidence.add(MarkupAnalysis.evidence(c.source(),Confidence.CONFIRMED,"來源元件標記"));
      String name=c.attributes().getOrDefault("displayName",old==null?first(attrs,"value","title","id","name","property","tag"):old.name());
      for(String key:List.of("visibleText","displayName","labelSource"))if(c.attributes().containsKey(key))attrs.put(key,c.attributes().get(key));
      nodes.put(c.id(),new GraphNode(c.id(),NodeType.COMPONENT,name,attrs,c.source(),old==null?Confidence.CONFIRMED:old.confidence(),evidence.stream().distinct().toList()));
    }
    for(var screen:graph.nodes()) if(screen.type()==NodeType.SCREEN) {
      Set<String> roots=new TreeSet<>();String view=screen.attributes().get("view");if(view!=null)roots.add(view);
      if("true".equals(screen.attributes().get("tilesDefinition"))) {roots.clear();roots.add(screen.name());}
      if(roots.isEmpty())collectGraphIncludes(screen.id(),graph,nodes,roots,new HashSet<>());
      for(String path:roots) project(screen.id(),path,null,false,jsp,nodes,edges,behaviors,rules,new HashSet<>());
    }
    for(var interaction:jsp.interactions()) if(interaction.componentId()!=null&&nodes.containsKey(interaction.componentId())) {
      var node=nodes.get(interaction.componentId());var attrs=new TreeMap<>(node.attributes());
      if(interaction.originalExpression()!=null)attrs.put("originalExpression",interaction.originalExpression());
      if(!attrs.containsKey("target"))attrs.put("target",interaction.target());
      if(!attrs.containsKey("targetStatus"))attrs.put("targetStatus",interaction.confidence().name());
      List<AnalysisEvidence> proof=new ArrayList<>(node.evidence());proof.addAll(interaction.definitionEvidence());
      nodes.put(node.id(),new GraphNode(node.id(),node.type(),node.name(),attrs,node.source(),node.confidence(),proof.stream().distinct().toList()));
    }
    // Resolve modal candidates after every screen's include ownership has been projected.
    Set<String> modalBehaviors=new HashSet<>();jsp.markup().values().forEach(m->m.behaviors().forEach(b->modalBehaviors.add(b.id())));
    for(String id:modalBehaviors) if(behaviors.containsKey(id)) {
      var behavior=behaviors.get(id);Set<String> owners=new TreeSet<>();
      edges.values().stream().filter(e->e.type()==EdgeType.CONTAINS&&e.to().equals(behavior.triggerId())).forEach(e->owners.add(e.from()));
      List<GraphNode> candidates=nodes.values().stream().filter(n->"MODAL".equals(n.attributes().get("kind"))&&Objects.equals(behavior.expression(),"#"+n.attributes().get("id")))
          .filter(n->owners.stream().anyMatch(owner->ownedBy(owner,n.id(),edges))).toList();
      Confidence status=candidates.size()==1?Confidence.CONFIRMED:candidates.size()>1?Confidence.AMBIGUOUS:Confidence.UNRESOLVED;
      behaviors.put(id,new Behavior(id,behavior.triggerId(),behavior.event(),behavior.type(),candidates.size()==1?candidates.get(0).id():null,behavior.guard(),behavior.parentId(),behavior.expression(),
          List.of(MarkupAnalysis.evidence(behavior.evidence().get(0).source(),status,"彈窗候選："+candidates.stream().map(GraphNode::id).toList()))));
    }
    for(var interaction:jsp.interactions()) if(interaction.componentId()!=null&&nodes.containsKey(interaction.componentId())&&Set.of(JspAnalysis.InteractionType.NAVIGATION,JspAnalysis.InteractionType.FORM_SUBMIT).contains(interaction.type())) {
      String trigger=interaction.componentId();
      boolean existing=behaviors.values().stream().anyMatch(b->trigger.equals(b.triggerId())&&Set.of(BehaviorType.NAVIGATE,BehaviorType.SUBMIT_FORM,BehaviorType.UNKNOWN).contains(b.type()));if(existing)continue;
      BehaviorType type=interaction.type()==JspAnalysis.InteractionType.FORM_SUBMIT?BehaviorType.SUBMIT_FORM:BehaviorType.NAVIGATE;
      List<Relationship> results=edges.values().stream().filter(e->e.from().equals(trigger)&&(e.type()==EdgeType.TRIGGERS||(type==BehaviorType.NAVIGATE&&e.type()==EdgeType.NAVIGATES_TO))).toList();
      List<String> endpoints=results.stream().filter(e->e.type()==EdgeType.TRIGGERS).map(Relationship::to).distinct().toList();
      List<String> targets=endpoints.isEmpty()?results.stream().map(Relationship::to).distinct().toList():endpoints;
      String target=targets.size()==1?targets.get(0):null;Confidence status=targets.size()>1?Confidence.AMBIGUOUS:targets.isEmpty()?Confidence.UNRESOLVED:results.stream().anyMatch(e->e.to().equals(target)&&e.confidence()!=Confidence.CONFIRMED)?Confidence.INFERRED:Confidence.CONFIRMED;
      List<AnalysisEvidence> proof=new ArrayList<>(interaction.definitionEvidence());proof.add(MarkupAnalysis.evidence(interaction.source(),status,"原始運算式："+interaction.originalExpression()+"；候選："+targets));
      String event=type==BehaviorType.SUBMIT_FORM?"submit":"click",expression=interaction.originalExpression();String id=StableGraphIds.behavior(trigger,event,type,expression,0);
      behaviors.put(id,new Behavior(id,trigger,event,type,target,nodes.get(trigger).attributes().get("guard"),null,expression,proof));
    }
    // Fields bind only to a model whose identity and property are backed by adapter evidence.
    for(var markup:jsp.markup().values()) for(var c:markup.components()) if(c.field()!=null&&isModelField(c)&&c.formId()!=null) {
      List<GraphNode> models=edges.values().stream().filter(e->e.type()==EdgeType.BINDS_TO&&e.from().equals(c.formId()))
          .map(e->nodes.get(e.to())).filter(Objects::nonNull).filter(n->n.type()==NodeType.FORM_MODEL).distinct().toList();
      if(models.size()!=1) continue;var model=models.get(0);
      String property=c.field();if(MarkupAnalysis.dynamic(property)||model.attributes().keySet().stream().noneMatch(k->k.startsWith("field."+property+".")))continue;
      var old=nodes.get(c.id());var attrs=new TreeMap<>(old.attributes());attrs.put("bindingStatus","CONFIRMED");attrs.put("modelId",model.id());
      List<AnalysisEvidence> proof=new ArrayList<>(old.evidence());proof.addAll(model.evidence());
      nodes.put(old.id(),new GraphNode(old.id(),old.type(),old.name(),attrs,old.source(),old.confidence(),proof.stream().distinct().toList()));
      putEdge(edges,EdgeType.BINDS_TO,c.id(),model.id(),c.source(),"欄位："+property,proof);
    }
    return new ApplicationGraph(graph.application(),List.copyOf(nodes.values()),List.copyOf(edges.values()),graph.diagnostics(),graph.apiContracts(),graph.schemaVersion(),List.copyOf(behaviors.values()),List.copyOf(rules.values()));
  }
  private static boolean isModelField(MarkupAnalysis.Component c) {
    if (!c.tag().contains(":") && c.attributes().containsKey("form")) return false;
    return switch(c.kind()) {
      case TEXT_INPUT, TEXTAREA, SELECT, CHECKBOX, RADIO, DATE_PICKER, FILE_INPUT, MULTI_SELECT, BUTTON, SUBMIT -> true;
      case OTHER -> Set.of("input", "hidden", "select").contains(c.tag().substring(c.tag().lastIndexOf(':')+1));
      default -> false;
    };
  }
  private static void collectGraphIncludes(String id,ApplicationGraph graph,Map<String,GraphNode> nodes,Set<String> paths,Set<String> seen) {
    if(!seen.add(id))return;
    for(var edge:graph.relationships()) if(edge.type()==EdgeType.INCLUDES&&edge.from().equals(id)) {
      var target=nodes.get(edge.to());if(target!=null) {String path=target.attributes().get("view");if(path!=null)paths.add(path);collectGraphIncludes(target.id(),graph,nodes,paths,seen);}
    }
  }
  private static void project(String screen,String path,String guard,boolean repeated,JspAnalysis jsp,Map<String,GraphNode> nodes,Map<String,Relationship> edges,Map<String,Behavior> behaviors,Map<String,ValidationRule> rules,Set<String> stack) {
    if(!stack.add(path))return;
    var definition=jsp.tilesDefinitions().stream().filter(d->d.name().equals(path)).findFirst();
    if(definition.isPresent()) {
      var tile=definition.get();List<String> references=new ArrayList<>();references.add(tile.template());tile.attributes().forEach(a->references.add(a.value()));
      for(String reference:references) {String child=resolve(tile.source().file(),reference,jsp);if(child!=null)project(screen,child,guard,repeated,jsp,nodes,edges,behaviors,rules,stack);}
    }
    var markup=jsp.markup().get(path);
    if(markup!=null) {
      for(var c:markup.components()) {
        String combined=combine(guard,c.guard());
        List<AnalysisEvidence> proof=List.of(MarkupAnalysis.evidence(c.source(),Confidence.CONFIRMED,"畫面元件來源；guard="+Objects.toString(combined,"")+"；repeated="+(repeated||c.repeated())));
        putEdge(edges,EdgeType.CONTAINS,screen,c.id(),c.source(),"畫面元件來源",proof);
        if(combined!=null||repeated) {var old=nodes.get(c.id());var attrs=new TreeMap<>(old.attributes());if(combined!=null)attrs.put("conditional","true");if(repeated)attrs.put("repeated","true");nodes.put(c.id(),new GraphNode(old.id(),old.type(),old.name(),attrs,old.source(),old.confidence(),old.evidence()));}
      }
      for(var rule:markup.rules()) {
        rules.putIfAbsent(rule.id(),rule);
        for(String field:rule.fields()) {var c=markup.components().stream().filter(v->v.id().equals(field)).findFirst().orElseThrow();String expression=rule.kind()+rule.parameters();
          String id=StableGraphIds.behavior(field,"validate",BehaviorType.VALIDATE,expression,0);
          behaviors.putIfAbsent(id,new Behavior(id,field,"validate",BehaviorType.VALIDATE,rule.id(),c.guard(),null,expression,rule.evidence()));}
      }
      for(var behavior:markup.behaviors()) {
        String selector=behavior.expression();List<GraphNode> targets=nodes.values().stream().filter(n->n.type()==NodeType.COMPONENT&&"MODAL".equals(n.attributes().get("kind"))&&selector!=null&&selector.equals("#"+n.attributes().get("id")))
            .filter(n->ownedBy(screen,n.id(),edges)||reachableSource(path,n.source().file(),jsp,new HashSet<>())).toList();
        Confidence status=targets.size()==1?Confidence.CONFIRMED:targets.size()>1?Confidence.AMBIGUOUS:Confidence.UNRESOLVED;
        behaviors.put(behavior.id(),new Behavior(behavior.id(),behavior.triggerId(),behavior.event(),behavior.type(),targets.size()==1?targets.get(0).id():null,behavior.guard(),behavior.parentId(),selector,
            List.of(MarkupAnalysis.evidence(behavior.evidence().get(0).source(),status,"彈窗候選："+targets.stream().map(GraphNode::id).toList()))));
      }
    }
    for(var include:jsp.includes()) if(include.sourceViewPath().equals(path)) {
      String child=resolve(path,include.targetPath(),jsp);if(child==null)continue;
      String includeGuard=include.guard();project(screen,child,combine(guard,includeGuard),repeated||include.repeated(),jsp,nodes,edges,behaviors,rules,stack);
    }
    stack.remove(path);
  }
  private static boolean reachableSource(String path,String target,JspAnalysis jsp,Set<String> seen) {
    if(path.equals(target))return true;if(!seen.add(path))return false;
    for(var include:jsp.includes()) if(include.sourceViewPath().equals(path)) {String child=resolve(path,include.targetPath(),jsp);if(child!=null&&reachableSource(child,target,jsp,seen))return true;}return false;
  }
  private static boolean ownedBy(String screen,String component,Map<String,Relationship> edges) {return edges.values().stream().anyMatch(e->e.type()==EdgeType.CONTAINS&&e.from().equals(screen)&&e.to().equals(component));}
  private static String resolve(String source,String target,JspAnalysis jsp) {
    if(target==null||MarkupAnalysis.dynamic(target))return null;
    if(jsp.tilesDefinitions().stream().anyMatch(d->d.name().equals(target)))return target;
    List<String> candidates=target.startsWith("/")?List.of("src/main/webapp"+target,target.substring(1)):List.of(Path.of(source).getParent()==null?target:Path.of(source).getParent().resolve(target).normalize().toString().replace('\\','/'));
    return candidates.stream().filter(jsp.markup()::containsKey).findFirst().orElse(null);
  }
  private static String combine(String a,String b) {return a==null?b:b==null?a:a+" && "+b;}
  private static String first(Map<String,String> attrs,String... keys) {for(String key:keys)if(attrs.get(key)!=null)return attrs.get(key);return "元件";}
  private static void putEdge(Map<String,Relationship> edges,EdgeType type,String from,String to,SourceLocation source,String detail,List<AnalysisEvidence> proof) {
    String id=ApplicationGraph.id(NodeType.COMPONENT,type+":"+from+":"+to);var existing=edges.values().stream().filter(e->e.type()==type&&e.from().equals(from)&&e.to().equals(to)).findFirst();
    if(existing.isPresent()) {id=existing.get().id();List<AnalysisEvidence> merged=new ArrayList<>(existing.get().evidence());merged.addAll(proof);proof=merged;}
    edges.put(id,new Relationship(id,type,from,to,Confidence.CONFIRMED,source,proof.stream().distinct().toList()));
  }
}
