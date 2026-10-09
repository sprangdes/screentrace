package io.screentrace.parser.jsp;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Pattern;

/** Adds a separate, evidence-backed route-template projection without rewriting UrlResolution status. */
public final class RouteTemplateInference {
 private RouteTemplateInference() { }
 public static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory) {
  Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));
  Map<String,Relationship> edges=new TreeMap<>();graph.relationships().forEach(e->edges.put(e.id(),e));
  Map<String,Behavior> behaviors=new TreeMap<>();graph.behaviors().forEach(b->behaviors.put(b.id(),b));
  List<Diagnostic> diagnostics=new ArrayList<>(graph.diagnostics());
  List<String> contexts=UrlResolution.context(inventory,List.of()).values().stream().map(UrlResolution.ContextValue::value).filter(v->!v.isEmpty()).distinct().sorted().toList();
  List<GraphNode> endpoints=nodes.values().stream().filter(n->n.type()==NodeType.ENDPOINT&&n.attributes().containsKey("path")&&!("javascript-request".equals(n.attributes().get("origin")))).toList();
  for(GraphNode component:nodes.values().stream().filter(n->n.type()==NodeType.COMPONENT&&Set.of("LINK","FORM").contains(n.attributes().get("kind"))).toList()) {
   boolean exists=behaviors.values().stream().anyMatch(b->component.id().equals(b.triggerId())&&Set.of(BehaviorType.NAVIGATE,BehaviorType.SUBMIT_FORM).contains(b.type()));
   if(!exists&&component.attributes().get("target")!=null){BehaviorType type="LINK".equals(component.attributes().get("kind"))?BehaviorType.NAVIGATE:BehaviorType.SUBMIT_FORM;String id=ApplicationGraph.id(NodeType.COMPONENT,"route-template:"+component.id()+":"+type);behaviors.put(id,new Behavior(id,component.id(),type==BehaviorType.NAVIGATE?"click":"submit",type,null,null,null,component.attributes().get("originalExpression"),component.evidence()));}
  }
  for(Behavior b:new ArrayList<>(behaviors.values())) {
   GraphNode trigger=nodes.get(b.triggerId());if(trigger==null||!Set.of(BehaviorType.NAVIGATE,BehaviorType.SUBMIT_FORM,BehaviorType.CALL_API).contains(b.type()))continue;
   String raw=url(b,trigger,inventory);if(raw==null||!template(raw)&&!dynamicExpression(b.expression()))continue;String method=method(b,trigger);
   List<String> normalized=normalize(raw,contexts,b.type()==BehaviorType.CALL_API);
   List<GraphNode> compatible=new ArrayList<>();for(GraphNode endpoint:endpoints)if(methodCompatible(method,endpoint.attributes().getOrDefault("httpMethod","ANY"))&&normalized.stream().anyMatch(p->sameShape(p,endpoint.attributes().get("path"))))compatible.add(endpoint);
   compatible=compatible.stream().distinct().sorted(Comparator.comparing(GraphNode::id)).toList();
   List<GraphNode> targets=new ArrayList<>();
   if(b.type()==BehaviorType.NAVIGATE){for(GraphNode ep:compatible){for(Relationship handled:edges.values())if(handled.type()==EdgeType.HANDLED_BY&&handled.from().equals(ep.id()))for(Relationship rendered:edges.values())if(Set.of(EdgeType.RENDERS,EdgeType.FORWARDS_TO).contains(rendered.type())&&rendered.from().equals(handled.to())&&nodes.get(rendered.to())!=null&&nodes.get(rendered.to()).type()==NodeType.SCREEN)targets.add(nodes.get(rendered.to()));}}
   else targets.addAll(compatible);
   targets=targets.stream().distinct().sorted(Comparator.comparing(GraphNode::id)).toList();
   SourceLocation source=b.evidence().stream().map(AnalysisEvidence::source).filter(Objects::nonNull).findFirst().orElse(trigger.source());
   List<String> contextCandidates=contexts.stream().filter(c->raw.startsWith(c+"/")||raw.equals(c)).toList();
   String detail="原始樣板="+raw+"；正規化樣板="+normalized+"；context path 候選="+contextCandidates+"；候選路由="+compatible.stream().map(n->n.attributes().getOrDefault("path",n.id())).toList()+"；parser=RouteTemplateInference";
   ResolutionStatus status=targets.size()==1?ResolutionStatus.INFERRED:targets.size()>1?ResolutionStatus.AMBIGUOUS:ResolutionStatus.UNRESOLVED;
   List<AnalysisEvidence> proof=new ArrayList<>(b.evidence());
   if(b.type()==BehaviorType.CALL_API&&compatible.size()==1)proof=canonicalCallUrlEvidence(proof,raw,compatible.get(0).attributes().get("path"));
   proof.add(new AnalysisEvidence(source,"RouteTemplateInference",status,detail));
   if(b.type()==BehaviorType.NAVIGATE&&compatible.size()==1) {
    GraphNode endpoint=compatible.get(0);String callId=ApplicationGraph.id(NodeType.COMPONENT,EdgeType.TRIGGERS+":"+trigger.id()+":"+endpoint.id());Relationship oldCall=edges.get(callId);List<AnalysisEvidence> callProof=new ArrayList<>(proof);if(oldCall!=null)callProof.addAll(oldCall.evidence());
    edges.put(callId,new Relationship(callId,EdgeType.TRIGGERS,trigger.id(),endpoint.id(),Confidence.INFERRED,source,callProof.stream().distinct().sorted().toList()));
   }
   if(targets.size()==1) {
    removeSyntheticRequestEdge(edges,nodes,b);
    GraphNode target=targets.get(0);EdgeType edgeType=b.type()==BehaviorType.NAVIGATE?EdgeType.NAVIGATES_TO:trigger.type()==NodeType.SCREEN?EdgeType.CALLS:EdgeType.TRIGGERS;
    String edgeId=ApplicationGraph.id(NodeType.COMPONENT,edgeType+":"+trigger.id()+":"+target.id());Relationship old=edges.get(edgeId);if(old!=null)proof.addAll(old.evidence());
    edges.put(edgeId,new Relationship(edgeId,edgeType,trigger.id(),target.id(),Confidence.INFERRED,source,proof.stream().distinct().sorted().toList()));
    behaviors.put(b.id(),new Behavior(b.id(),b.triggerId(),b.event(),b.type(),target.id(),b.guard(),b.parentId(),b.expression(),proof.stream().distinct().sorted().toList()));
   } else {
    if(targets.size()>1)removeSyntheticRequestEdge(edges,nodes,b);
    behaviors.put(b.id(),new Behavior(b.id(),b.triggerId(),b.event(),b.type(),targets.size()>1?null:b.targetId(),b.guard(),b.parentId(),b.expression(),proof.stream().distinct().sorted().toList()));
   }
  }
  nodes.entrySet().removeIf(e->"javascript-request".equals(e.getValue().attributes().get("origin"))&&behaviors.values().stream().noneMatch(b->e.getKey().equals(b.targetId()))&&edges.values().stream().noneMatch(edge->e.getKey().equals(edge.to())));
  return new ApplicationGraph(graph.application(),List.copyOf(nodes.values()),List.copyOf(edges.values()),diagnostics.stream().distinct().toList(),graph.apiContracts(),graph.schemaVersion(),List.copyOf(behaviors.values()),graph.validationRules());
 }
 private static List<AnalysisEvidence> canonicalCallUrlEvidence(List<AnalysisEvidence> evidence,String original,String endpointPath) {
  if(endpointPath==null)return evidence;
  List<AnalysisEvidence> result=new ArrayList<>();
  for(AnalysisEvidence item:evidence) {
   if(!"AcornStaticAnalyzer".equals(item.parser())||item.detail()==null){result.add(item);continue;}
   try {
    var json=new com.fasterxml.jackson.databind.ObjectMapper().readTree(item.detail());
    if(!json.isObject()||!json.hasNonNull("url")){result.add(item);continue;}
    var copy=(com.fasterxml.jackson.databind.node.ObjectNode)json;
    String originalUrl=copy.path("url").asText();if(!Objects.equals(originalUrl,endpointPath)){copy.put("originalUrl",originalUrl);copy.put("url",endpointPath);}
    result.add(new AnalysisEvidence(item.source(),item.parser(),item.resolution(),copy.toString()));
   }catch(Exception ignored){result.add(item);}
  }
  return result;
 }
 private static void removeSyntheticRequestEdge(Map<String,Relationship> edges,Map<String,GraphNode> nodes,Behavior behavior){if(behavior.targetId()==null)return;GraphNode prior=nodes.get(behavior.targetId());if(prior==null||!"javascript-request".equals(prior.attributes().get("origin")))return;edges.entrySet().removeIf(e->e.getValue().from().equals(behavior.triggerId())&&e.getValue().to().equals(prior.id())&&Set.of(EdgeType.CALLS,EdgeType.TRIGGERS).contains(e.getValue().type()));}
 private static String url(Behavior b,GraphNode trigger,ProjectInventory inventory) {
  if(b.type()==BehaviorType.CALL_API)for(AnalysisEvidence e:b.evidence())if(e.detail()!=null)try{var j=new com.fasterxml.jackson.databind.ObjectMapper().readTree(e.detail());if(j.has("url")&&!j.path("url").isNull())return j.path("url").asText();}catch(Exception ignored){}
  String raw=trigger.attributes().getOrDefault("originalExpression",trigger.attributes().get("target"));
  if(raw==null)raw=b.expression();
  if(raw==null)return null;
  var tagValue=Pattern.compile("(?is)<(?:spring:url|c:url)\\b[^>]*\\bvalue\\s*=\\s*(['\"])(.*?)\\1").matcher(raw);
  if(tagValue.find())raw=tagValue.group(2);
  if(raw.startsWith("javascript:"))return null;
  if(raw.startsWith("${")&&raw.endsWith("}")&&raw.indexOf("/")<0){String variable=raw.substring(2,raw.length()-1);try{Path file=inventory.root().resolve(trigger.source().file());if(file.startsWith(inventory.root())){List<String> definitions=MarkupTag.scan(SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES)).stream().filter(tag->Set.of("spring:url","c:url").contains(tag.name().toLowerCase(Locale.ROOT))&&variable.equals(tag.attribute("var"))).map(tag->tag.attribute("value")).filter(Objects::nonNull).distinct().toList();return definitions.size()==1?definitions.get(0):null;}}catch(Exception ignored){}return null;}
  return raw;
 }
 private static String method(Behavior b,GraphNode trigger){if(b.type()==BehaviorType.NAVIGATE)return "GET";if(b.type()==BehaviorType.SUBMIT_FORM)return trigger.attributes().getOrDefault("httpMethod",trigger.attributes().getOrDefault("method","GET")).toUpperCase(Locale.ROOT);for(AnalysisEvidence e:b.evidence())if(e.detail()!=null)try{var j=new com.fasterxml.jackson.databind.ObjectMapper().readTree(e.detail());if(j.hasNonNull("method"))return j.path("method").asText().toUpperCase(Locale.ROOT);}catch(Exception ignored){}return "UNKNOWN";}
 private static boolean methodCompatible(String request,String endpoint){return !"UNKNOWN".equals(request)&&("ANY".equals(endpoint)||Arrays.asList(endpoint.toUpperCase(Locale.ROOT).split("[,| ]+")).contains(request));}
 private static boolean template(String raw){return raw.contains("${")||raw.contains("<%")||raw.matches(".*\\{[^{}]+}.*")||raw.contains("*");}
 private static boolean dynamicExpression(String expression){return expression!=null&&(expression.contains("+")||expression.contains("${")||expression.matches("(?s).*`[^`]*\\$\\{.*"));}
 private static List<String> normalize(String raw,List<String> contexts,boolean js){String path=raw.replaceAll("(?s)<[^>]*>","").split("[?#]",2)[0];if(path.matches("^[A-Za-z][A-Za-z0-9+.-]*:.*")||path.startsWith("//")||!path.startsWith("/"))return List.of();Set<String> paths=new TreeSet<>();paths.add(path);for(String context:contexts)if(path.equals(context)||path.startsWith(context+"/"))paths.add(path.substring(context.length()));if(js){int cut=-1;for(String context:contexts)if(path.startsWith(context+"/")&&(cut<0||context.length()>cut))cut=context.length();if(cut>0)paths.add(path.substring(cut));}return paths.stream().map(RouteTemplateInference::shape).filter(Objects::nonNull).toList();}
 private static String shape(String path){if(path.contains("..")||path.contains("\\"))return null;String[] parts=path.split("/",-1);for(int i=0;i<parts.length;i++)if(parts[i].contains("${")||parts[i].contains("<%")||parts[i].matches(".*\\{[^{}]+}.*"))parts[i]="*";return String.join("/",parts);}
 private static boolean sameShape(String left,String route){String a=shape(left),b=shape(route);if(a==null||b==null)return false;String[] x=a.split("/",-1),y=b.split("/",-1);if(x.length!=y.length)return false;for(int i=0;i<x.length;i++)if(!x[i].equals(y[i])&&!x[i].equals("*")&&!y[i].equals("*"))return false;return true;}
}
