package io.screentrace.parser.jsp;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import com.fasterxml.jackson.databind.*;
import java.util.*;

/** Correlates inert frontend requests with every statically compatible backend endpoint. */
public final class UrlGraphContribution {
 private static final ObjectMapper JSON=new ObjectMapper();
 private UrlGraphContribution() { }
 public static ApplicationGraph enrich(ApplicationGraph input,ProjectInventory inventory) {
  ApplicationGraph graph=ConditionalUrlTargets.enrich(ResourceGraphContribution.enrich(SourceEncodingContribution.enrich(input,inventory),inventory),inventory);
  Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));Map<String,Relationship> edges=new TreeMap<>();graph.relationships().forEach(e->edges.put(e.id(),e));Map<String,Behavior> behaviors=new TreeMap<>();graph.behaviors().forEach(b->behaviors.put(b.id(),b));List<Diagnostic> diagnostics=new ArrayList<>(graph.diagnostics());
  var context=UrlResolution.context(inventory,List.of());var extensions=extensions(inventory,diagnostics);var directories=new Lazy<>(()->new RequestDirectories(graph));
  for(var node:graph.nodes())if(node.type()==NodeType.COMPONENT&&"FORM".equals(node.attributes().get("kind"))&&behaviors.values().stream().noneMatch(b->b.triggerId().equals(node.id())&&b.type()==BehaviorType.SUBMIT_FORM)){
   String raw=node.attributes().getOrDefault("target",node.attributes().get("action"));if(raw!=null&&!raw.startsWith("javascript:")){String id=StableGraphIds.behavior(node.id(),"submit",BehaviorType.SUBMIT_FORM,raw,0);behaviors.put(id,new Behavior(id,node.id(),"submit",BehaviorType.SUBMIT_FORM,null,node.attributes().get("guard"),null,raw,node.evidence()));}
  }
  var endpoints=nodes.values().stream().filter(n->n.type()==NodeType.ENDPOINT&&!"javascript-request".equals(n.attributes().get("origin"))).map(n->new UrlResolution.Endpoint(n.id(),n.attributes().getOrDefault("path",""),n.attributes().getOrDefault("httpMethod","ANY"),n.evidence())).toList();
  for(var b:new ArrayList<>(behaviors.values())){
   if(!Set.of(BehaviorType.CALL_API,BehaviorType.SUBMIT_FORM,BehaviorType.NAVIGATE).contains(b.type()))continue;var trigger=nodes.get(b.triggerId());if(trigger==null)continue;
   if("true".equals(trigger.attributes().get("strutsInheritedFormAction"))&&!trigger.attributes().containsKey("requestAlternatives"))continue;
   boolean strutsRouteAlreadyProven=edges.values().stream().filter(edge->edge.type()==EdgeType.TRIGGERS&&edge.from().equals(b.triggerId())).map(edge->nodes.get(edge.to())).filter(Objects::nonNull).anyMatch(endpoint->endpoint.type()==NodeType.ENDPOINT&&"ACTION".equals(endpoint.attributes().get("category"))&&"PROVEN".equals(endpoint.attributes().get("servletMappingStatus")));
   if(strutsRouteAlreadyProven)continue;
   String raw=null,method=null;boolean dynamicMethod=false;SourceLocation source=b.evidence().isEmpty()?trigger.source():b.evidence().get(0).source();
   if(b.type()==BehaviorType.CALL_API||b.type()==BehaviorType.NAVIGATE||b.type()==BehaviorType.SUBMIT_FORM&&b.evidence().stream().anyMatch(e->e.parser().equals("AcornStaticAnalyzer")&&Objects.toString(e.detail(),"").contains("\"url\""))){for(var e:b.evidence())try{var item=JSON.readTree(Objects.toString(e.detail(),""));if(item!=null&&item.has("url")){raw=item.path("url").isNull()?null:item.path("url").asText();method=item.path("method").isNull()?null:item.path("method").asText();if(b.type()==BehaviorType.NAVIGATE)method="GET";dynamicMethod=method==null;source=e.source();break;}}catch(Exception ignored){}if(raw==null&&b.targetId()!=null){var target=nodes.get(b.targetId());if(target!=null&&"javascript-request".equals(target.attributes().get("origin"))){raw=target.attributes().get("path");method=target.attributes().get("httpMethod");}}}
   else {raw=trigger.attributes().getOrDefault("target",trigger.attributes().getOrDefault("action",b.expression()));String module=trigger.attributes().get("module");if(module!=null&&!module.isBlank()&&raw!=null&&raw.startsWith("/")){String prefix=module.endsWith("/")?module.substring(0,module.length()-1):module;if(!raw.equals(prefix)&&!raw.startsWith(prefix+"/"))raw=prefix+raw;}method=trigger.attributes().getOrDefault("httpMethod",trigger.attributes().getOrDefault("method","GET")).toUpperCase(Locale.ROOT);}
   // A markup link's parser-resolved target (<spring:url value='/logout'/> → /logout) is the request; its raw href is template text.
   // It only fills in links the adapter left unmatched (the endpoint came later, e.g. a Security processor): a request edge the
   // adapter already proved, such as an exact path beside a {id} template, is never replaced by the ambiguity-keeping matcher.
   if(b.type()==BehaviorType.NAVIGATE&&raw==null&&edges.values().stream().anyMatch(e->e.type()==EdgeType.TRIGGERS&&e.from().equals(b.triggerId())))continue;
   if(b.type()==BehaviorType.NAVIGATE&&raw==null){raw=List.of("CONFIRMED","INFERRED").contains(Objects.toString(trigger.attributes().get("targetStatus"),""))&&trigger.attributes().containsKey("target")?trigger.attributes().get("target"):trigger.attributes().get("href");method="GET";}
   String originalRequest=raw;if(b.type()!=BehaviorType.CALL_API)raw=templatePath(raw);
   boolean nativeContext=b.type()!=BehaviorType.CALL_API&&raw!=null&&raw.matches("^\\$?\\{pageContext\\.(request|servletContext)\\.contextPath}(/.*)?$");
   if(nativeContext)raw=raw.substring(raw.indexOf('}')+1);
   boolean proven=raw!=null&&(raw.startsWith("{pageContext.request.contextPath}")||raw.startsWith("{pageContext.servletContext.contextPath}")||raw.startsWith("${pageContext.request.contextPath}")||raw.startsWith("${pageContext.servletContext.contextPath}"));
   UrlResolution.Result result;
   if(trigger.attributes().containsKey("requestAlternatives")&&trigger.evidence().stream().anyMatch(e->e.parser().equals("ConditionalUrlTargets"))) {
    Set<String> candidates=new TreeSet<>();List<AnalysisEvidence> alternativeProof=new ArrayList<>();List<String> paths=new ArrayList<>(),errors=new ArrayList<>();
    try{for(var alternative:JSON.readTree(trigger.attributes().get("requestAlternatives"))){var matched=UrlResolution.resolve(alternative.path("path").asText(),method,context,endpoints,extensions,false);candidates.addAll(matched.candidates());paths.addAll(matched.paths());errors.addAll(matched.diagnostics());alternativeProof.addAll(matched.evidence());}}catch(Exception error){errors.add("CONDITIONAL_URL_UNRESOLVED");}
    result=new UrlResolution.Result(candidates.size()>1?Confidence.AMBIGUOUS:candidates.isEmpty()?Confidence.UNRESOLVED:Confidence.INFERRED,List.copyOf(candidates),paths,errors,alternativeProof);
   }
   else if("<current-view>".equals(raw)){Set<String> owners=new TreeSet<>();graph.relationships().stream().filter(e->e.type()==EdgeType.CONTAINS&&e.to().equals(b.triggerId())).forEach(e->owners.add(e.from()));Set<String> handlers=new TreeSet<>();graph.relationships().stream().filter(e->e.type()==EdgeType.RENDERS&&owners.contains(e.to())).forEach(e->handlers.add(e.from()));var paths=endpoints.stream().filter(n->graph.relationships().stream().anyMatch(e->e.type()==EdgeType.HANDLED_BY&&e.from().equals(n.id())&&handlers.contains(e.to()))).map(UrlResolution.Endpoint::path).collect(java.util.stream.Collectors.toSet());var current=endpoints.stream().filter(n->paths.contains(n.path())).toList();List<String> candidates=new ArrayList<>();for(var endpoint:current)if(UrlResolution.resolve(endpoint.path(),method,context,List.of(endpoint),false).candidates().contains(endpoint.id()))candidates.add(endpoint.id());var proof=UrlResolution.resolve(null,method,context,List.of(),false).evidence();result=new UrlResolution.Result(candidates.isEmpty()?Confidence.UNRESOLVED:candidates.size()>1?Confidence.AMBIGUOUS:Confidence.INFERRED,candidates.stream().sorted().toList(),List.of(),List.of(),proof);}
   else {
    String relative=relativeRequestPath(raw,b.triggerId(),graph,directories.get());
    var baseResult=UrlResolution.resolve(relative==null?raw:relative,dynamicMethod?"UNKNOWN":method,context,endpoints,extensions,proven);
    if(relative!=null||nativeContext){var proof=new ArrayList<>(baseResult.evidence());if(relative!=null)proof.add(new AnalysisEvidence(source,"RelativeRequestPath",ResolutionStatus.INFERRED,"原始相對 URL="+raw+"；由所有來源畫面唯一的已證明請求目錄推導="+relative));result=new UrlResolution.Result(baseResult.confidence()==Confidence.CONFIRMED?Confidence.INFERRED:baseResult.confidence(),baseResult.candidates(),baseResult.paths(),baseResult.diagnostics(),proof);}else result=baseResult;
   }
   if(b.type()==BehaviorType.NAVIGATE&&result.candidates().isEmpty())continue;
   List<AnalysisEvidence> proof=new ArrayList<>(b.evidence());if(nativeContext)proof.add(new AnalysisEvidence(source,"ApplicationRelativeContext",ResolutionStatus.INFERRED,"來源目前 request 的 contextPath；不假設部署值；原文="+originalRequest));proof.addAll(result.evidence());proof.add(new AnalysisEvidence(source,"UrlResolution",result.confidence().resolutionStatus(),"原始 URL="+Objects.toString(raw,"UNRESOLVED")+"；方法="+Objects.toString(method,"GET")+"；正規化="+result.paths()+"；候選="+result.candidates()));
   for(String code:result.diagnostics())diagnostics.add(new Diagnostic("URL 靜態對應："+code,Confidence.UNRESOLVED,source,code,List.of(new AnalysisEvidence(source,"UrlResolution",ResolutionStatus.UNRESOLVED,"原始 URL="+Objects.toString(raw,"UNRESOLVED")))));
   // Rebuild only request edges; unmatched frontend descriptions still retain their caller.
   final String previous=b.targetId(),requestUrl=raw,requestMethod=method;edges.entrySet().removeIf(entry->{var edge=entry.getValue();return edge.from().equals(b.triggerId())&&Set.of(EdgeType.CALLS,EdgeType.TRIGGERS).contains(edge.type())&&(result.candidates().contains(edge.to())||Objects.equals(previous,edge.to())||!result.candidates().isEmpty()&&frontendRequest(nodes.get(edge.to()),requestUrl,requestMethod));});
   String target=result.candidates().size()==1?result.candidates().get(0):result.candidates().isEmpty()&&b.type()==BehaviorType.CALL_API?previous:null;
   behaviors.put(b.id(),new Behavior(b.id(),b.triggerId(),b.event(),b.type(),target,b.guard(),b.parentId(),b.expression(),proof.stream().distinct().sorted().toList()));
   var destinations=new ArrayList<>(result.candidates().isEmpty()&&target!=null?List.of(target):result.candidates());
   String originalRaw=raw;if(result.confidence()==Confidence.AMBIGUOUS&&originalRaw!=null)nodes.values().stream().filter(node->node.type()==NodeType.ENDPOINT&&"UNRESOLVED".equals(node.attributes().get("mappingStatus"))&&Objects.equals(originalRaw,node.attributes().get("path"))).map(GraphNode::id).forEach(destinations::add);
   for(String destination:destinations.stream().distinct().toList()){EdgeType type=trigger.type()==NodeType.SCREEN?EdgeType.CALLS:EdgeType.TRIGGERS;String id=ApplicationGraph.id(NodeType.COMPONENT,type+":"+b.triggerId()+":"+destination);var old=edges.get(id);List<AnalysisEvidence> combined=new ArrayList<>(proof);if(old!=null)combined.addAll(old.evidence());Confidence confidence=result.confidence();var endpoint=nodes.get(destination);if(confidence==Confidence.CONFIRMED&&endpoint!=null&&endpoint.confidence()!=Confidence.CONFIRMED)confidence=endpoint.confidence();if(endpoint!=null&&"PROVEN".equals(endpoint.attributes().get("servletMappingStatus")))combined.addAll(endpoint.evidence().stream().filter(evidence->Objects.toString(evidence.detail(),"").contains("servlet mapping 已證明")).toList());edges.put(id,new Relationship(id,type,b.triggerId(),destination,confidence,source,combined.stream().distinct().sorted().toList()));}
  }
  nodes.entrySet().removeIf(entry->"javascript-request".equals(entry.getValue().attributes().get("origin"))&&behaviors.values().stream().noneMatch(b->entry.getKey().equals(b.targetId()))&&edges.values().stream().noneMatch(e->entry.getKey().equals(e.to())));
  var enriched=new ApplicationGraph(graph.application(),List.copyOf(nodes.values()),List.copyOf(edges.values()),diagnostics.stream().distinct().toList(),graph.apiContracts(),graph.schemaVersion(),List.copyOf(behaviors.values()),graph.validationRules());
  return hidePrivateLocations(enriched);
 }
 private static String templatePath(String raw){
  if(raw==null)return null;var matcher=java.util.regex.Pattern.compile("\\$\\{\\s*([A-Za-z_][A-Za-z0-9_]*(?:\\s*\\.\\s*[A-Za-z_][A-Za-z0-9_]*)*)\\s*}").matcher(raw);StringBuffer text=new StringBuffer();while(matcher.find())matcher.appendReplacement(text,java.util.regex.Matcher.quoteReplacement("{"+matcher.group(1).replaceAll("\\s+","")+"}"));matcher.appendTail(text);return text.toString();
 }
 private static String resolveRelative(String base,String raw){
  Map<String,String> slots=new LinkedHashMap<>();var matcher=java.util.regex.Pattern.compile("\\{[^{}]*}").matcher(raw);StringBuffer clean=new StringBuffer();while(matcher.find()){String slot="__ST_SLOT_"+slots.size()+"__";slots.put(slot,matcher.group());matcher.appendReplacement(clean,slot);}matcher.appendTail(clean);String result=java.net.URI.create(base).resolve(clean.toString()).normalize().toString();for(var slot:slots.entrySet())result=result.replace(slot.getKey(),slot.getValue());return result;
 }
 private static String relativeRequestPath(String raw,String trigger,ApplicationGraph graph,RequestDirectories directories){
  if(raw==null||raw.isBlank()||raw.startsWith("/")||raw.startsWith("#")||raw.startsWith("{")||raw.startsWith("${")||raw.contains(":")||raw.contains("<"))return null;
  Set<String> owners=new TreeSet<>();graph.relationships().stream().filter(e->e.type()==EdgeType.CONTAINS&&e.to().equals(trigger)).forEach(e->owners.add(e.from()));
  graph.nodes().stream().filter(n->n.id().equals(trigger)&&n.type()==NodeType.SCREEN).forEach(n->owners.add(n.id()));
  var bases=directories.of(owners);
  if(bases.size()!=1)return null;
  try{return resolveRelative(bases.iterator().next(),raw);}catch(Exception ignored){return null;}
 }
 public static List<String> requestDirectories(ApplicationGraph graph,Set<String> owners){return new RequestDirectories(graph).of(owners);}
 /** Request directories against one fixed graph; HANDLED_BY, RENDERS and FORWARDS_TO edges are indexed once, not rescanned per owner. */
 public static final class RequestDirectories {
  private final Map<String,List<GraphNode>> nodesById=new HashMap<>();private final Map<String,List<String>> handlersByView=new HashMap<>();private final Map<String,Set<String>> endpointsByHandler=new HashMap<>();private final Map<String,List<UrlResolution.Endpoint>> routesById=new HashMap<>();private final Set<String> redirects=new HashSet<>();
  public RequestDirectories(ApplicationGraph graph){
   for(var n:graph.nodes()){nodesById.computeIfAbsent(n.id(),k->new ArrayList<>()).add(n);if("REDIRECT".equals(n.attributes().get("category")))redirects.add(n.id());
    if(n.type()==NodeType.ENDPOINT){var e=new UrlResolution.Endpoint(n.id(),n.attributes().getOrDefault("path",""),n.attributes().getOrDefault("httpMethod","ANY"),n.evidence());if(Set.of("GET","ANY").contains(e.method()))routesById.computeIfAbsent(e.id(),k->new ArrayList<>()).add(e);}}
   for(var e:graph.relationships()){if(e.type()==EdgeType.RENDERS||e.type()==EdgeType.FORWARDS_TO)handlersByView.computeIfAbsent(e.to(),k->new ArrayList<>()).add(e.from());if(e.type()==EdgeType.HANDLED_BY)endpointsByHandler.computeIfAbsent(e.to(),k->new HashSet<>()).add(e.from());}
  }
  public List<String> of(Set<String> owners){
   Set<String> bases=new TreeSet<>();
   for(String owner:owners){var paths=new TreeSet<String>();
    for(String handler:new HashSet<>(handlersByView.getOrDefault(owner,List.of())))for(String endpoint:endpointsByHandler.getOrDefault(handler,Set.of()))if(!redirects.contains(endpoint))routesById.getOrDefault(endpoint,List.of()).forEach(r->paths.add(r.path()));
    nodesById.getOrDefault(owner,List.of()).stream().filter(n->n.type()==NodeType.SCREEN).forEach(n->{
     String view=n.attributes().getOrDefault("view","");
     if(n.attributes().containsKey("sourceRequestPaths")&&n.evidence().stream().anyMatch(e->e.parser().equals("StrutsRequestPath"))){paths.clear();for(String request:n.attributes().get("sourceRequestPaths").split("\\u001f"))paths.add(request);return;}
     if(!view.toLowerCase(Locale.ROOT).contains("/web-inf/")&&!view.contains("/resources/templates/"))
      for(String alias:n.attributes().getOrDefault("routeAliases","").split("\\u001f")){
       String path=alias.split("[?#]",2)[0];
       if(path.startsWith("/")&&!path.startsWith("//")&&!path.contains("..")&&!path.contains("{")&&!path.contains(":")&&(path.endsWith(".jsp")||path.endsWith(".html"))&&view.endsWith(path))paths.add(path);
      }
    });
    if(paths.isEmpty())return List.of();
    for(String path:paths){String base=path.substring(0,path.lastIndexOf('/')+1);if(!base.startsWith("/")||base.contains("{"))return List.of();bases.add(base);}
   }
   return List.copyOf(bases);
  }
 }
 private static final class Lazy<T>{private final java.util.function.Supplier<T> supplier;private T value;Lazy(java.util.function.Supplier<T> supplier){this.supplier=supplier;}T get(){if(value==null)value=supplier.get();return value;}}
 private static boolean frontendRequest(GraphNode node,String url,String method){return node!=null&&"javascript-request".equals(node.attributes().get("origin"))&&Objects.equals(url,node.attributes().get("path"))&&Objects.equals(method,node.attributes().get("httpMethod"));}
 public static ApplicationGraph hidePrivateLocations(ApplicationGraph graph){String home=System.getProperty("user.home","");if(home.length()<2)return graph;try{return JSON.treeToValue(redact(JSON.valueToTree(graph),home),ApplicationGraph.class);}catch(Exception error){throw new IllegalStateException("圖隱私處理失敗",error);}}
 private static JsonNode redact(JsonNode node,String home){if(node.isTextual())return com.fasterxml.jackson.databind.node.TextNode.valueOf(node.asText().replace(home,"[home]").replace(home.replace('\\','/'),"[home]"));if(node.isArray()){var array=JSON.createArrayNode();node.forEach(n->array.add(redact(n,home)));return array;}if(node.isObject()){var object=JSON.createObjectNode();node.fields().forEachRemaining(e->object.set(e.getKey().replace(home,"[home]"),redact(e.getValue(),home)));return object;}return node;}
 private static List<String> extensions(ProjectInventory inventory,List<Diagnostic> diagnostics){Set<String> result=new TreeSet<>();for(var file:inventory.files())if(file.getFileName().toString().equals("web.xml"))try{var document=SafeProjectFiles.parseXml(SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_XML_FILE_BYTES),false);var mappings=document.getElementsByTagName("servlet-mapping");for(int i=0;i<mappings.getLength();i++){var patterns=((org.w3c.dom.Element)mappings.item(i)).getElementsByTagName("url-pattern");for(int j=0;j<patterns.getLength();j++){String value=patterns.item(j).getTextContent().strip();if(value.startsWith("*."))result.add(value);}}}catch(Exception error){var source=new SourceLocation(inventory.root().relativize(file).toString().replace('\\','/'),1);diagnostics.add(new Diagnostic("Servlet 映射無法安全解析",Confidence.UNRESOLVED,source,"URL_MAPPING_UNRESOLVED",List.of(new AnalysisEvidence(source,"UrlResolution",ResolutionStatus.UNRESOLVED,"Servlet 映射無法安全解析"))));}return List.copyOf(result);}
}
