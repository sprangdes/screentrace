package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import io.screentrace.parser.jsp.MarkupTag;
import java.nio.file.Path;
import java.util.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;
import org.xml.sax.InputSource;
import java.io.StringReader;

/** Reads registered flow state transitions; never evaluates actions, guards or flow expressions. */
final class SpringWebFlowContribution {
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory) {
  Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));
  Map<String,Relationship> edges=new TreeMap<>();graph.relationships().forEach(e->edges.put(e.id(),e));
  Map<String,Behavior> behaviors=new TreeMap<>();graph.behaviors().forEach(b->behaviors.put(b.id(),b));
  List<Diagnostic> diagnostics=new ArrayList<>(graph.diagnostics());
  for(Path registry:inventory.files())if(registry.toString().endsWith(".xml"))try {
   String registration=SafeProjectFiles.readUtf8Limited(inventory.root(),registry,SafeProjectFiles.MAX_XML_FILE_BYTES);
   if(!registration.contains("flow-location"))continue;
   for(MarkupTag tag:MarkupTag.scan(registration))if(tag.name().endsWith("flow-location")&&tag.attribute("id")!=null&&tag.attribute("path")!=null){
    String flowId=tag.attribute("id"),configured=tag.attribute("path");if(!flowId.matches("[A-Za-z0-9_/-]+")||configured.contains("..")||configured.contains("${"))continue;
    var files=inventory.files().stream().filter(f->f.toString().replace('\\','/').endsWith(configured.startsWith("/")?configured:"/"+configured)).toList();if(files.size()!=1){SourceLocation source=new SourceLocation(inventory.root().relativize(registry).toString().replace('\\','/'),tag.line());diagnostics.add(new Diagnostic("Registered flow source 無法唯一解析",Confidence.UNRESOLVED,source,"FLOW_REFERENCE_UNRESOLVED",List.of(new AnalysisEvidence(source,"SpringWebFlowParser",ResolutionStatus.UNRESOLVED,"flow="+flowId+"；path="+configured))));continue;}
    Path file=files.get(0);String relative=inventory.root().relativize(file).toString().replace('\\','/');
    String xml=SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_XML_FILE_BYTES);Document document=parse(xml);
    Map<String,Element> states=new LinkedHashMap<>();Element root=document.getDocumentElement();
    for(Element state:children(root))if(state.hasAttribute("id")){if(states.putIfAbsent(state.getAttribute("id"),state)!=null)throw new IllegalArgumentException("duplicate flow state");}
    Map<String,String> screens=new TreeMap<>();
    for(var entry:states.entrySet()){String view=entry.getValue().getAttribute("view");if(view.isBlank()||view.contains("${")||view.startsWith("/")||!view.endsWith(".jsp"))continue;
     Path target=file.getParent().resolve(view).normalize();if(!target.startsWith(inventory.root()))continue;String path=inventory.root().relativize(target).toString().replace('\\','/');
     nodes.values().stream().filter(n->n.type()==NodeType.SCREEN&&path.equals(n.attributes().get("view"))).findFirst().ifPresent(n->screens.put(entry.getKey(),n.id()));
    }
    SourceLocation registrationSource=new SourceLocation(inventory.root().relativize(registry).toString().replace('\\','/'),tag.line());
    String endpoint=ApplicationGraph.id(NodeType.ENDPOINT,"flow:"+relative+":"+flowId),handler=ApplicationGraph.id(NodeType.HANDLER,"flow:"+relative);
    nodes.put(endpoint,new GraphNode(endpoint,NodeType.ENDPOINT,"ANY /"+flowId,Map.of("path","/"+flowId,"httpMethod","ANY","category","MVC_SCREEN"),registrationSource,Confidence.CONFIRMED,proof(registrationSource,"registered flow="+flowId)));
    nodes.put(handler,new GraphNode(handler,NodeType.HANDLER,flowId,Map.of("method","flow-entry"),registrationSource,Confidence.CONFIRMED,proof(registrationSource,"registered flow="+flowId)));
    edge(edges,EdgeType.HANDLED_BY,endpoint,handler,registrationSource,"flow registry");
    String first=root.hasAttribute("start-state")?root.getAttribute("start-state"):states.keySet().stream().findFirst().orElse("");
    Set<String> initial=destinations(first,states,screens,new HashSet<>(),0);if(initial.isEmpty())diagnostics.add(new Diagnostic("Flow start-state 無法對應畫面",Confidence.UNRESOLVED,registrationSource,"FLOW_START_UNRESOLVED",List.of(new AnalysisEvidence(registrationSource,"SpringWebFlowParser",ResolutionStatus.UNRESOLVED,"start-state="+first))));for(String target:initial)edge(edges,EdgeType.RENDERS,handler,target,registrationSource,"flow start-state="+first);
    for(GraphNode link:new ArrayList<>(nodes.values()))if(link.type()==NodeType.COMPONENT&&("/"+flowId).equals(link.attributes().get("target"))){
     behaviors.entrySet().removeIf(e->link.id().equals(e.getValue().triggerId())&&Set.of(BehaviorType.NAVIGATE,BehaviorType.UNKNOWN).contains(e.getValue().type()));
     String id=ApplicationGraph.id(NodeType.COMPONENT,"flow-entry:"+link.id());behaviors.put(id,new Behavior(id,link.id(),"click",BehaviorType.NAVIGATE,endpoint,null,null,"/"+flowId,proof(registrationSource,"registered flow entry")));edge(edges,EdgeType.TRIGGERS,link.id(),endpoint,link.source(),"flow entry="+flowId);
    }
    for(var state:states.entrySet()){
     String owner=screens.get(state.getKey());if(owner==null)continue;
     for(Element transition:children(state.getValue()))if(transition.getTagName().equals("transition")&&transition.hasAttribute("on")&&transition.hasAttribute("to")){
      String event=transition.getAttribute("on");Set<String> targets=destinations(transition.getAttribute("to"),states,screens,new HashSet<>(),0);
      var tags=MarkupTag.scan(xml);int stateStart=tags.stream().filter(t->state.getKey().equals(t.attribute("id"))).mapToInt(MarkupTag::start).findFirst().orElse(-1);
      int stateEnd=tags.stream().filter(t->t.start()>stateStart&&t.attribute("id")!=null&&states.containsKey(t.attribute("id"))).mapToInt(MarkupTag::start).min().orElse(xml.length());
      int line=tags.stream().filter(t->t.start()>stateStart&&t.start()<stateEnd&&t.name().equals("transition")&&event.equals(t.attribute("on"))&&transition.getAttribute("to").equals(t.attribute("to"))).mapToInt(MarkupTag::line).findFirst().orElse(1);
      SourceLocation source=new SourceLocation(relative,line);
      var owned=edges.values().stream().filter(e->e.type()==EdgeType.CONTAINS&&e.from().equals(owner)).map(Relationship::to).toList();
      for(String id:owned){GraphNode button=nodes.get(id);String name=button.attributes().get("name");if(!("_eventId_"+event).equals(name))continue;
       var attrs=new TreeMap<>(button.attributes());attrs.put("submitterAction","true");if(targets.size()==1){attrs.put("originalTarget",attrs.getOrDefault("target","<current-view>"));attrs.put("target",nodes.get(targets.iterator().next()).attributes().get("view"));}nodes.put(id,new GraphNode(id,button.type(),button.name(),attrs,button.source(),button.confidence(),button.evidence()));
       behaviors.entrySet().removeIf(e->id.equals(e.getValue().triggerId())&&Set.of(BehaviorType.UNKNOWN,BehaviorType.SUBMIT_FORM).contains(e.getValue().type()));
       ResolutionStatus resolution=targets.isEmpty()?ResolutionStatus.UNRESOLVED:targets.size()==1?ResolutionStatus.CONFIRMED:ResolutionStatus.AMBIGUOUS;
       List<AnalysisEvidence> evidence=new ArrayList<>(List.of(new AnalysisEvidence(source,"SpringWebFlowParser",resolution,"flow state="+state.getKey()+"；event="+event+"；全部候選="+targets)));if(targets.isEmpty())diagnostics.add(new Diagnostic("Flow transition 無法對應畫面",Confidence.UNRESOLVED,source,"FLOW_TARGET_UNRESOLVED",List.copyOf(evidence)));evidence.addAll(button.evidence());
       String behavior=ApplicationGraph.id(NodeType.COMPONENT,"flow-event:"+relative+":"+id+":"+event);
       behaviors.put(behavior,new Behavior(behavior,id,"click",BehaviorType.NAVIGATE,targets.size()==1?targets.iterator().next():null,null,null,event,evidence));
       for(String target:targets){String edgeId=ApplicationGraph.id(NodeType.COMPONENT,EdgeType.NAVIGATES_TO+":"+id+":"+target);edges.put(edgeId,new Relationship(edgeId,EdgeType.NAVIGATES_TO,id,target,targets.size()==1?Confidence.CONFIRMED:Confidence.AMBIGUOUS,source,List.copyOf(evidence)));}
      }
     }
    }
   }
  }catch(Exception error){SourceLocation source=new SourceLocation(inventory.root().relativize(registry).toString().replace('\\','/'),1);diagnostics.add(new Diagnostic("Web Flow 設定未解析",Confidence.UNRESOLVED,source,"FLOW_UNRESOLVED",proof(source,"unsupported flow configuration")));}
  return new ApplicationGraph(graph.application(),List.copyOf(nodes.values()),List.copyOf(edges.values()),diagnostics,graph.apiContracts(),graph.schemaVersion(),List.copyOf(behaviors.values()),graph.validationRules());
 }
 private static Set<String> destinations(String state,Map<String,Element> states,Map<String,String> screens,Set<String> seen,int depth){
  Set<String> result=new TreeSet<>();if(depth>16||!seen.add(state))return result;if(screens.containsKey(state)){result.add(screens.get(state));return result;}Element node=states.get(state);if(node==null)return result;
  for(Element transition:children(node))if(transition.getTagName().equals("transition")&&transition.hasAttribute("to"))result.addAll(destinations(transition.getAttribute("to"),states,screens,seen,depth+1));return result;
 }
 private static List<Element> children(Element node){List<Element> result=new ArrayList<>();for(Node child=node.getFirstChild();child!=null;child=child.getNextSibling())if(child instanceof Element e)result.add(e);return result;}
 private static Document parse(String xml)throws Exception{var f=DocumentBuilderFactory.newInstance();f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);f.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");f.setExpandEntityReferences(false);return f.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));}
 private static List<AnalysisEvidence> proof(SourceLocation source,String detail){return List.of(new AnalysisEvidence(source,"SpringWebFlowParser",ResolutionStatus.CONFIRMED,detail));}
 private static void edge(Map<String,Relationship> edges,EdgeType type,String from,String to,SourceLocation source,String detail){String id=ApplicationGraph.id(NodeType.COMPONENT,type+":"+from+":"+to);edges.put(id,new Relationship(id,type,from,to,Confidence.CONFIRMED,source,proof(source,detail)));}
}
