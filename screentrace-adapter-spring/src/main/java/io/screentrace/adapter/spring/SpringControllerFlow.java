package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.UrlResolution;
import java.util.*;

/** Correlates proven handler return paths and projects every possible request outcome. */
final class SpringControllerFlow {
  record Pending(String handlerId,String requestMethod,SpringControllerReturns.Target target) { }
  private record Destination(String screen,Confidence confidence,List<AnalysisEvidence> evidence) { }
  static void resolve(List<GraphNode> nodes,List<Relationship> edges,List<Diagnostic> diagnostics,
                      List<Pending> pending,UrlResolution.Context context) {
    var resolver=new Resolver(nodes,edges,pending,context);
    for(var item:pending) {
      List<String> failures=new ArrayList<>();var destinations=resolver.resolve(item,new LinkedHashSet<>(List.of(item.handlerId())),0,failures);
      for(var destination:destinations) {
        String id=ApplicationGraph.id(NodeType.COMPONENT,"FORWARDS_TO:"+item.handlerId()+":"+destination.screen()+":"+item.target().source().line()+":"+item.target().expression()+SpringControllerReturns.branchKey(item.target()));
        edges.add(new Relationship(id,EdgeType.FORWARDS_TO,item.handlerId(),destination.screen(),destination.confidence(),item.target().source(),destination.evidence()));
      }
      if(destinations.stream().anyMatch(d->d.confidence()==Confidence.AMBIGUOUS)) {
        List<AnalysisEvidence> proof=new ArrayList<>(item.target().evidence());destinations.forEach(d->proof.addAll(d.evidence()));
        diagnostics.add(new Diagnostic("Controller 導向有多個候選，全部保留："+item.target().expression(),Confidence.AMBIGUOUS,item.target().source(),"SPRING_RETURN_AMBIGUOUS",proof.stream().distinct().sorted().toList()));
      }
      if(destinations.isEmpty()||!failures.isEmpty())unresolved(diagnostics,item.target(),failures.isEmpty()?"沒有可證明的目的畫面":String.join("；",new TreeSet<>(failures)));
    }
    addApiRedirects(nodes,edges,diagnostics,pending,context);
  }
  private static void addApiRedirects(List<GraphNode> nodes,List<Relationship> edges,List<Diagnostic> diagnostics,
                                     List<Pending> pending,UrlResolution.Context context) {
    Map<String,GraphNode> byId=new HashMap<>();nodes.forEach(node->byId.put(node.id(),node));
    List<UrlResolution.Endpoint> endpoints=nodes.stream().filter(n->n.type()==NodeType.ENDPOINT)
        .map(n->new UrlResolution.Endpoint(n.id(),n.attributes().getOrDefault("path",""),n.attributes().getOrDefault("httpMethod","ANY"),n.evidence())).toList();
    Map<String,Set<String>> routeLinks=new TreeMap<>();
    for(Pending item:pending) {
      var target=item.target();if(!Set.of(SpringControllerReturns.Kind.REDIRECT,SpringControllerReturns.Kind.REDIRECT_VIEW,SpringControllerReturns.Kind.FORWARD).contains(target.kind()))continue;
      String path=target.value();if(path==null||!path.startsWith("/")||path.startsWith("//")||path.contains("${")||path.contains("#{")) {
        diagnostics.add(new Diagnostic("轉址目的地無法靜態證明，未繼承呼叫來源",Confidence.UNRESOLVED,target.source(),"API_REDIRECT_UNRESOLVED",target.evidence()));continue;
      }
      String method=target.kind()==SpringControllerReturns.Kind.FORWARD?item.requestMethod():"GET";
      if(method.equals("ANY")||method.contains(",")||method.contains("|")) {
        diagnostics.add(new Diagnostic("轉址目的地的請求方法無法證明，未繼承呼叫來源",Confidence.UNRESOLVED,target.source(),"API_REDIRECT_UNRESOLVED",target.evidence()));continue;
      }
      boolean rawRedirectView=target.kind()==SpringControllerReturns.Kind.REDIRECT_VIEW;
      var match=UrlResolution.resolve(path,method,rawRedirectView?context:new UrlResolution.Context(List.of(),List.of()),endpoints,false);
      if(match.candidates().size()!=1) {
        if(match.candidates().size()>1)diagnostics.add(new Diagnostic("轉址目的地有多個候選，未繼承呼叫來源",Confidence.AMBIGUOUS,target.source(),"API_REDIRECT_AMBIGUOUS",target.evidence()));
        else diagnostics.add(new Diagnostic("轉址目的地無法唯一解析，未繼承呼叫來源",Confidence.UNRESOLVED,target.source(),"API_REDIRECT_UNRESOLVED",target.evidence()));
        continue;
      }
      String destination=match.candidates().get(0);GraphNode handler=byId.get(item.handlerId());
      if(handler==null||handler.type()!=NodeType.HANDLER)continue;
      List<Relationship> sources=edges.stream().filter(edge->edge.type()==EdgeType.HANDLED_BY&&edge.to().equals(handler.id())&&byId.get(edge.from())!=null&&byId.get(edge.from()).type()==NodeType.ENDPOINT).toList();
      for(Relationship source:sources) {
        GraphNode sourceEndpoint=byId.get(source.from()),targetEndpoint=byId.get(destination);
        List<AnalysisEvidence> proof=new ArrayList<>(target.evidence());proof.addAll(source.evidence());proof.addAll(handler.evidence());proof.addAll(sourceEndpoint.evidence());proof.addAll(targetEndpoint.evidence());
        proof.add(new AnalysisEvidence(target.source(),"RedirectInheritance",ResolutionStatus.INFERRED,
            "轉址鏈：來源端點="+sourceEndpoint.attributes().getOrDefault("httpMethod","ANY")+" "+sourceEndpoint.attributes().getOrDefault("path",sourceEndpoint.name())+
                "；處理器="+handler.name()+"；來源="+handler.source().file()+":"+handler.source().line()+
                "；原始轉址="+target.expression()+"；唯一目的端點="+targetEndpoint.attributes().getOrDefault("httpMethod","ANY")+" "+targetEndpoint.attributes().getOrDefault("path",targetEndpoint.name())));
        String id=ApplicationGraph.id(NodeType.HANDLER,"REDIRECT_INHERITANCE:"+source.from()+":"+handler.id()+":"+destination+":"+target.source().file()+":"+target.source().line());
        edges.add(new Relationship(id,EdgeType.CALLS,handler.id(),destination,Confidence.INFERRED,target.source(),proof.stream().distinct().sorted().toList()));
        routeLinks.computeIfAbsent(source.from(),ignored->new TreeSet<>()).add(destination);
      }
    }
    reportRedirectCyclesAndDepth(nodes,edges,diagnostics,routeLinks);
  }
  private static void reportRedirectCyclesAndDepth(List<GraphNode> nodes,List<Relationship> edges,List<Diagnostic> diagnostics,Map<String,Set<String>> links) {
    Map<String,GraphNode> byId=new HashMap<>();nodes.forEach(node->byId.put(node.id(),node));
    Set<String> cycles=new TreeSet<>(),depths=new TreeSet<>();
    for(String source:links.keySet())walkRedirects(source,source,0,new LinkedHashSet<>(List.of(source)),links,cycles,depths);
    for(String endpoint:cycles) {
      var node=byId.get(endpoint);if(node!=null)diagnostics.add(new Diagnostic("轉址鏈偵測到循環，停止繼承",Confidence.UNRESOLVED,node.source(),"API_REDIRECT_CYCLE",node.evidence()));
    }
    for(String endpoint:depths) {
      var node=byId.get(endpoint);if(node!=null)diagnostics.add(new Diagnostic("轉址鏈超過 5 跳，後續來源不再繼承",Confidence.UNRESOLVED,node.source(),"API_REDIRECT_DEPTH_LIMIT",node.evidence()));
    }
  }
  private static void walkRedirects(String origin,String current,int depth,LinkedHashSet<String> path,Map<String,Set<String>> links,Set<String> cycles,Set<String> depths) {
    Set<String> next=links.getOrDefault(current,Set.of());if(depth>=5&&!next.isEmpty()){depths.add(current);return;}
    for(String destination:next)if(path.contains(destination))cycles.add(destination);else {var child=new LinkedHashSet<>(path);child.add(destination);walkRedirects(origin,destination,depth+1,child,links,cycles,depths);}
  }
  static void unresolved(List<Diagnostic> diagnostics,SpringControllerReturns.Target target,String reason) {
    diagnostics.add(new Diagnostic("Controller 回傳目標未解析："+target.expression()+"；"+reason,Confidence.UNRESOLVED,target.source(),"SPRING_RETURN_UNRESOLVED",target.evidence()));
  }
  private static final class Resolver {
    final List<GraphNode> nodes;final List<Relationship> edges;final List<Pending> pending;final UrlResolution.Context context;
    final List<UrlResolution.Endpoint> endpoints;
    Resolver(List<GraphNode> nodes,List<Relationship> edges,List<Pending> pending,UrlResolution.Context context) {
      this.nodes=nodes;this.edges=List.copyOf(edges);this.pending=pending;this.context=context;
      endpoints=nodes.stream().filter(n->n.type()==NodeType.ENDPOINT).map(n->new UrlResolution.Endpoint(n.id(),n.attributes().getOrDefault("path",""),n.attributes().getOrDefault("httpMethod","ANY"),n.evidence())).toList();
    }
    List<Destination> resolve(Pending item,Set<String> stack,int depth,List<String> failures) {
      if(depth>=10){failures.add("導向追蹤超過深度 10");return List.of();}
      var target=item.target();String path=target.value();
      if(path==null||!path.startsWith("/")||path.startsWith("//")||path.contains("${")||path.contains("#{")) {failures.add("非專案內可證明的絕對路徑");return List.of();}
      String method=target.kind()==SpringControllerReturns.Kind.FORWARD?item.requestMethod():"GET";
      if(method.equals("ANY")||method.contains(",")||method.contains("|")){failures.add("無法證明 forward 的請求方法");return List.of();}
      // String redirect:/ and forward:/ address application routes. Do not strip a
      // deployment prefix from that app-relative syntax. No context value is invented.
      boolean rawRedirectView=target.kind()==SpringControllerReturns.Kind.REDIRECT_VIEW;
      var result=UrlResolution.resolve(path,method,rawRedirectView?context:new UrlResolution.Context(List.of(),List.of()),endpoints,false);
      if(result.candidates().isEmpty()){failures.add("目的端點無法唯一證明："+result.diagnostics());return List.of();}
      List<String> candidates=endpoints.stream().filter(e->result.candidates().contains(e.id())).map(e->e.method()+" "+e.path()+" ["+e.id()+"]").sorted().toList();
      List<AnalysisEvidence> routeProof=new ArrayList<>(target.evidence());
      routeProof.add(new AnalysisEvidence(target.source(),"SpringControllerFlow",result.confidence()==Confidence.AMBIGUOUS?ResolutionStatus.AMBIGUOUS:ResolutionStatus.INFERRED,"導向規則="+target.kind()+"；路徑樣板="+path+"；方法="+method+"；全部候選="+candidates));
      List<Destination> destinations=new ArrayList<>();
      for(String endpoint:result.candidates())for(var handled:edges)if(handled.type()==EdgeType.HANDLED_BY&&handled.from().equals(endpoint)) {
        String handler=handled.to();
        if(stack.contains(handler)){failures.add("導向循環，未推測目的畫面");continue;}
        List<AnalysisEvidence> chain=new ArrayList<>(routeProof);chain.addAll(handled.evidence());
        for(var render:edges)if(render.type()==EdgeType.RENDERS&&render.from().equals(handler)) {
          List<AnalysisEvidence> proof=new ArrayList<>(chain);proof.addAll(render.evidence());
          destinations.add(new Destination(render.to(),result.confidence()==Confidence.AMBIGUOUS?Confidence.AMBIGUOUS:Confidence.INFERRED,proof.stream().distinct().sorted().toList()));
        }
        Set<String> nextStack=new LinkedHashSet<>(stack);nextStack.add(handler);
        for(var child:pending)if(child.handlerId().equals(handler))for(var destination:resolve(child,nextStack,depth+1,failures)) {
          List<AnalysisEvidence> proof=new ArrayList<>(chain);proof.addAll(destination.evidence());
          destinations.add(new Destination(destination.screen(),result.confidence()==Confidence.AMBIGUOUS?Confidence.AMBIGUOUS:destination.confidence(),proof.stream().distinct().sorted().toList()));
        }
      }
      return merge(destinations);
    }
  }
  private static List<Destination> merge(List<Destination> destinations) {
    Map<String,Destination> result=new TreeMap<>();
    for(var d:destinations){var old=result.get(d.screen());List<AnalysisEvidence> proof=new ArrayList<>(d.evidence());if(old!=null)proof.addAll(old.evidence());result.put(d.screen(),new Destination(d.screen(),d.confidence()==Confidence.AMBIGUOUS||old!=null&&old.confidence()==Confidence.AMBIGUOUS?Confidence.AMBIGUOUS:Confidence.INFERRED,proof.stream().distinct().sorted().toList()));}
    return List.copyOf(result.values());
  }
  static ApplicationGraph project(ApplicationGraph graph) {
    Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));
    Map<String,Relationship> output=new TreeMap<>();graph.relationships().forEach(e->output.put(e.id(),e));
    for(var request:graph.relationships())if(request.type()==EdgeType.TRIGGERS&&nodes.get(request.from())!=null&&nodes.get(request.from()).type()==NodeType.COMPONENT) {
      boolean navigation=graph.behaviors().stream().anyMatch(b->request.from().equals(b.triggerId())
          &&Set.of(BehaviorType.NAVIGATE,BehaviorType.SUBMIT_FORM).contains(b.type())
          &&(request.to().equals(b.targetId())||b.targetId()==null&&request.evidence().containsAll(b.evidence())));
      if(!navigation)continue;
      for(var handled:graph.relationships())if(handled.type()==EdgeType.HANDLED_BY&&handled.from().equals(request.to()))
        for(var destination:graph.relationships())if(Set.of(EdgeType.RENDERS,EdgeType.FORWARDS_TO).contains(destination.type())&&destination.from().equals(handled.to())&&nodes.get(destination.to()).type()==NodeType.SCREEN) {
          String id=ApplicationGraph.id(NodeType.COMPONENT,"NAVIGATES_TO:"+request.from()+":"+destination.to());
          List<AnalysisEvidence> proof=new ArrayList<>(request.evidence());proof.addAll(handled.evidence());proof.addAll(destination.evidence());
          var old=output.get(id);if(old!=null)proof.addAll(old.evidence());
          Confidence confidence=request.confidence()==Confidence.AMBIGUOUS||destination.confidence()==Confidence.AMBIGUOUS?Confidence.AMBIGUOUS:Confidence.INFERRED;
          output.put(id,new Relationship(id,EdgeType.NAVIGATES_TO,request.from(),destination.to(),confidence,nodes.get(request.from()).source(),proof.stream().distinct().sorted().toList()));
        }
    }
    return new ApplicationGraph(graph.application(),graph.nodes(),List.copyOf(output.values()),graph.diagnostics(),graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
  }
}
