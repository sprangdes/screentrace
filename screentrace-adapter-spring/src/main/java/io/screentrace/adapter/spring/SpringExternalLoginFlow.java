package io.screentrace.adapter.spring;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.ReturnStmt;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.JavaSources;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.nio.file.Path;
import java.util.*;

/** Source-only correlation of full-page API entries, OAuth success-handler wiring and callback redirects. */
final class SpringExternalLoginFlow {
 private static final String PARSER="SpringExternalLoginFlow";
 private record Unit(String file,CompilationUnit ast) { }
 private record Callback(Unit unit,ClassOrInterfaceDeclaration type,SourceLocation wiring) { }
 private record Values(Set<String> paths,boolean unresolved,List<SourceLocation> sources) { }
 private SpringExternalLoginFlow() { }

 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory) {
  if(!"2.3".equals(graph.schemaVersion()))return graph;
  var units=new TreeMap<String,Unit>();
  for(Path file:inventory.javaFiles())try {
   String name=inventory.root().relativize(file).toString().replace('\\','/');
   units.put(name,new Unit(name,JavaSources.parse(SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES))));
  }catch(Exception ignored){/* The source parser already reports unreadable Java files. */}
  List<Callback> callbacks=new ArrayList<>();boolean oauth=false,customAuthorizationBase=false;Set<String> authorizationUris=new TreeSet<>();
  for(Unit unit:units.values())for(MethodCallExpr call:unit.ast().findAll(MethodCallExpr.class)) {
   if(call.getNameAsString().equals("oauth2Login"))oauth=true;
   if(call.getNameAsString().equals("baseUri")&&insideCall(call,"authorizationEndpoint"))customAuthorizationBase=true;
   if(call.getNameAsString().equals("authorizationUri")&&call.getArguments().size()==1&&call.getArgument(0).isStringLiteralExpr()&&call.getScope().map(scope->clientRegistrationScope(scope,unit)).orElse(false))authorizationUris.add(call.getArgument(0).asStringLiteralExpr().asString());
   if(!call.getNameAsString().equals("successHandler")||call.getArguments().size()!=1||!insideOAuth(call))continue;
   String name=callbackType(call,call.getArgument(0));if(name==null)continue;
   List<Callback> found=new ArrayList<>();
   for(Unit candidate:units.values())for(var type:candidate.ast().findAll(ClassOrInterfaceDeclaration.class))
    if(type.getNameAsString().equals(simple(name))&&type.getImplementedTypes().stream().anyMatch(t->t.getNameAsString().equals("AuthenticationSuccessHandler")))found.add(new Callback(candidate,type,source(unit.file(),call)));
   if(found.size()==1)callbacks.add(found.get(0));
  }
  if(!oauth)return graph;
  final boolean defaultAuthorizationBase=!customAuthorizationBase;
  var nodes=new TreeMap<String,GraphNode>();graph.nodes().forEach(n->nodes.put(n.id(),n));
  var edges=new ArrayList<>(graph.relationships());var diagnostics=new ArrayList<>(graph.diagnostics());
  for(Relationship handled:graph.relationships()) {
   if(handled.type()!=EdgeType.HANDLED_BY)continue;
   GraphNode endpoint=nodes.get(handled.from()),handler=nodes.get(handled.to());
   if(endpoint==null||handler==null||handler.source()==null)continue;
   boolean fullPage=graph.behaviors().stream().filter(b->b.type()==BehaviorType.CALL_API&&endpoint.id().equals(b.targetId())).flatMap(b->b.evidence().stream()).anyMatch(e->e.detail()!=null&&e.detail().contains("\"fullPage\":true"));
   if(!fullPage)continue;
   Unit unit=units.get(handler.source().file());if(unit==null)continue;
   List<MethodDeclaration> methods=unit.ast().findAll(MethodDeclaration.class).stream().filter(m->m.getNameAsString().equals(handler.attributes().get("method"))&&m.findAncestor(ClassOrInterfaceDeclaration.class).map(t->t.getNameAsString().equals(handler.attributes().get("class"))).orElse(false)).toList();
   if(methods.size()!=1)continue;
   var method=methods.get(0);var type=method.findAncestor(ClassOrInterfaceDeclaration.class).orElseThrow();
   Set<String> gateways=new TreeSet<>();List<SourceLocation> entryProof=new ArrayList<>();
   for(MethodCallExpr call:method.findAll(MethodCallExpr.class))if(call.getNameAsString().equals("sendRedirect")&&call.getArguments().size()==1){Values value=values(call.getArgument(0),unit,type,method,0,new HashSet<>());gateways.addAll(value.paths());entryProof.add(source(unit.file(),call));}
   for(ReturnStmt ret:method.findAll(ReturnStmt.class))if(ret.getExpression().isPresent()){var value=values(ret.getExpression().get(),unit,type,method,0,new HashSet<>());for(String path:value.paths())if(path.startsWith("redirect:")){gateways.add(path.substring(9));entryProof.add(source(unit.file(),ret));}}
   gateways.removeIf(path->!(authorizationUris.stream().anyMatch(uri->path.equals(uri)||path.startsWith(uri+"?"))||(defaultAuthorizationBase&&path.startsWith("/oauth2/authorization/"))));
   if(gateways.isEmpty())continue;
   var attrs=new TreeMap<>(endpoint.attributes());attrs.put("externalLogin","true");attrs.put("externalLoginGateway",String.join("\u001f",gateways));
   var proof=new ArrayList<>(endpoint.evidence());for(var src:entryProof)proof.add(evidence(src,"整頁導向至登入授權入口"));
   if(callbacks.size()!=1) {
    attrs.put("externalLoginReturnUnresolved","true");diagnostics.add(diagnostic(endpoint.source(),"EXTERNAL_LOGIN_CALLBACK_UNRESOLVED","無法唯一解析 OAuth successHandler 的來源型別"));
   } else {
    Callback callback=callbacks.get(0);proof.add(evidence(callback.wiring(),"oauth2Login successHandler 設定"));
    Set<String> returns=new TreeSet<>();boolean unresolved=false;
    for(var success:callback.type().getMethodsByName("onAuthenticationSuccess"))for(var redirect:success.findAll(MethodCallExpr.class))if(redirect.getNameAsString().equals("sendRedirect")&&redirect.getArguments().size()==1){
     Values value=values(redirect.getArgument(0),callback.unit(),callback.type(),success,0,new HashSet<>());returns.addAll(value.paths());unresolved|=value.unresolved();proof.add(evidence(source(callback.unit().file(),redirect),"登入完成後導回；表達式="+redirect.getArgument(0)));for(var src:value.sources())proof.add(evidence(src,"導回路徑回傳來源"));
    }
    if(returns.isEmpty())unresolved=true;
    if(!returns.isEmpty())attrs.put("externalLoginReturns",String.join("\u001f",returns));
    if(unresolved){attrs.put("externalLoginReturnUnresolved","true");diagnostics.add(diagnostic(callback.wiring(),"EXTERNAL_LOGIN_RETURN_UNRESOLVED","登入導回路徑來自未解析設定或運算式；不猜測前端路由"));}
    for(String target:returns){String route=target.split("[?#]",2)[0];for(GraphNode screen:graph.nodes())if(screen.type()==NodeType.SCREEN&&route.equals(screen.attributes().get("route"))){String id=ApplicationGraph.id(NodeType.ENTRY_POINT,endpoint.id()+":"+screen.id()+":"+target);edges.add(new Relationship(id,EdgeType.FORWARDS_TO,endpoint.id(),screen.id(),Confidence.INFERRED,callback.wiring(),List.of(evidence(callback.wiring(),"外部登入導回；網址="+target))));}}
   }
   nodes.put(endpoint.id(),new GraphNode(endpoint.id(),endpoint.type(),endpoint.name(),attrs,endpoint.source(),endpoint.confidence(),proof.stream().distinct().sorted().toList(),endpoint.audience()));
  }
  return new ApplicationGraph(graph.application(),List.copyOf(nodes.values()),edges,diagnostics.stream().distinct().toList(),graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
 }
 private static boolean insideOAuth(MethodCallExpr call){return insideCall(call,"oauth2Login");}
 private static boolean insideCall(MethodCallExpr call,String name){for(var parent=call.getParentNode();parent.isPresent();parent=parent.get().getParentNode())if(parent.get() instanceof MethodCallExpr method&&method.getNameAsString().equals(name))return true;return false;}
 private static boolean clientRegistrationScope(Expression scope,Unit unit){
  if(!scope.isMethodCallExpr())return false;
  var call=scope.asMethodCallExpr();
  if(call.getNameAsString().equals("withRegistrationId")&&call.getScope().isPresent()&&call.getScope().get().isNameExpr()&&call.getScope().get().asNameExpr().getNameAsString().equals("ClientRegistration"))
   return unit.ast().getImports().stream().anyMatch(i->i.getNameAsString().equals("org.springframework.security.oauth2.client.registration.ClientRegistration")||i.isAsterisk()&&i.getNameAsString().equals("org.springframework.security.oauth2.client.registration"));
  return call.getScope().map(s->clientRegistrationScope(s,unit)).orElse(false);
 }
 private static String callbackType(MethodCallExpr call,Expression expression){
  if(expression.isObjectCreationExpr())return expression.asObjectCreationExpr().getType().asString();
  String name=expression.isNameExpr()?expression.asNameExpr().getNameAsString():expression.isFieldAccessExpr()?expression.asFieldAccessExpr().getNameAsString():null;if(name==null)return null;
  var owner=call.findAncestor(ClassOrInterfaceDeclaration.class);if(owner.isEmpty())return null;
  for(var field:owner.get().getFields())for(var variable:field.getVariables())if(variable.getNameAsString().equals(name))return variable.getType().asString();
  var method=call.findAncestor(MethodDeclaration.class);if(method.isPresent())for(var parameter:method.get().getParameters())if(parameter.getNameAsString().equals(name))return parameter.getType().asString();
  return null;
 }
 private static Values values(Expression expr,Unit unit,ClassOrInterfaceDeclaration owner,MethodDeclaration method,int depth,Set<String> active){
  var unknown=new Values(Set.of(),true,List.of(source(unit.file(),expr)));if(depth>=10)return unknown;
  if(expr.isStringLiteralExpr())return new Values(Set.of(expr.asStringLiteralExpr().asString()),false,List.of(source(unit.file(),expr)));
  if(expr.isEnclosedExpr())return values(expr.asEnclosedExpr().getInner(),unit,owner,method,depth+1,active);
  if(expr.isBinaryExpr()&&expr.asBinaryExpr().getOperator()==BinaryExpr.Operator.PLUS){var b=expr.asBinaryExpr();var a=values(b.getLeft(),unit,owner,method,depth+1,active);var c=values(b.getRight(),unit,owner,method,depth+1,active);Set<String> paths=new TreeSet<>();for(String x:a.paths())for(String y:c.paths())paths.add(x+y);return new Values(paths,a.unresolved()||c.unresolved(),List.of(source(unit.file(),expr)));}
  if(expr.isNameExpr()){
   String key="var:"+method.getNameAsString()+":"+expr.asNameExpr().getNameAsString();if(!active.add(key))return unknown;
   var candidates=method.findAll(VariableDeclarator.class).stream().filter(v->v.getNameAsString().equals(expr.asNameExpr().getNameAsString())).toList();
   if(method.findAll(AssignExpr.class).stream().anyMatch(a->a.getTarget().isNameExpr()&&a.getTarget().asNameExpr().getNameAsString().equals(expr.asNameExpr().getNameAsString())))return unknown;
   if(candidates.size()==1&&candidates.get(0).getInitializer().isPresent())return values(candidates.get(0).getInitializer().get(),unit,owner,method,depth+1,active);
   return unknown;
  }
  if(expr.isMethodCallExpr()){
   var call=expr.asMethodCallExpr();if(call.getScope().isPresent()&&!call.getScope().get().isThisExpr())return unknown;
   var matches=owner.getMethodsByName(call.getNameAsString());if(matches.size()!=1)return unknown;
   var fn=matches.get(0);String key="method:"+fn.getSignature();if(!active.add(key)||!fn.getParameters().isEmpty())return unknown;
   Set<String> paths=new TreeSet<>();boolean unresolved=false;List<SourceLocation> proof=new ArrayList<>();
   for(ReturnStmt ret:fn.findAll(ReturnStmt.class))if(ret.getExpression().isPresent()&&ret.findAncestor(com.github.javaparser.ast.expr.LambdaExpr.class).isEmpty()&&ret.findAncestor(MethodDeclaration.class).orElse(null)==fn){var value=values(ret.getExpression().get(),unit,owner,fn,depth+1,new HashSet<>(active));paths.addAll(value.paths());unresolved|=value.unresolved();proof.addAll(value.sources());}
   return new Values(paths,unresolved||paths.isEmpty(),proof);
  }
  return unknown;
 }
 private static String simple(String type){int dot=type.lastIndexOf('.');return dot<0?type:type.substring(dot+1);}
 private static SourceLocation source(String file,com.github.javaparser.ast.Node node){return new SourceLocation(file,node.getBegin().map(p->p.line).orElse(1));}
 private static AnalysisEvidence evidence(SourceLocation source,String detail){return new AnalysisEvidence(source,PARSER,ResolutionStatus.INFERRED,detail);}
 private static Diagnostic diagnostic(SourceLocation source,String code,String message){return new Diagnostic(message,Confidence.UNRESOLVED,source,code,List.of(new AnalysisEvidence(source,PARSER,ResolutionStatus.UNRESOLVED,message)));}
}
