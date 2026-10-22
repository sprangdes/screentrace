package io.screentrace.adapter.spring;
import com.github.javaparser.ast.*;import com.github.javaparser.ast.body.*;import com.github.javaparser.ast.expr.*;import io.screentrace.core.*;import io.screentrace.core.ApplicationGraph.*;import io.screentrace.scanner.ProjectScanner.ProjectInventory;import java.util.*;
/** Source-configured filter entry points, not an authentication implementation. */
final class SpringSecurityProcessors {
 private record Type(ClassOrInterfaceDeclaration node,String file){}
 private record Destination(String path,SourceLocation source){}
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory){return enrich(graph,inventory,new ParsedJavaUnits(inventory.root()));}
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory,ParsedJavaUnits units){List<Type> types=new ArrayList<>();
  for(var file:inventory.javaFiles())try{var unit=units.parse(file);String path=inventory.root().relativize(file).toString().replace('\\','/');for(var t:unit.getTypes())if(t instanceof ClassOrInterfaceDeclaration c)types.add(new Type(c,path));}catch(Exception ignored){}
  Map<String,GraphNode> nodes=new TreeMap<>();graph.nodes().forEach(n->nodes.put(n.id(),n));Map<String,Relationship> edges=new TreeMap<>();graph.relationships().forEach(e->edges.put(e.id(),e));List<Diagnostic> diagnostics=new ArrayList<>(graph.diagnostics());
  for(var type:types)for(var method:type.node.getMethods()){
   var request=method.getParameters().stream().filter(p->p.getType().asString().equals("HttpSecurity")).toList();if(request.size()!=1||method.getAnnotationByName("Bean").isEmpty()||!imports(type.node,"org.springframework.security.config.annotation.web.builders.HttpSecurity"))continue;
   String security=request.get(0).getNameAsString();
   if(method.getBody().isEmpty()||types.stream().anyMatch(t->t.node.getNameAsString().equals("HttpSecurity"))||method.findAll(AssignExpr.class).stream().anyMatch(a->a.getTarget().toString().equals(security))||method.findAll(VariableDeclarator.class).stream().anyMatch(v->v.getNameAsString().equals(security)))continue;
   for(var registration:method.findAll(MethodCallExpr.class))if(Set.of("formLogin","logout").contains(registration.getNameAsString())&&root(registration).equals(request.get(0).getNameAsString())&&registration.getArguments().size()==1&&registration.getArgument(0).isLambdaExpr()){
    if(registration.findAncestor(com.github.javaparser.ast.stmt.ExpressionStmt.class).filter(st->st.getParentNode().orElse(null)==method.getBody().get()).isEmpty()||method.findAll(MethodCallExpr.class).stream().filter(c->c.getNameAsString().equals(registration.getNameAsString())&&root(c).equals(security)).count()!=1)continue;
    var lambda=registration.getArgument(0).asLambdaExpr();if(lambda.getParameters().size()!=1)continue;String receiver=lambda.getParameter(0).getNameAsString();var settings=lambda.findAll(MethodCallExpr.class).stream().filter(c->root(c).equals(receiver)&&c.findAncestor(LambdaExpr.class).orElse(null)==lambda&&c.findAncestor(com.github.javaparser.ast.stmt.IfStmt.class).isEmpty()&&c.findAncestor(com.github.javaparser.ast.stmt.ForStmt.class).isEmpty()).toList();boolean login=registration.getNameAsString().equals("formLogin");String key=login?"loginProcessingUrl":"logoutUrl";var path=literal(settings,key,type.file);if(path==null)continue;
    SourceLocation source=path.source;List<AnalysisEvidence> proof=new ArrayList<>();proof.add(new AnalysisEvidence(source,"SpringSecurityProcessors",ResolutionStatus.CONFIRMED,"來源 HttpSecurity "+key+"="+path.path+"；未執行 filter、認證、授權或 session"));
    List<Destination> destinations=new ArrayList<>();if(!login){var target=literal(settings,"logoutSuccessUrl",type.file);if(target!=null)destinations.add(target);}else{
     var direct=literal(settings,"defaultSuccessUrl",type.file);if(direct!=null)destinations.add(direct);
     var handlers=settings.stream().filter(c->c.getNameAsString().equals("successHandler")&&c.getArguments().size()==1&&c.getArgument(0).isNameExpr()).toList();
     if(handlers.size()==1){String parameter=handlers.get(0).getArgument(0).asNameExpr().getNameAsString();boolean injected=method.getParameters().stream().anyMatch(p->p.getNameAsString().equals(parameter)&&p.getType().asString().equals("AuthenticationSuccessHandler")&&p.getAnnotationByName("Qualifier").isEmpty());
      var candidates=types.stream().filter(t->t.node.getImplementedTypes().stream().anyMatch(i->i.getNameAsString().equals("AuthenticationSuccessHandler"))&&imports(t.node,"org.springframework.security.web.authentication.AuthenticationSuccessHandler")&&t.node.getAnnotations().stream().anyMatch(a->Set.of("Controller","Component","Service").contains(a.getNameAsString()))).toList();if(injected&&candidates.size()==1)destinations.addAll(successRedirects(candidates.get(0)));
     }
    }
    String endpoint=StableGraphIds.endpoint("POST",path.path),handler=ApplicationGraph.id(NodeType.HANDLER,type.file+":"+method.getNameAsString()+":"+key);if(nodes.containsKey(endpoint))continue;
    nodes.put(endpoint,new GraphNode(endpoint,NodeType.ENDPOINT,"POST "+path.path,Map.of("path",path.path,"httpMethod","POST","category","SECURITY_PROCESSOR"),source,Confidence.CONFIRMED,proof));var attrs=new TreeMap<String,String>();attrs.put("method",method.getNameAsString());attrs.put("processor",login?"authentication":"logout");if(login)attrs.put("unresolvedReturnCount","1");nodes.put(handler,new GraphNode(handler,NodeType.HANDLER,login?"來源設定的登入處理":"來源設定的登出處理",attrs,source,Confidence.INFERRED,proof));edge(edges,EdgeType.HANDLED_BY,endpoint,handler,source,proof);
    for(var destination:destinations){var destinationProof=new ArrayList<>(proof);destinationProof.add(new AnalysisEvidence(destination.source,"SpringSecurityProcessors",ResolutionStatus.INFERRED,"來源正常分支目標="+destination.path+"；真實服務結果未執行"));for(String target:screens(graph,destination.path))edge(edges,EdgeType.FORWARDS_TO,handler,target,destination.source,destinationProof);}
    if(destinations.isEmpty())diagnostics.add(new Diagnostic("來源處理入口已找到；執行結果無法確認",Confidence.UNRESOLVED,source,"SECURITY_PROCESSOR_RESULT_UNRESOLVED",proof));
   }
  }
  xmlNamespace(graph,inventory,nodes,edges,diagnostics);
  return new ApplicationGraph(graph.application(),List.copyOf(nodes.values()),List.copyOf(edges.values()),diagnostics,graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
 }
 /**
  * Spring Security XML namespace: <form-login> and <logout> inside <http>. An explicit login-processing-url / logout-url
  * is CONFIRMED; otherwise the declared Spring Security generation's default is INFERRED (3.x: POST /j_spring_security_check
  * and /j_spring_security_logout for any method; 4.0+: POST /login and POST /logout). Without a declared version nothing is guessed.
  */
 private static void xmlNamespace(ApplicationGraph graph,ProjectInventory inventory,Map<String,GraphNode> nodes,Map<String,Relationship> edges,List<Diagnostic> diagnostics){
  var version=io.screentrace.scanner.BuildVersions.of(inventory,"spring-security-config").or(()->io.screentrace.scanner.BuildVersions.of(inventory,"spring-security-web"));
  for(var file:inventory.files()){
   if(!file.getFileName().toString().endsWith(".xml"))continue;String relative=inventory.root().relativize(file).toString().replace('\\','/');String text;
   try{text=io.screentrace.scanner.SafeProjectFiles.readUtf8Limited(inventory.root(),file,io.screentrace.scanner.SafeProjectFiles.MAX_XML_FILE_BYTES);}catch(Exception unreadable){continue;}
   if(!text.contains("www.springframework.org/schema/security"))continue;
   for(var tag:io.screentrace.parser.jsp.MarkupTag.scan(text)){
    if(tag.closing())continue;String local=tag.name().replaceFirst("^.*:","");
    if(local.equals("form-login"))xmlProcessor(graph,true,tag.attribute("login-processing-url"),tag.attribute("default-target-url"),new SourceLocation(relative,tag.line()),version,nodes,edges,diagnostics);
    else if(local.equals("logout"))xmlProcessor(graph,false,tag.attribute("logout-url"),tag.attribute("logout-success-url"),new SourceLocation(relative,tag.line()),version,nodes,edges,diagnostics);
   }
  }
 }
 private static void xmlProcessor(ApplicationGraph graph,boolean login,String explicit,String target,SourceLocation source,Optional<io.screentrace.scanner.BuildVersions.Declared> version,Map<String,GraphNode> nodes,Map<String,Relationship> edges,List<Diagnostic> diagnostics){
  String key=login?"login-processing-url":"logout-url",element=login?"<form-login>":"<logout>";String path;ResolutionStatus status;String detail;
  if(explicit!=null){
   path=explicit.trim();
   if(!path.startsWith("/")||path.startsWith("//")||path.contains("${")||path.contains("#{")){diagnostics.add(new Diagnostic("Spring Security "+element+" "+key+" 不是可證明的字面路徑："+path,Confidence.UNRESOLVED,source,"SECURITY_PROCESSOR_DYNAMIC",List.of(new AnalysisEvidence(source,"SpringSecurityProcessors",ResolutionStatus.UNRESOLVED,key+"="+path))));return;}
   status=ResolutionStatus.CONFIRMED;detail="XML "+element+" "+key+"="+path;
  }else if(version.isPresent()){
   boolean legacy=version.get().majorVersion()<4;path=login?(legacy?"/j_spring_security_check":"/login"):(legacy?"/j_spring_security_logout":"/logout");
   status=ResolutionStatus.INFERRED;detail="Spring Security "+version.get().version()+"（"+version.get().file()+"）的 "+element+" 預設 "+key+"="+path;
  }else{diagnostics.add(new Diagnostic("Spring Security 版本未宣告，無法確定 "+element+" 的預設處理網址",Confidence.UNRESOLVED,source,"SECURITY_PROCESSOR_DEFAULT_UNRESOLVED",List.of(new AnalysisEvidence(source,"SpringSecurityProcessors",ResolutionStatus.UNRESOLVED,element+" 未設定 "+key))));return;}
  // UsernamePasswordAuthenticationFilter only accepts POST; a 3.x LogoutFilter matches any method, 4.0+ (CSRF on by default) POST.
  String method=login||version.map(v->v.majorVersion()>=4).orElse(false)?"POST":"ANY";
  String endpoint=StableGraphIds.endpoint(method,path),handler=ApplicationGraph.id(NodeType.HANDLER,source.file()+":xml:"+(login?"form-login":"logout"));if(nodes.containsKey(endpoint))return;
  List<AnalysisEvidence> proof=List.of(new AnalysisEvidence(source,"SpringSecurityProcessors",status,detail+"；未執行 filter、認證、授權或 session"));
  Confidence confidence=status==ResolutionStatus.CONFIRMED?Confidence.CONFIRMED:Confidence.INFERRED;
  nodes.put(endpoint,new GraphNode(endpoint,NodeType.ENDPOINT,method+" "+path,Map.of("path",path,"httpMethod",method,"category","SECURITY_PROCESSOR"),source,confidence,proof));
  var attrs=new TreeMap<String,String>();attrs.put("processor",login?"authentication":"logout");if(login)attrs.put("unresolvedReturnCount","1");
  nodes.put(handler,new GraphNode(handler,NodeType.HANDLER,login?"來源設定的登入處理":"來源設定的登出處理",attrs,source,Confidence.INFERRED,proof));edge(edges,EdgeType.HANDLED_BY,endpoint,handler,source,proof);
  // Requests to exactly this path were matched before the processor existed; the next URL pass re-checks them and re-reports real misses.
  diagnostics.removeIf(d->Set.of("URL_UNRESOLVED","URL_METHOD_MISMATCH").contains(d.code())&&d.evidence().stream().anyMatch(e->("原始 URL="+path).equals(e.detail())));
  String destination=target==null?null:target.trim();
  if(destination!=null&&destination.startsWith("/")&&!destination.startsWith("//")&&!destination.contains("${")){
   var destinationProof=new ArrayList<>(proof);destinationProof.add(new AnalysisEvidence(source,"SpringSecurityProcessors",ResolutionStatus.INFERRED,"來源正常分支目標="+destination+"；真實服務結果未執行"));
   for(String screen:screens(graph,destination.split("[?#]",2)[0]))edge(edges,EdgeType.FORWARDS_TO,handler,screen,source,destinationProof);
  }else diagnostics.add(new Diagnostic("來源處理入口已找到；執行結果無法確認",Confidence.UNRESOLVED,source,"SECURITY_PROCESSOR_RESULT_UNRESOLVED",proof));
 }
 private static boolean imports(ClassOrInterfaceDeclaration t,String name){return t.findCompilationUnit().orElseThrow().getImports().stream().anyMatch(i->!i.isAsterisk()&&i.getNameAsString().equals(name));}
 private static String root(Expression e){if(e instanceof NameExpr n)return n.getNameAsString();if(e instanceof MethodCallExpr c&&c.getScope().isPresent())return root(c.getScope().get());return "";}
 private static Destination literal(List<MethodCallExpr> calls,String key,String file){var found=calls.stream().filter(c->c.getNameAsString().equals(key)).toList();if(found.size()!=1||found.get(0).getArguments().isEmpty()||!found.get(0).getArgument(0).isStringLiteralExpr())return null;var call=found.get(0);String path=call.getArgument(0).asStringLiteralExpr().asString();return path.startsWith("/")&&!path.startsWith("//")&&!path.contains("{")&&!path.contains("..")?new Destination(path,new SourceLocation(file,call.getName().getBegin().orElseThrow().line)):null;}
 private static List<Destination> successRedirects(Type type){var methods=type.node.getMethodsByName("onAuthenticationSuccess");if(methods.size()!=1)return List.of();var method=methods.get(0);var responses=method.getParameters().stream().filter(p->p.getType().asString().equals("HttpServletResponse")).map(p->p.getNameAsString()).toList();var requests=method.getParameters().stream().filter(p->p.getType().asString().equals("HttpServletRequest")).map(p->p.getNameAsString()).toList();if(responses.size()!=1||requests.size()!=1||method.getBody().isEmpty())return List.of();if(method.findAll(AssignExpr.class).stream().anyMatch(a->requests.contains(a.getTarget().toString())||responses.contains(a.getTarget().toString()))||method.findAll(VariableDeclarator.class).stream().anyMatch(v->requests.contains(v.getNameAsString())||responses.contains(v.getNameAsString())))return List.of();List<Destination> result=new ArrayList<>();
  for(var call:method.findAll(MethodCallExpr.class))if(call.getNameAsString().equals("sendRedirect")&&call.getScope().filter(s->s.toString().equals(responses.get(0))).isPresent()&&call.getArguments().size()==1&&call.findAncestor(com.github.javaparser.ast.stmt.ExpressionStmt.class).filter(s->s.getParentNode().orElse(null)==method.getBody().get()).isPresent()){
   var arg=call.getArgument(0);if(!arg.isBinaryExpr()||arg.asBinaryExpr().getOperator()!=BinaryExpr.Operator.PLUS)continue;var pair=arg.asBinaryExpr();if(!pair.getRight().isStringLiteralExpr()||!pair.getLeft().toString().equals(requests.get(0)+".getContextPath()"))continue;String path=pair.getRight().asStringLiteralExpr().asString();if(path.startsWith("/")&&!path.startsWith("//")&&!path.contains(".."))result.add(new Destination(path,new SourceLocation(type.file,call.getBegin().orElseThrow().line)));
  }return result.size()==1?result:List.of();
 }
 private static Set<String> screens(ApplicationGraph graph,String path){Set<String> handlers=new TreeSet<>(),result=new TreeSet<>();for(var endpoint:graph.nodes())if(endpoint.type()==NodeType.ENDPOINT&&path.equals(endpoint.attributes().get("path"))&&Set.of("GET","ANY").contains(endpoint.attributes().get("httpMethod")))graph.relationships().stream().filter(e->e.type()==EdgeType.HANDLED_BY&&e.from().equals(endpoint.id())).forEach(e->handlers.add(e.to()));for(var edge:graph.relationships())if(handlers.contains(edge.from())&&Set.of(EdgeType.RENDERS,EdgeType.FORWARDS_TO).contains(edge.type()))result.add(edge.to());return result;}
 private static void edge(Map<String,Relationship> edges,EdgeType kind,String from,String to,SourceLocation source,List<AnalysisEvidence> proof){String id=ApplicationGraph.id(NodeType.COMPONENT,"security:"+kind+":"+from+":"+to);edges.put(id,new Relationship(id,kind,from,to,Confidence.INFERRED,source,proof));}
}
