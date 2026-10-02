package io.screentrace.adapter.spring;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.util.*;

/** Resolves model-attribute names only from source declarations; no target classes are loaded. */
final class SpringFormBindings {
  private record Type(ClassOrInterfaceDeclaration node,String path) { }
  private record Model(String name,String type,SourceLocation source) { }
  static ApplicationGraph bind(ApplicationGraph graph,ProjectInventory inventory) {
    Map<String,List<Type>> types=new TreeMap<>();List<Model> models=new ArrayList<>();List<Diagnostic> diagnostics=new ArrayList<>(graph.diagnostics());
    for(var file:inventory.javaFiles()) {
      String path=inventory.root().relativize(file).toString().replace('\\','/');
      try {
        var unit=StaticJavaParser.parse(SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES));
        for(var type:unit.findAll(ClassOrInterfaceDeclaration.class)) types.computeIfAbsent(type.getFullyQualifiedName().orElse(type.getNameAsString()),k->new ArrayList<>()).add(new Type(type,path));
        for(var parameter:unit.findAll(Parameter.class)) for(var annotation:parameter.getAnnotations()) if(isModelAttribute(annotation,unit)) {
          String name=literalName(annotation);if(name!=null)models.add(new Model(name,qualifiedType(unit,parameter.getType().asString()),new SourceLocation(path,parameter.getBegin().map(p->p.line).orElse(1))));
        }
        for(var method:unit.findAll(MethodDeclaration.class)) for(var annotation:method.getAnnotations()) if(isModelAttribute(annotation,unit)) {
          String name=literalName(annotation);if(name!=null)models.add(new Model(name,qualifiedType(unit,method.getType().asString()),new SourceLocation(path,method.getBegin().map(p->p.line).orElse(1))));
        }
      } catch(Exception error) {diagnostics.add(new Diagnostic("表單模型來源無法解析："+error.getMessage(),Confidence.UNRESOLVED,new SourceLocation(path,1),"MODEL_SOURCE_UNRESOLVED",List.of(new AnalysisEvidence(new SourceLocation(path,1),"SpringFormBindings",ResolutionStatus.UNRESOLVED,null))));}
    }
    List<GraphNode> nodes=new ArrayList<>(graph.nodes());List<Relationship> edges=new ArrayList<>(graph.relationships());
    for(var form:graph.nodes()) if(form.type()==NodeType.COMPONENT&&"FORM".equals(form.attributes().get("kind"))) {
      String name=form.attributes().get("model");if(name==null)continue;
      List<Model> candidates=models.stream().filter(m->m.name().equals(name)).toList();
      // Several declarations are ambiguous, even if they happen to use the same class.
      if(candidates.size()!=1)continue;var model=candidates.get(0);
      var declarations=types.getOrDefault(model.type(),List.of());if(declarations.size()!=1)continue;
      var type=declarations.get(0);String id=ApplicationGraph.id(NodeType.FORM_MODEL,model.source().file()+":"+model.type()+":"+model.name());
      Map<String,String> attrs=new TreeMap<>();attrs.put("class",model.type());
      for(var field:type.node().getFields()) for(var variable:field.getVariables()) attrs.put("field."+variable.getNameAsString()+".type",variable.getType().asString());
      for(var method:type.node().getMethods()) if(method.getParameters().isEmpty()&&method.getNameAsString().startsWith("get")&&method.getNameAsString().length()>3) {String raw=method.getNameAsString().substring(3);attrs.put("field."+java.beans.Introspector.decapitalize(raw)+".type",method.getType().asString());}
      var proof=List.of(new AnalysisEvidence(model.source(),"SpringFormBindings",ResolutionStatus.CONFIRMED,"Spring @ModelAttribute："+name),new AnalysisEvidence(new SourceLocation(type.path(),type.node().getBegin().map(p->p.line).orElse(1)),"SpringFormBindings",ResolutionStatus.CONFIRMED,"欄位宣告："+model.type()));
      if(nodes.stream().noneMatch(n->n.id().equals(id)))nodes.add(new GraphNode(id,NodeType.FORM_MODEL,name,attrs,model.source(),Confidence.CONFIRMED,proof));
      String edgeId=ApplicationGraph.id(NodeType.COMPONENT,EdgeType.BINDS_TO+":"+form.id()+":"+id);
      if(edges.stream().noneMatch(e->e.id().equals(edgeId)))edges.add(new Relationship(edgeId,EdgeType.BINDS_TO,form.id(),id,Confidence.CONFIRMED,form.source(),proof));
    }
    return new ApplicationGraph(graph.application(),nodes,edges,diagnostics,graph.apiContracts(),graph.schemaVersion(),graph.behaviors(),graph.validationRules());
  }
  private static boolean isModelAttribute(AnnotationExpr annotation,com.github.javaparser.ast.CompilationUnit unit) {
    String expected="org.springframework.web.bind.annotation.ModelAttribute",name=annotation.getNameAsString();
    if(name.equals(expected))return true;if(!name.equals("ModelAttribute"))return false;
    for(var declaration:unit.getImports()) if(!declaration.isAsterisk()&&declaration.getName().getIdentifier().equals(name))return declaration.getNameAsString().equals(expected);
    return unit.getImports().stream().anyMatch(i->i.isAsterisk()&&!i.isStatic()&&i.getNameAsString().equals("org.springframework.web.bind.annotation"));
  }
  private static String qualifiedType(com.github.javaparser.ast.CompilationUnit unit,String name) {
    if(name.contains(".")||name.contains("<"))return name;
    for(var declaration:unit.getImports()) if(!declaration.isAsterisk()&&!declaration.isStatic()&&declaration.getName().getIdentifier().equals(name))return declaration.getNameAsString();
    return unit.getPackageDeclaration().map(p->p.getNameAsString()+"."+name).orElse(name);
  }
  private static String literalName(AnnotationExpr annotation) {
    Expression value=null;if(annotation.isSingleMemberAnnotationExpr())value=annotation.asSingleMemberAnnotationExpr().getMemberValue();
    if(annotation.isNormalAnnotationExpr())for(var pair:annotation.asNormalAnnotationExpr().getPairs())if(Set.of("value","name").contains(pair.getNameAsString()))value=pair.getValue();
    return value!=null&&value.isStringLiteralExpr()?value.asStringLiteralExpr().asString():null;
  }
}
