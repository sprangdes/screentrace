package io.screentrace.adapter.spring;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.parser.jsp.JavaSources;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
/** Direct @ModelAttribute input binding, for inert submitted-value demonstrations only.
 * Service results, nested relations, generated identifiers and calculated values are excluded. */
final class SpringSubmittedModel {
 static ApplicationGraph enrich(ApplicationGraph graph,ProjectInventory inventory){
  Map<String,List<ClassOrInterfaceDeclaration>> types=new HashMap<>();Map<ClassOrInterfaceDeclaration,String> files=new IdentityHashMap<>();
  for(var file:inventory.javaFiles())try{for(var t:JavaSources.parse(SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES)).findAll(ClassOrInterfaceDeclaration.class)){types.computeIfAbsent(t.getNameAsString(),k->new ArrayList<>()).add(t);files.put(t,inventory.root().relativize(file).toString().replace('\\','/'));}}catch(Exception ignored){}
  Map<String,List<AnalysisEvidence>> contributions=new HashMap<>();
  for(var handler:graph.nodes())if(handler.type()==NodeType.HANDLER){var owners=types.getOrDefault(handler.attributes().get("class"),List.of());if(owners.size()!=1)continue;var owner=owners.get(0);if(!files.get(owner).equals(handler.source().file()))continue;
   var methods=owner.getMethodsByName(handler.attributes().getOrDefault("method",""));if(methods.size()!=1)continue;var method=methods.get(0);if(method.getParameters().stream().filter(p->p.getAnnotationByName("ModelAttribute").isPresent()).count()!=1)continue;if(method.getBody().isEmpty()||method.findAll(com.github.javaparser.ast.stmt.ReturnStmt.class).size()!=1||!method.getBody().get().getStatements().get(method.getBody().get().getStatements().size()-1).isReturnStmt())continue;
   for(var parameter:method.getParameters())if(parameter.getAnnotationByName("ModelAttribute").isPresent()){
    var entities=types.getOrDefault(parameter.getType().asString(),List.of());if(entities.size()!=1)continue;var entity=entities.get(0);String variable=parameter.getNameAsString();
    if(method.findAll(AssignExpr.class).stream().anyMatch(a->a.getTarget().toString().equals(variable)))continue;
    Set<String> modelNames=new TreeSet<>();for(var call:method.findAll(MethodCallExpr.class))if(call.getNameAsString().equals("addAttribute")&&call.getArguments().size()==2&&call.getArgument(0).isStringLiteralExpr()&&call.getArgument(1).toString().equals(variable)&&call.getScope().filter(e->e.isNameExpr()&&method.getParameters().stream().anyMatch(p->p.getNameAsString().equals(e.asNameExpr().getNameAsString())&&Set.of("Model","ModelMap").contains(p.getType().asString()))).isPresent())modelNames.add(call.getArgument(0).asStringLiteralExpr().asString());
    if(modelNames.size()!=1)continue;String model=modelNames.iterator().next();Map<String,String> fields=new TreeMap<>();
    for(var field:entity.getFields())if(!field.isStatic()&&field.getAnnotations().stream().noneMatch(a->Set.of("Id","GeneratedValue").contains(a.getNameAsString())))for(var v:field.getVariables()){
     if(!Set.of("String","int","Integer","long","Long","LocalDate","boolean","Boolean").contains(v.getType().asString()))continue;String name=v.getNameAsString(),setter="set"+Character.toUpperCase(name.charAt(0))+name.substring(1);
     var setters=entity.getMethodsByName(setter);if(setters.size()!=1||!setters.get(0).isPublic()||setters.get(0).isStatic()||setters.get(0).getParameters().size()!=1||setters.get(0).getBody().isEmpty()||setters.get(0).getBody().get().getStatements().size()!=1)continue;
     var statement=setters.get(0).getBody().get().getStatement(0);if(!statement.isExpressionStmt()||!(statement.asExpressionStmt().getExpression() instanceof AssignExpr assignment)||assignment.getOperator()!=AssignExpr.Operator.ASSIGN||!assignment.getTarget().toString().equals("this."+name)||!assignment.getValue().toString().equals(setters.get(0).getParameter(0).getNameAsString()))continue;
     String getter="get"+Character.toUpperCase(name.charAt(0))+name.substring(1);var getters=entity.getMethodsByName(getter);
     if(getters.size()!=1||!getters.get(0).isPublic()||getters.get(0).isStatic()||!getters.get(0).getParameters().isEmpty()||getters.get(0).getBody().isEmpty()||getters.get(0).getBody().get().getStatements().size()!=1)continue;
     var read=getters.get(0).getBody().get().getStatement(0);if(!read.isReturnStmt()||read.asReturnStmt().getExpression().filter(e->e.toString().equals(name)||e.toString().equals("this."+name)).isEmpty())continue;
     if(method.findAll(MethodCallExpr.class).stream().anyMatch(c->c.getNameAsString().equals(setter)&&c.getScope().filter(e->e.toString().equals(variable)).isPresent()))continue;
     fields.put(model+"."+name,name);
    }
    if(fields.isEmpty()||fields.size()>64)continue;
    try{String detail=new ObjectMapper().writeValueAsString(new TreeMap<>(Map.of("version",1,"fields",fields,"scope","submitted-binding-demo")));var evidence=List.of(new AnalysisEvidence(new SourceLocation(files.get(owner),parameter.getBegin().orElseThrow().line),"SpringSubmittedModel",ResolutionStatus.INFERRED,detail),new AnalysisEvidence(new SourceLocation(files.get(entity),entity.getBegin().orElseThrow().line),"SpringSubmittedModel",ResolutionStatus.INFERRED,"直接表單綁定；僅回放輸入字串，不模擬服務、資料庫、巢狀關聯或計算結果"));contributions.put(handler.id(),evidence);}catch(Exception ignored){}
   }
  }
  List<Relationship> edges=new ArrayList<>();for(var edge:graph.relationships()){var proof=new ArrayList<>(edge.evidence());if(edge.type()==EdgeType.RENDERS)proof.addAll(contributions.getOrDefault(edge.from(),List.of()));edges.add(new Relationship(edge.id(),edge.type(),edge.from(),edge.to(),edge.confidence(),edge.source(),proof));}
  return new ApplicationGraph(graph.application(),graph.nodes(),edges,graph.diagnostics(),graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
 }
}
