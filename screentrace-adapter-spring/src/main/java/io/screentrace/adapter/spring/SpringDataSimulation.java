package io.screentrace.adapter.spring;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.javaparser.ast.*;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.JavaSources;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.util.*;

/** Source-proven repository paths describe inert, session-local demonstration data.
 * No target classes, services, queries or persistence code are executed. */
final class SpringDataSimulation {
 private static final ObjectMapper JSON=new ObjectMapper();
 private record Type(ClassOrInterfaceDeclaration declaration,String file){}
 private record Action(Type repository,Type entity,String operation,String argument,List<SourceLocation> proof){}
 private final Map<String,List<Type>> types=new TreeMap<>();
 private Type unique(String name){var matches=types.getOrDefault(name.replaceAll("<.*>",""),List.of());return matches.size()==1?matches.get(0):null;}
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory){return new SpringDataSimulation().analyze(graph,inventory);}
 private ApplicationGraph analyze(ApplicationGraph graph,ProjectInventory inventory) {
  for(var file:inventory.javaFiles())try{
   var unit=JavaSources.parse(SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES));
   String path=inventory.root().relativize(file).toString().replace('\\','/');
   for(var declaration:unit.getTypes())if(declaration instanceof ClassOrInterfaceDeclaration c){var t=new Type(c,path);types.computeIfAbsent(c.getNameAsString(),k->new ArrayList<>()).add(t);}
  }catch(Exception ignored){/* A missing or ambiguous source yields no simulation contract. */}
  Map<String,List<Map<String,Object>>> contracts=new TreeMap<>();List<GraphNode> nodes=new ArrayList<>();
  for(var node:graph.nodes()) {
   if(node.type()!=NodeType.HANDLER){nodes.add(node);continue;}
   Type owner=unique(node.attributes().getOrDefault("class",""));
   if(owner==null||!owner.file.equals(node.source().file())){nodes.add(node);continue;}
   var methods=owner.declaration.getMethodsByName(node.attributes().getOrDefault("method",""));
   if(methods.size()!=1||!(straight(methods.get(0))||tryWrite(methods.get(0)))){nodes.add(node);continue;}
   var method=methods.get(0);List<Action> found=new ArrayList<>();Map<String,String> parameters=new TreeMap<>();method.getParameters().forEach(p->parameters.put(p.getNameAsString(),p.getNameAsString()));
   for(var call:method.findAll(MethodCallExpr.class)){
    Action action=resolve(owner,call,parameters,new HashSet<>(),0);
    if(action!=null)found.add(action);
   }
   if(tryWrite(method)&&(found.size()!=1||!found.get(0).operation.equals("upsert"))){nodes.add(node);continue;}
   found=new ArrayList<>(new LinkedHashSet<>(found));
   if(found.isEmpty()||found.size()>1&&found.stream().anyMatch(a->!a.operation.equals("readAll"))){nodes.add(node);continue;}
   List<Map<String,Object>> handlerContracts=new ArrayList<>();List<AnalysisEvidence> allEvidence=new ArrayList<>(node.evidence());
   for(Action action:found){String model=null;
   if(action.operation.startsWith("read")) {
    Set<String> models=new TreeSet<>();
    for(var call:method.findAll(MethodCallExpr.class))if(call.getNameAsString().equals("addAttribute")&&call.getArguments().size()==2&&call.getArgument(0).isStringLiteralExpr()) {
     Expression expression=call.getArgument(1);
     if(expression.isNameExpr()) {String variable=expression.asNameExpr().getNameAsString();var declarations=method.findAll(VariableDeclarator.class).stream().filter(v->v.getNameAsString().equals(variable)).toList();if(declarations.size()==1&&declarations.get(0).getInitializer().isPresent()&&method.findAll(AssignExpr.class).stream().noneMatch(a->a.getTarget().toString().equals(variable)))expression=declarations.get(0).getInitializer().orElseThrow();}
     Action value=expression instanceof MethodCallExpr m?resolve(owner,m,parameters,new HashSet<>(),0):null;
     if(value!=null&&value.repository.equals(action.repository)&&value.operation.equals(action.operation))models.add(call.getArgument(0).asStringLiteralExpr().asString());
    }
    if(models.size()!=1)continue;model=models.iterator().next();
   }
   var fields=action.entity.declaration.getFields().stream().filter(f->!f.isStatic()).flatMap(f->f.getVariables().stream()).filter(v->Set.of("String","Long","long","Integer","int","Double","double","Boolean","boolean").contains(v.getType().asString())).map(v->v.getNameAsString()).sorted().toList();
   var ids=action.entity.declaration.getFields().stream().filter(f->f.getAnnotations().stream().anyMatch(a->a.getName().getIdentifier().equals("Id"))).flatMap(f->f.getVariables().stream()).map(v->v.getNameAsString()).toList();
   if(ids.size()!=1||!fields.contains(ids.get(0))||fields.size()>64)continue;
   if(action.operation.equals("upsert")){
    var p=method.getParameters().stream().filter(v->v.getNameAsString().equals(action.argument)&&unique(v.getType().asString())==action.entity).toList();
    if(p.size()!=1)continue;
   }
   Map<String,Object> contract=new TreeMap<>();contract.put("version",1);contract.put("operation",action.operation);contract.put("collection",action.repository.file+":"+action.repository.declaration.getNameAsString());contract.put("fields",fields);contract.put("idField",ids.get(0));if(model!=null)contract.put("model",model);if(tryWrite(method))contract.put("conditional",true);
   List<AnalysisEvidence> evidence=new ArrayList<>(node.evidence());List<SourceLocation> locations=new ArrayList<>(action.proof);locations.add(location(owner,method));locations.add(location(action.entity,action.entity.declaration));
   for(var proof:locations)evidence.add(new AnalysisEvidence(proof,"SpringDataSimulation",ResolutionStatus.INFERRED,"可證明的 repository "+action.operation+" 路徑；僅供本機示範資料，不等同執行服務邏輯"));
   handlerContracts.add(contract);allEvidence.addAll(evidence.stream().filter(e->e.parser().equals("SpringDataSimulation")).toList());
   }
   if(handlerContracts.isEmpty()){nodes.add(node);continue;}
   contracts.put(node.id(),handlerContracts);var attrs=new TreeMap<>(node.attributes());
   try{if(handlerContracts.size()==1)attrs.put("simulationData",JSON.writeValueAsString(handlerContracts.get(0)));}catch(Exception ignored){}
   nodes.add(new GraphNode(node.id(),node.type(),node.name(),attrs,node.source(),node.confidence(),allEvidence));
  }
  List<GraphNode> result=new ArrayList<>();
  for(var node:nodes){
   if(node.type()!=NodeType.SCREEN){result.add(node);continue;}
   List<Map<String,Object>> bindings=new ArrayList<>();List<AnalysisEvidence> proof=new ArrayList<>(node.evidence());
   for(var edge:graph.relationships())if(edge.type()==EdgeType.RENDERS&&edge.to().equals(node.id())) {
    var cs=contracts.getOrDefault(edge.from(),List.of());for(var c:cs)if(c.get("operation").toString().startsWith("read")){bindings.add(c);nodes.stream().filter(n->n.id().equals(edge.from())).findFirst().ifPresent(n->n.evidence().stream().filter(e->e.parser().equals("SpringDataSimulation")).forEach(proof::add));}
   }
   bindings=new ArrayList<>(new LinkedHashSet<>(bindings));
   if(bindings.isEmpty()){result.add(node);continue;}
   var attrs=new TreeMap<>(node.attributes());try{attrs.put("simulationBindings",JSON.writeValueAsString(bindings));}catch(Exception ignored){}
   result.add(new GraphNode(node.id(),node.type(),node.name(),attrs,node.source(),node.confidence(),proof));
  }
  return new ApplicationGraph(graph.application(),result,graph.relationships(),graph.diagnostics(),graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
 }
 private Action resolve(Type owner,MethodCallExpr call,Map<String,String> values,Set<String> seen,int depth){
  if(depth>8||call.getScope().isEmpty())return null;
  if(call.getNameAsString().equals("orElse")&&call.getArguments().size()==1&&call.getArgument(0).isNullLiteralExpr()&&call.getScope().get() instanceof MethodCallExpr nested)return resolve(owner,nested,values,seen,depth+1);
  Expression scope=call.getScope().get();if(scope instanceof FieldAccessExpr f&&f.getScope().isThisExpr())scope=new NameExpr(f.getNameAsString());if(!(scope instanceof NameExpr))return null;
  String receiver=scope.asNameExpr().getNameAsString();
  var context=call.findAncestor(MethodDeclaration.class);
  if(context.isPresent()&&(context.get().getParameters().stream().anyMatch(p->p.getNameAsString().equals(receiver))||context.get().findAll(VariableDeclarator.class).stream().anyMatch(v->v.getNameAsString().equals(receiver))))return null;
  var field=owner.declaration.getFields().stream().flatMap(f->f.getVariables().stream()).filter(v->v.getNameAsString().equals(receiver)).toList();
  if(field.size()!=1)return null;Type type=unique(field.get(0).getType().asString());if(type==null)return null;
  String name=call.getNameAsString(),argument=call.getArguments().size()==1&&call.getArgument(0).isNameExpr()?values.get(call.getArgument(0).asNameExpr().getNameAsString()):null;
  var bases=type.declaration.getExtendedTypes().stream().filter(t->Set.of("JpaRepository","CrudRepository","ListCrudRepository").contains(t.getNameAsString())&&t.getTypeArguments().isPresent()&&t.getTypeArguments().get().size()==2).toList();
  if(bases.size()==1){
   if(!type.declaration.getMethodsByName(name).isEmpty())return null;
   var unit=type.declaration.findCompilationUnit().orElseThrow();String base=bases.get(0).getNameAsString();
   boolean imported=unit.getImports().stream().anyMatch(i->i.getNameAsString().equals("org.springframework.data.jpa.repository."+base)||i.getNameAsString().equals("org.springframework.data.repository."+base));
   if(!imported)return null;
   Type entity=unique(bases.get(0).getTypeArguments().orElseThrow().get(0).asString());if(entity==null)return null;
   String operation=switch(name){case "findAll"->call.getArguments().isEmpty()?"readAll":null;case "findById"->argument!=null?"readOne":null;case "save"->argument!=null?"upsert":null;case "deleteById"->argument!=null?"delete":null;default->null;};
   return operation==null?null:new Action(type,entity,operation,argument,List.of(location(owner,call),location(type,type.declaration)));
  }
  var methods=type.declaration.getMethodsByName(name).stream().filter(m->m.getParameters().size()==call.getArguments().size()).toList();
  if(methods.size()!=1||!straight(methods.get(0))||methods.get(0).getBody().orElseThrow().getStatements().size()!=1)return null;
  MethodDeclaration method=methods.get(0);String key=type.file+":"+method.getBegin();if(!seen.add(key))return null;
  Map<String,String> child=new TreeMap<>();for(int i=0;i<method.getParameters().size();i++){Expression a=call.getArgument(i);if(!a.isNameExpr())return null;child.put(method.getParameter(i).getNameAsString(),values.get(a.asNameExpr().getNameAsString()));}
  var statement=method.getBody().orElseThrow().getStatement(0);Expression value=statement.isReturnStmt()?statement.asReturnStmt().getExpression().orElse(null):statement.isExpressionStmt()?statement.asExpressionStmt().getExpression():null;
  if(!(value instanceof MethodCallExpr nested))return null;var action=resolve(type,nested,child,new HashSet<>(seen),depth+1);if(action==null)return null;List<SourceLocation> proof=new ArrayList<>(action.proof);proof.add(location(owner,call));return new Action(action.repository,action.entity,action.operation,action.argument,proof);
 }
 private static boolean tryWrite(MethodDeclaration method){
  if(method.getBody().isEmpty()||method.findAll(TryStmt.class).size()!=1||!method.findAll(IfStmt.class).isEmpty()||!method.findAll(LambdaExpr.class).isEmpty()||!method.findAll(AssignExpr.class).isEmpty())return false;
  TryStmt t=method.findAll(TryStmt.class).get(0);
  return t.getParentNode().orElse(null)==method.getBody().get()&&t.getResources().isEmpty()&&t.getFinallyBlock().isEmpty()&&t.getCatchClauses().stream().allMatch(c->c.getBody().isEmpty())
   &&t.getTryBlock().getStatements().stream().allMatch(st->st.isExpressionStmt())&&method.getBody().get().getStatements().stream().allMatch(st->st==t||st.isReturnStmt());
 }
 private static boolean straight(MethodDeclaration m){return m.getBody().isPresent()&&m.findAll(LambdaExpr.class).isEmpty()&&m.findAll(ConditionalExpr.class).isEmpty()&&m.findAll(AssignExpr.class).isEmpty()&&m.getBody().get().getStatements().stream().allMatch(s->s instanceof ReturnStmt||s instanceof ExpressionStmt||s instanceof com.github.javaparser.ast.stmt.EmptyStmt);}
 private static SourceLocation location(Type type,Node n){return new SourceLocation(type.file,n.getBegin().map(p->p.line).orElse(1));}
}
