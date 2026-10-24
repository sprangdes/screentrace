package io.screentrace.adapter.spring;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import io.screentrace.core.*;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import io.screentrace.parser.jsp.JavaSources;
import io.screentrace.parser.jsp.MarkupTag;
import java.util.*;
import org.w3c.dom.Element;

/** Only proven public + CSRF-exempt paths without screen callers receive a presentation annotation. */
final class SpringExternalCalls {
 private static final String HTTP="org.springframework.security.config.annotation.web.builders.HttpSecurity";
 private static final String SECURITY="http://www.springframework.org/schema/security";
 private static final String BEANS="http://www.springframework.org/schema/beans";
 private record Rule(String pattern,String method,boolean permit,SourceLocation source){}
 private record Chain(List<Rule> access,List<Rule> ignored){}
 private SpringExternalCalls(){}
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory){
  List<Chain> chains=new ArrayList<>();boolean invalid=false;
  for(var path:inventory.files()){
   String name=path.getFileName().toString(),file=inventory.root().relativize(path).toString().replace('\\','/');
   if(!name.endsWith(".java")&&!name.endsWith(".xml"))continue;
   try{String code=SafeProjectFiles.readUtf8Limited(inventory.root(),path,name.endsWith(".xml")?SafeProjectFiles.MAX_XML_FILE_BYTES:SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
    if(name.endsWith(".java")&&code.contains("SecurityFilterChain"))javaChains(JavaSources.parse(code),file,chains);
    else if(name.endsWith(".xml")&&code.contains(SECURITY))xmlChains(code,file,chains);
   }catch(Exception error){invalid=true;}
  }
  if(invalid||chains.size()!=1)return graph;
  Chain chain=chains.get(0);var usage=ApiUsage.derive(graph,Map.of(),Map.of());List<GraphNode> nodes=new ArrayList<>();
  for(var node:graph.nodes()){
   if(node.type()!=NodeType.ENDPOINT||"javascript-request".equals(node.attributes().get("origin"))||usage.get(node.id())==null||usage.get(node.id()).status()!=ApiUsage.Status.UNREFERENCED){nodes.add(node);continue;}
   String route=node.attributes().get("path"),method=node.attributes().getOrDefault("httpMethod","ANY");Rule publicRule=null;
   for(var rule:chain.access())if(methodOverlap(rule.method(),method)&&overlaps(rule.pattern(),route)){
    if(rule.permit()&&methodCovers(rule.method(),method)&&covers(rule.pattern(),route))publicRule=rule;
    break;
   }
   var exempt=chain.ignored().stream().filter(r->methodCovers(r.method(),method)&&covers(r.pattern(),route)).findFirst();
   if(publicRule==null||exempt.isEmpty()){nodes.add(node);continue;}
   Map<String,String> attrs=new TreeMap<>(node.attributes());attrs.put("externalCall","webhook");List<AnalysisEvidence> proofs=new ArrayList<>(node.evidence());
   proofs.add(proof(publicRule,"permitAll"));proofs.add(proof(exempt.get(),"ignoringRequestMatchers"));
   nodes.add(new GraphNode(node.id(),node.type(),node.name(),attrs,node.source(),node.confidence(),proofs.stream().distinct().sorted().toList(),node.audience()));
  }
  return new ApplicationGraph(graph.application(),nodes,graph.relationships(),graph.diagnostics(),graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
 }
 private static AnalysisEvidence proof(Rule rule,String kind){String detail;try{var data=new TreeMap<String,Object>();data.put("kind",kind);data.put("pattern",rule.pattern());if(rule.method()!=null)data.put("method",rule.method());detail=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(data);}catch(Exception impossible){throw new IllegalStateException(impossible);}return new AnalysisEvidence(rule.source(),"SpringSecurityExternalCall",ResolutionStatus.INFERRED,detail);}
 private static boolean imported(CompilationUnit unit,String type){return unit.getImports().stream().anyMatch(i->!i.isStatic()&&(i.getNameAsString().equals(type)||i.isAsterisk()&&i.getNameAsString().equals(type.substring(0,type.lastIndexOf('.')))));}
 private static SourceLocation source(String file,Node node){return new SourceLocation(file,node.getBegin().map(p->p.line).orElse(1));}
 private static String root(Expression expression){while(expression instanceof MethodCallExpr call){if(call.getScope().isEmpty())return null;expression=call.getScope().get();}return expression.isNameExpr()?expression.asNameExpr().getNameAsString():null;}
 private static boolean owner(MethodCallExpr call,String name){return call.getScope().map(SpringExternalCalls::root).filter(name::equals).isPresent();}
 private static boolean inLambda(MethodCallExpr call,LambdaExpr lambda){return call.findAncestor(LambdaExpr.class).orElse(null)==lambda;}
 private static void javaChains(CompilationUnit unit,String file,List<Chain> chains){
  boolean localShadow=unit.findAll(com.github.javaparser.ast.body.ClassOrInterfaceDeclaration.class).stream().anyMatch(c->Set.of("HttpSecurity","SecurityFilterChain").contains(c.getNameAsString()));
  for(var method:unit.findAll(MethodDeclaration.class))if(method.getAnnotationByName("Bean").isPresent()&&method.getType().asString().endsWith("SecurityFilterChain")){
   List<Rule> access=new ArrayList<>(),ignored=new ArrayList<>();chains.add(new Chain(access,ignored));
   var parameters=method.getParameters().stream().filter(p->p.getType().asString().equals("HttpSecurity")||p.getType().asString().equals(HTTP)).toList();
   if(localShadow||parameters.size()!=1||!imported(unit,HTTP)||!imported(unit,"org.springframework.context.annotation.Bean")||!imported(unit,"org.springframework.security.web.SecurityFilterChain")||method.getBody().isEmpty())continue;
   String security=parameters.get(0).getNameAsString();
   if(method.findAll(AssignExpr.class).stream().anyMatch(a->a.getTarget().isNameExpr()&&a.getTarget().asNameExpr().getNameAsString().equals(security)))continue;
   var returns=method.findAll(com.github.javaparser.ast.stmt.ReturnStmt.class).stream().filter(r->r.findAncestor(LambdaExpr.class).isEmpty()).toList();
   if(returns.size()!=1||returns.get(0).getExpression().isEmpty()||!(returns.get(0).getExpression().get() instanceof MethodCallExpr built)||!built.getNameAsString().equals("build")||!owner(built,security))continue;
   var authorizers=method.findAll(MethodCallExpr.class).stream().filter(c->c.getNameAsString().equals("authorizeHttpRequests")&&owner(c,security)&&unconditional(c,method)).toList();
   var csrf=method.findAll(MethodCallExpr.class).stream().filter(c->c.getNameAsString().equals("csrf")&&owner(c,security)&&unconditional(c,method)).toList();
   if(authorizers.size()!=1||csrf.size()!=1)continue;
   var authLambda=lambda(authorizers.get(0));var csrfLambda=lambda(csrf.get(0));if(authLambda==null||csrfLambda==null)continue;
   if(authLambda.findAll(com.github.javaparser.ast.stmt.IfStmt.class).size()>0||csrfLambda.findAll(com.github.javaparser.ast.stmt.IfStmt.class).size()>0)continue;
   String registry=authLambda.getParameter(0).getNameAsString(),token=csrfLambda.getParameter(0).getNameAsString();
   var matchers=authLambda.findAll(MethodCallExpr.class).stream().filter(c->inLambda(c,authLambda)&&Set.of("requestMatchers","anyRequest").contains(c.getNameAsString())&&owner(c,registry)).sorted(Comparator.comparingInt(c->c.getName().getBegin().map(p->p.line*10000+p.column).orElse(0))).toList();
   for(var call:matchers){var parent=call.getParentNode().filter(n->n instanceof MethodCallExpr p&&p.getScope().orElse(null)==call).map(n->(MethodCallExpr)n).orElse(null);boolean permit=parent!=null&&parent.getNameAsString().equals("permitAll");if(call.getNameAsString().equals("anyRequest"))access.add(new Rule("/**",null,permit,source(file,call)));else access.addAll(rules(call,unit,file,permit));}
   for(var call:csrfLambda.findAll(MethodCallExpr.class))if(inLambda(call,csrfLambda)&&call.getNameAsString().equals("ignoringRequestMatchers")&&owner(call,token))ignored.addAll(rules(call,unit,file,true));
  }
 }
 private static boolean unconditional(Node node,MethodDeclaration method){for(Node parent=node.getParentNode().orElse(null);parent!=null&&parent!=method;parent=parent.getParentNode().orElse(null))if(parent instanceof LambdaExpr||parent instanceof com.github.javaparser.ast.stmt.IfStmt||parent instanceof com.github.javaparser.ast.stmt.ForStmt||parent instanceof com.github.javaparser.ast.stmt.ForEachStmt||parent instanceof com.github.javaparser.ast.stmt.WhileStmt||parent instanceof com.github.javaparser.ast.stmt.SwitchEntry||parent instanceof ConditionalExpr)return false;return true;}
 private static LambdaExpr lambda(MethodCallExpr call){return call.getArguments().size()==1&&call.getArgument(0) instanceof LambdaExpr l&&l.getParameters().size()==1?l:null;}
 private static List<Rule> rules(MethodCallExpr call,CompilationUnit unit,String file,boolean permit){
  String method=null;int start=0;List<Rule> out=new ArrayList<>();
  if(!call.getArguments().isEmpty()&&call.getArgument(0) instanceof FieldAccessExpr field&&field.getScope().toString().equals("HttpMethod")&&imported(unit,"org.springframework.http.HttpMethod")){method=field.getNameAsString();start=1;}
  for(int i=start;i<call.getArguments().size();i++){Expression arg=call.getArgument(i);String pattern=arg.isStringLiteralExpr()?arg.asStringLiteralExpr().asString():null;out.add(new Rule(valid(pattern)?pattern:null,method,permit,source(file,arg)));}
  if(out.isEmpty())out.add(new Rule(null,method,false,source(file,call)));return out;
 }
 private static boolean valid(String path){return path!=null&&path.startsWith("/")&&!path.startsWith("//")&&!path.contains("${")&&!path.contains("#{")&&!path.contains("?")&&!path.contains("\\");}
 private static boolean methodCovers(String pattern,String endpoint){return pattern==null||pattern.equals(endpoint);}
 private static boolean methodOverlap(String pattern,String endpoint){return pattern==null||endpoint.equals("ANY")||pattern.equals(endpoint);}
 /** A literal pattern must cover every substitution of an endpoint template, not just one sampled value. */
 private static boolean covers(String pattern,String path){if(pattern==null||path==null)return false;String[] p=pattern.split("/",-1),v=path.split("/",-1);for(int i=0;i<p.length;i++){if(p[i].equals("**")&&i==p.length-1)return true;if(i>=v.length)return false;if(p[i].equals("*")||p[i].matches("\\{[^/{}]+}"))continue;if(v[i].contains("{")||!p[i].equals(v[i]))return false;}return p.length==v.length;}
 private static boolean overlaps(String pattern,String path){if(pattern==null||path==null)return true;String[] p=pattern.split("/",-1),v=path.split("/",-1);for(int i=0;i<Math.min(p.length,v.length);i++){if(p[i].equals("**"))return true;if(p[i].contains("*")||p[i].contains("{")||v[i].contains("{"))continue;if(!p[i].equals(v[i]))return false;}return p.length==v.length;}
 private static List<Element> children(Element element){List<Element> out=new ArrayList<>();for(var n=element.getFirstChild();n!=null;n=n.getNextSibling())if(n instanceof Element e)out.add(e);return out;}
 private static void xmlChains(String text,String file,List<Chain> chains)throws Exception{
  var document=SafeProjectFiles.parseXml(text,true);var all=document.getElementsByTagName("*");var tags=MarkupTag.scan(text).stream().filter(t->!t.closing()).toList();Map<Element,SourceLocation> locations=new IdentityHashMap<>();int cursor=0;
  Map<String,Element> beans=new HashMap<>();Set<String> duplicated=new HashSet<>();
  for(int i=0;i<all.getLength();i++){Element element=(Element)all.item(i);while(cursor<tags.size()&&!tags.get(cursor).name().equals(element.getTagName()))cursor++;locations.put(element,new SourceLocation(file,cursor<tags.size()?tags.get(cursor++).line():1));if(BEANS.equals(element.getNamespaceURI())&&element.getLocalName().equals("bean")&&element.hasAttribute("id")){String id=element.getAttribute("id");if(beans.putIfAbsent(id,element)!=null)duplicated.add(id);}}
  for(int i=0;i<all.getLength();i++){Element http=(Element)all.item(i);if(!SECURITY.equals(http.getNamespaceURI())||!http.getLocalName().equals("http"))continue;List<Rule> access=new ArrayList<>(),ignored=new ArrayList<>();chains.add(new Chain(access,ignored));if(http.hasAttribute("pattern")||http.hasAttribute("request-matcher-ref"))continue;
   for(Element item:children(http))if(SECURITY.equals(item.getNamespaceURI())){
    if(item.getLocalName().equals("intercept-url")){String pattern=item.getAttribute("pattern"),method=item.hasAttribute("method")?item.getAttribute("method"):null;access.add(new Rule(valid(pattern)?pattern:null,method,item.getAttribute("access").equals("permitAll")||item.getAttribute("access").equals("permitAll()"),locations.get(item)));}
    if(item.getLocalName().equals("csrf")&&!item.getAttribute("disabled").equals("true")){String ref=item.getAttribute("request-matcher-ref");if(!duplicated.contains(ref)&&beans.containsKey(ref))for(String pattern:ignoredPatterns(beans.get(ref)))ignored.add(new Rule(pattern,null,true,locations.get(item)));}
   }
  }
 }
 private static List<String> ignoredPatterns(Element bean){
  String type=bean.getAttribute("class");
  if(type.equals("org.springframework.security.web.util.matcher.AndRequestMatcher")){List<String> result=new ArrayList<>();for(Element arg:children(bean))for(Element inner:children(arg))if(BEANS.equals(inner.getNamespaceURI())&&inner.getLocalName().equals("bean"))result.addAll(ignoredPatterns(inner));return result;}
  if(!type.equals("org.springframework.security.web.util.matcher.NegatedRequestMatcher"))return List.of();var args=children(bean);if(args.size()!=1)return List.of();var inner=children(args.get(0));if(inner.size()!=1)return List.of();Element matcher=inner.get(0);if(!Set.of("org.springframework.security.web.util.matcher.AntPathRequestMatcher","org.springframework.security.config.http.PathPatternRequestMatcherFactoryBean").contains(matcher.getAttribute("class")))return List.of();var literals=children(matcher);if(literals.size()!=1)return List.of();String pattern=literals.get(0).getAttribute("value");return valid(pattern)?List.of(pattern):List.of();
 }
}
