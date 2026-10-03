package io.screentrace.parser.jsp;

import com.fasterxml.jackson.databind.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

/** Executes only the trusted analyzer module; target sources travel as inert JSON data. */
public final class JavaScriptGraphContribution {
  private static final ObjectMapper JSON=new ObjectMapper();
  private JavaScriptGraphContribution() { }
  public static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory) {
    var collected=ScriptSources.collect(inventory);List<Diagnostic> diagnostics=new ArrayList<>(graph.diagnostics());diagnostics.addAll(collected.diagnostics());
    Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));
    Map<String,Relationship> edges=new TreeMap<>();graph.relationships().forEach(e->edges.put(e.id(),e));
    Map<String,Behavior> behaviors=new TreeMap<>();graph.behaviors().forEach(b->behaviors.put(b.id(),b));
    Map<String,ValidationRule> rules=new TreeMap<>();graph.validationRules().forEach(r->rules.put(r.id(),r));
    Map<String,Set<String>> owners=new TreeMap<>();
    Set<String> sourcePaths=new TreeSet<>();collected.dom().forEach(d->sourcePaths.add((String)d.get("ownerFile")));
    for(var screen:graph.nodes())if(screen.type()==NodeType.SCREEN)for(String path:sourcePaths)if(path.equals(screen.attributes().get("view"))||(screen.source()!=null&&path.equals(screen.source().file())))owners.computeIfAbsent(path,k->new TreeSet<>()).add(screen.id());
    for(var edge:graph.relationships())if(edge.type()==EdgeType.CONTAINS&&nodes.get(edge.from())!=null&&nodes.get(edge.from()).type()==NodeType.SCREEN){var node=nodes.get(edge.to());if(node!=null&&node.source()!=null)owners.computeIfAbsent(node.source().file(),k->new TreeSet<>()).add(edge.from());}
    try {
      var jsp=new JspProjectParser().analyze(inventory.root(),inventory.files());boolean changed=true;
      while(changed){changed=false;for(var include:jsp.includes()) {
        Set<String> parents=owners.getOrDefault(include.sourceViewPath(),Set.of());if(parents.isEmpty())continue;
        String target=include.targetPath();List<String> matches=sourcePaths.stream().filter(p->p.equals(target)||(!target.contains("${")&&p.endsWith("/"+target.replaceFirst("^/","")))||Path.of(include.sourceViewPath()).getParent()!=null&&Path.of(include.sourceViewPath()).getParent().resolve(target).normalize().toString().replace('\\','/').equals(p)).toList();
        if(matches.size()==1)changed|=owners.computeIfAbsent(matches.get(0),k->new TreeSet<>()).addAll(parents);
      }}
      List<Map<String,Object>> units=new ArrayList<>(),dom=new ArrayList<>();
      for(var entry:collected.dom())for(String screen:owners.getOrDefault((String)entry.get("ownerFile"),Set.of())){var copy=new TreeMap<>(entry);copy.put("screenId",screen);dom.add(copy);}
      Map<String,List<AnalysisEvidence>> inclusionEvidence=new HashMap<>();
      for(var script:collected.scripts()) {
        for(String screen:owners.getOrDefault(script.ownerFile(),Set.of())) {
          Map<String,Object> unit=new TreeMap<>();unit.put("file",script.file());unit.put("line",script.line());unit.put("code",script.code());unit.put("module",script.module());unit.put("screenId",screen);unit.put("ownerFile",script.ownerFile());unit.put("status",script.status());unit.put("elValues",script.elValues());unit.put("entryFile",script.file());if(script.guard()!=null)unit.put("guard",script.guard());
          if(!script.event().isEmpty())unit.put("event",script.event());if(script.componentId()!=null)unit.put("triggerId",script.componentId());units.add(unit);
          inclusionEvidence.computeIfAbsent(screen+":"+script.file(),k->new ArrayList<>()).addAll(script.evidence());
        }
        if(owners.getOrDefault(script.ownerFile(),Set.of()).isEmpty())diagnostics.add(diagnostic(new SourceLocation(script.file(),script.line()),"JS_SCREEN_OWNER","JS 來源沒有可證明的畫面所有者："+script.ownerFile()));
      }
      if(!units.isEmpty()) {
        JsonNode result=run(Map.of("sources",units,"dom",dom,"moduleFiles",collected.moduleFiles(),"maxDepth",Integer.getInteger("screentrace.js.maxDepth",10)));
        for(var item:result.path("rules")) {
          var source=source(item);var confidence=confidence(item);Map<String,String> parameters=new TreeMap<>();item.path("parameters").fields().forEachRemaining(e->parameters.put(e.getKey(),e.getValue().isNull()?"UNRESOLVED":e.getValue().asText()));
          List<String> fields=new ArrayList<>();item.path("fields").forEach(f->fields.add(f.asText()));
          var rule=new ValidationRule(item.path("id").asText(),item.path("kind").asText(),fields,nullable(item,"message"),ValidationLayer.CLIENT,parameters,proof(source,confidence,item.toString()));rules.putIfAbsent(rule.id(),rule);
        }
        for(var item:result.path("behaviors")) {
          String trigger=nullable(item,"triggerId");
          if(trigger!=null&&!nodes.containsKey(trigger)){var declaration=collected.dom().stream().filter(d->trigger.equals(d.get("componentId"))).findFirst();if(declaration.isPresent()){var d=declaration.get();Map<String,String> attrs=new TreeMap<>();((Map<?,?>)d.get("attrs")).forEach((k,v)->attrs.put(k.toString(),v.toString()));attrs.put("tag",d.get("sourceTag").toString());attrs.put("kind",d.get("kind").toString());attrs.put("javascriptInteractive","true");if(d.get("guard")!=null){attrs.put("guard",d.get("guard").toString());attrs.put("conditional","true");}var location=(SourceLocation)d.get("source");nodes.put(trigger,new GraphNode(trigger,NodeType.COMPONENT,attrs.getOrDefault("id",attrs.get("tag")),attrs,location,Confidence.CONFIRMED,proof(location,Confidence.CONFIRMED,"靜態 DOM 的 JS 事件來源")));for(String screen:owners.getOrDefault(location.file(),Set.of())){String id="contains:"+screen+":"+trigger;edges.put(id,new Relationship(id,EdgeType.CONTAINS,screen,trigger,Confidence.CONFIRMED,location,proof(location,Confidence.CONFIRMED,"JS 事件來源畫面所有權")));}}}
          if(trigger==null||!nodes.containsKey(trigger)){diagnostics.add(diagnostic(source(item),"JS_TRIGGER_UNRESOLVED",item.toString()));continue;}
          var type=BehaviorType.valueOf(item.path("type").asText());var source=source(item);var confidence=confidence(item);String target=nullable(item,"targetId");List<AnalysisEvidence> evidence=new ArrayList<>(proof(source,confidence,item.toString()));
          Set<String> screenIds=nodes.get(trigger).type()==NodeType.SCREEN?Set.of(trigger):owners.getOrDefault(nodes.get(trigger).source().file(),Set.of());for(String screen:screenIds)evidence.addAll(inclusionEvidence.getOrDefault(screen+":"+item.path("entryFile").asText(source.file()),List.of()));
          for(var trace:item.path("trace"))if(trace.has("source")){var s=trace.path("source");evidence.addAll(proof(new SourceLocation(s.path("file").asText(),s.path("line").asInt(1)),confidence,"跨函式呼叫："+trace.path("callee").asText()));}
          String url=nullable(item,"url"),method=nullable(item,"method");
          if(type==BehaviorType.CALL_API&&url!=null&&method!=null) {
            target=ApplicationGraph.id(NodeType.ENDPOINT,"javascript-request:"+method+":"+url);Map<String,String> attrs=new TreeMap<>();attrs.put("path",url);attrs.put("httpMethod",method);attrs.put("origin","javascript-request");attrs.put("backendStatus","UNRESOLVED");attrs.put("dataFields",item.path("dataFields").toString());
            var old=nodes.get(target);List<AnalysisEvidence> endpointProof=new ArrayList<>(evidence);if(old!=null)endpointProof.addAll(old.evidence());nodes.put(target,new GraphNode(target,NodeType.ENDPOINT,method+" "+url,attrs,old==null?source:old.source(),old==null?confidence:old.confidence(),endpointProof.stream().distinct().toList()));
            EdgeType edgeType=nodes.get(trigger).type()==NodeType.SCREEN?EdgeType.CALLS:EdgeType.TRIGGERS;String edgeId=edgeType.name().toLowerCase(Locale.ROOT)+":"+trigger+":"+target;
            var existing=edges.get(edgeId);List<AnalysisEvidence> edgeProof=new ArrayList<>(evidence);if(existing!=null)edgeProof.addAll(existing.evidence());edges.put(edgeId,new Relationship(edgeId,edgeType,trigger,target,confidence,source,edgeProof.stream().distinct().toList()));
          }
          var behavior=new Behavior(item.path("id").asText(),trigger,item.path("event").asText(),type,target,nullable(item,"guard"),nullable(item,"parentId"),item.path("expression").asText(),evidence.stream().distinct().toList());
          var existing=behaviors.get(behavior.id());if(existing!=null){var combined=new ArrayList<>(existing.evidence());combined.addAll(behavior.evidence());behavior=new Behavior(behavior.id(),behavior.triggerId(),behavior.event(),behavior.type(),behavior.targetId(),behavior.guard(),behavior.parentId(),behavior.expression(),combined.stream().distinct().toList());}behaviors.put(behavior.id(),behavior);
        }
        for(var item:result.path("diagnostics"))diagnostics.add(new Diagnostic(item.path("message").asText(),Confidence.UNRESOLVED,source(item),item.path("code").asText(),proof(source(item),Confidence.UNRESOLVED,item.path("message").asText())));
      }
    } catch(Exception error){diagnostics.add(diagnostic(new SourceLocation(".",1),"JS_ANALYZER_FAILURE","JavaScript 靜態分析失敗："+error.getMessage()));if(error instanceof InterruptedException)Thread.currentThread().interrupt();}
    return new ApplicationGraph(graph.application(),List.copyOf(nodes.values()),List.copyOf(edges.values()),diagnostics,graph.apiContracts(),graph.schemaVersion(),List.copyOf(behaviors.values()),List.copyOf(rules.values()));
  }
  private static JsonNode run(Map<String,Object> request) throws Exception {
    Path current=Path.of("").toAbsolutePath(),module=System.getProperty("screentrace.js.module")==null?null:Path.of(System.getProperty("screentrace.js.module")).toAbsolutePath();while(module==null&&current!=null){var candidate=current.resolve("screentrace-js/cli.mjs");if(io.screentrace.scanner.SafeProjectFiles.isSafeRegularFile(current,candidate)){module=candidate;break;}current=current.getParent();}
    if(module==null)throw new IOException("找不到工具 screentrace-js/cli.mjs");
    module=io.screentrace.scanner.SafeProjectFiles.requireExistingRegularFileWithin(module.getParent(),module);
    var process=new ProcessBuilder("node",module.toString()).redirectError(ProcessBuilder.Redirect.INHERIT).start();var executor=Executors.newSingleThreadExecutor();
    try {
      var output=executor.submit(()->process.getInputStream().readAllBytes());try(var input=process.getOutputStream()){JSON.writeValue(input,request);}
      byte[] bytes=output.get(60,TimeUnit.SECONDS);if(!process.waitFor(5,TimeUnit.SECONDS)||process.exitValue()!=0)throw new IOException("AST 工具退出失敗");return JSON.readTree(bytes);
    }finally{process.destroyForcibly();executor.shutdownNow();}
  }
  private static SourceLocation source(JsonNode item){return new SourceLocation(item.path("source").path("file").asText("."),item.path("source").path("line").asInt(1));}
  private static Confidence confidence(JsonNode item){return Confidence.valueOf(item.path("status").asText("UNRESOLVED"));}
  private static String nullable(JsonNode item,String key){return item.hasNonNull(key)?item.path(key).asText():null;}
  private static List<AnalysisEvidence> proof(SourceLocation source,Confidence confidence,String detail){return List.of(new AnalysisEvidence(source,"AcornStaticAnalyzer",ResolutionStatus.valueOf(confidence.name()),detail));}
  private static Diagnostic diagnostic(SourceLocation source,String code,String message){return new Diagnostic(message,Confidence.UNRESOLVED,source,code,proof(source,Confidence.UNRESOLVED,message));}
}
