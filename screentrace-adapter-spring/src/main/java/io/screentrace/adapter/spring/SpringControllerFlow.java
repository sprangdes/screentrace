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
        String id=ApplicationGraph.id(NodeType.COMPONENT,"FORWARDS_TO:"+item.handlerId()+":"+destination.screen()+":"+item.target().source().line()+":"+item.target().expression());
        edges.add(new Relationship(id,EdgeType.FORWARDS_TO,item.handlerId(),destination.screen(),destination.confidence(),item.target().source(),destination.evidence()));
      }
      if(destinations.stream().anyMatch(d->d.confidence()==Confidence.AMBIGUOUS)) {
        List<AnalysisEvidence> proof=new ArrayList<>(item.target().evidence());destinations.forEach(d->proof.addAll(d.evidence()));
        diagnostics.add(new Diagnostic("Controller 導向有多個候選，全部保留："+item.target().expression(),Confidence.AMBIGUOUS,item.target().source(),"SPRING_RETURN_AMBIGUOUS",proof.stream().distinct().sorted().toList()));
      }
      if(destinations.isEmpty()||!failures.isEmpty())unresolved(diagnostics,item.target(),failures.isEmpty()?"沒有可證明的目的畫面":String.join("；",new TreeSet<>(failures)));
    }
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
