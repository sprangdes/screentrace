package io.screentrace.adapter.spring;

import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import io.screentrace.core.ApplicationGraph.*;
import java.util.*;

/** Inert return-expression classification; no target methods or expressions are evaluated. */
final class SpringControllerReturns {
  enum Kind { VIEW, REDIRECT, REDIRECT_VIEW, FORWARD, UNKNOWN }
  record Target(Kind kind,String value,String expression,SourceLocation source,List<AnalysisEvidence> evidence) { }
  static List<Target> extract(MethodDeclaration method,String file,String className,Map<String,String> constants) {
    constants=new HashMap<>(constants);
    for(var parameter:method.getParameters())constants.remove(parameter.getNameAsString());
    for(var variable:method.findAll(VariableDeclarator.class))constants.remove(variable.getNameAsString());
    List<Target> targets=new ArrayList<>();
    for(ReturnStmt statement:method.findAll(ReturnStmt.class)) {
      if(!belongsTo(statement,method)||statement.getExpression().isEmpty())continue;
      Expression expression=statement.getExpression().get();String raw=expression.toString();
      SourceLocation source=new SourceLocation(file,statement.getBegin().map(p->p.line).orElse(1));
      if(expression.isNameExpr()) {
        var definitions=method.findAll(VariableDeclarator.class).stream().filter(v->belongsTo(v,method)&&v.getNameAsString().equals(expression.asNameExpr().getNameAsString())).toList();
        if(definitions.size()==1&&(definitions.get(0).getInitializer().isEmpty() || emptyModelAndView(definitions.get(0)))) {
          var paths=assignedPaths(method,statement,expression.asNameExpr().getNameAsString(),constants);
          if(emptyModelAndView(definitions.get(0))&&paths.stream().anyMatch(p->p.value.kind()==Kind.UNKNOWN))paths=List.of(new PathValue(unknown(),"存在無法證明的回傳分支",null));
          for(var path:paths) {
            var proof=new SourceLocation(file,path.source==null?source.line():path.source.getBegin().map(p->p.line).orElse(source.line()));
            String detail="類別="+className+"；方法="+className+"."+method.getNameAsString()+"；原始運算式="+raw+"；目標="+Objects.toString(path.value.value(),"UNRESOLVED")+"；條件="+path.guard;
            var pathEvidence=new ArrayList<>(List.of(new AnalysisEvidence(source,"SpringControllerReturns",path.value.kind()==Kind.UNKNOWN?ResolutionStatus.UNRESOLVED:ResolutionStatus.INFERRED,detail),new AnalysisEvidence(proof,"SpringControllerReturns",ResolutionStatus.INFERRED,"分支內賦值來源；column="+(path.source==null?0:path.source.getBegin().map(p->p.column).orElse(0)))));
            if(path.value.kind()!=Kind.UNKNOWN)pathEvidence.addAll(feedback(method,statement,file));
            targets.add(new Target(path.value.kind(),path.value.value(),raw,source,pathEvidence));
          }
          continue;
        }
      }
      Value value=value(expression,method,statement,constants);
      String detail="類別="+className+"；方法="+className+"."+method.getNameAsString()+"；原始運算式="+raw+"；目標="+Objects.toString(value.value(),"UNRESOLVED")+"；條件="+guards(statement,method);
      List<AnalysisEvidence> evidence=new ArrayList<>();evidence.add(new AnalysisEvidence(source,"SpringControllerReturns",value.kind()==Kind.UNKNOWN?ResolutionStatus.UNRESOLVED:value.kind()==Kind.VIEW?ResolutionStatus.CONFIRMED:ResolutionStatus.INFERRED,detail));
      if(value.kind()==Kind.REDIRECT&&expression.isNameExpr())for(var setter:method.findAll(MethodCallExpr.class))if(setter.getNameAsString().equals("setUrl")&&setter.getScope().filter(v->v.toString().equals(expression.toString())).isPresent())evidence.add(new AnalysisEvidence(new SourceLocation(file,setter.getBegin().orElseThrow().line),"SpringControllerReturns",ResolutionStatus.INFERRED,"RedirectView setter 來源；column="+setter.getBegin().orElseThrow().column+"；原始運算式="+setter));
      if(value.kind()!=Kind.UNKNOWN)evidence.addAll(feedback(method,statement,file));
      targets.add(new Target(value.kind(),value.value(),raw,source,evidence));
    }
    return List.copyOf(targets);
  }
  static String branchKey(Target target){return target.evidence().stream().filter(e->e.detail()!=null&&e.detail().startsWith("分支內賦值來源；column=")).map(e->":assign:"+e.source().line()+":"+e.detail().substring(e.detail().indexOf("column=")+7)).findFirst().orElse("");}
  private static List<AnalysisEvidence> feedback(MethodDeclaration method,ReturnStmt use,String file){
    if(use.getExpression().isEmpty())return List.of();
    String variable=use.getExpression().get().isNameExpr()?use.getExpression().get().asNameExpr().getNameAsString():null;
    Set<String> models=new HashSet<>();method.getParameters().stream().filter(p->Set.of("Model","ModelMap").contains(p.getType().asString())).forEach(p->models.add(p.getNameAsString()));
    Node block=use.getParentNode().orElse(null);
    Map<String,String> values=new TreeMap<>();List<AnalysisEvidence> result=new ArrayList<>();
    for(var call:method.findAll(MethodCallExpr.class))if(belongsTo(call,method)&&Set.of("addObject","addAttribute").contains(call.getNameAsString())&&call.getScope().filter(e->e.isNameExpr()&&(call.getNameAsString().equals("addObject")&&e.asNameExpr().getNameAsString().equals(variable)||call.getNameAsString().equals("addAttribute")&&models.contains(e.asNameExpr().getNameAsString()))).isPresent()&&call.getArguments().size()==2&&call.getArgument(0).isStringLiteralExpr()){
      var statement=call.findAncestor(ExpressionStmt.class);if(statement.isEmpty()||statement.get().getParentNode().orElse(null)!=block||!call.getEnd().orElseThrow().isBefore(use.getBegin().orElseThrow()))continue;
      String key=call.getArgument(0).asStringLiteralExpr().asString(),value=null;Expression argument=call.getArgument(1);
      if(argument.isStringLiteralExpr())value=argument.asStringLiteralExpr().asString();
      else if(argument.isNameExpr()){
        String name=argument.asNameExpr().getNameAsString();var definitions=method.findAll(VariableDeclarator.class).stream().filter(v->belongsTo(v,method)&&v.getNameAsString().equals(name)).toList();
        if(definitions.size()==1){var definition=definitions.get(0);if(definition.getInitializer().filter(Expression::isStringLiteralExpr).isPresent()&&definition.getEnd().orElseThrow().isBefore(call.getBegin().orElseThrow())&&definition.findAncestor(BlockStmt.class).filter(b->b.isAncestorOf(call)).isPresent()&&method.findAll(AssignExpr.class).stream().noneMatch(a->a.getTarget().isNameExpr()&&a.getTarget().asNameExpr().getNameAsString().equals(name)))value=definition.getInitializer().get().asStringLiteralExpr().asString();}
      }
      if(value==null)continue;if(!key.matches("[A-Za-z_][A-Za-z0-9_]*")||value.length()>4000)continue;
      values.put(key,value);
      try{result.add(new AnalysisEvidence(new SourceLocation(file,call.getBegin().orElseThrow().line),"SpringModelFeedback",ResolutionStatus.INFERRED,new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(new TreeMap<>(Map.of("version",1,"values",Map.of(key,value))))));}catch(Exception ignored){}
    }
    return result;
  }
  private static boolean emptyModelAndView(VariableDeclarator definition) {
    return definition.getInitializer().filter(Expression::isObjectCreationExpr).map(Expression::asObjectCreationExpr).filter(c->c.getType().getNameAsString().equals("ModelAndView")&&c.getArguments().isEmpty()).isPresent();
  }
  private record PathValue(Value value,String guard,Node source) { }
  private static List<PathValue> assignedPaths(MethodDeclaration method,ReturnStmt use,String name,Map<String,String> constants) {
    // Only an uninitialized or empty ModelAndView local, with no aliases or escapes, enters finite path analysis.
    for(var n:method.findAll(NameExpr.class))if(n.getNameAsString().equals(name)) {
      if(!belongsTo(n,method))return List.of(new PathValue(unknown(),"閉包或巢狀類別引用",null));
      Node parent=n.getParentNode().orElse(null);
      if(parent instanceof ReturnStmt)continue;
      if(parent instanceof AssignExpr a&&a.getTarget()==n&&a.getOperator()==AssignExpr.Operator.ASSIGN)continue;
      if(parent instanceof MethodCallExpr c&&c.getScope().orElse(null)==n&&Set.of("addObject","addAllObjects","getModel","getModelMap","setViewName").contains(c.getNameAsString()))continue;
      return List.of(new PathValue(unknown(),"變數逸出或不支援的修改",null));
    }
    List<PathValue> result=new ArrayList<>();
    flow(method.getBody().orElseThrow(),List.of(new PathValue(unknown(),"",null)),method,use,name,constants,result,0);
    return result.isEmpty()?List.of(new PathValue(unknown(),"無可證明的賦值",null)):result;
  }
  private static List<PathValue> flow(Statement statement,List<PathValue> paths,MethodDeclaration method,ReturnStmt use,String name,Map<String,String> constants,List<PathValue> result,int depth) {
    if(depth>32||paths.size()>64)return List.of(new PathValue(unknown(),"分析界限",null));
    if(statement==use){result.addAll(paths);return List.of();}
    if(statement.isReturnStmt()||statement.isThrowStmt())return List.of();
    if(statement.isBlockStmt()) {for(var child:statement.asBlockStmt().getStatements())paths=flow(child,paths,method,use,name,constants,result,depth+1);return paths;}
    if(statement.isIfStmt()) {
      var branch=statement.asIfStmt();List<PathValue> yes=new ArrayList<>(),no=new ArrayList<>();
      for(var p:paths){yes.add(new PathValue(p.value,join(p.guard,"("+branch.getCondition()+")"),p.source));no.add(new PathValue(p.value,join(p.guard,"!("+branch.getCondition()+")"),p.source));}
      List<PathValue> merged=new ArrayList<>(flow(branch.getThenStmt(),yes,method,use,name,constants,result,depth+1));
      merged.addAll(branch.getElseStmt().map(e->flow(e,no,method,use,name,constants,result,depth+1)).orElse(no));return merged;
    }
    if(statement.isExpressionStmt()&&statement.asExpressionStmt().getExpression() instanceof AssignExpr a&&a.getTarget().isNameExpr()&&a.getTarget().asNameExpr().getNameAsString().equals(name)) {
      Value v=a.getValue().isObjectCreationExpr()?value(a.getValue(),method,use,constants):unknown();
      return paths.stream().map(p->new PathValue(v,p.guard,a)).toList();
    }
    if(statement.isExpressionStmt()&&statement.asExpressionStmt().getExpression() instanceof MethodCallExpr call&&call.getNameAsString().equals("setViewName")&&call.getScope().filter(e->e.isNameExpr()&&e.asNameExpr().getNameAsString().equals(name)).isPresent()) {
      String view=call.getArguments().size()==1?literal(call.getArgument(0),constants):null;
      Value v=view==null?unknown():classify(view);
      return paths.stream().map(p->new PathValue(v,p.guard,call)).toList();
    }
    if(statement instanceof WhileStmt||statement instanceof ForStmt||statement instanceof ForEachStmt||statement instanceof TryStmt||statement instanceof SwitchStmt||statement instanceof DoStmt) {
      if(statement.isAncestorOf(use)||statement.findAll(NameExpr.class).stream().anyMatch(n->n.getNameAsString().equals(name))){result.add(new PathValue(unknown(),"不支援的控制流程",statement));return List.of();}
    }
    return paths;
  }
  private static String join(String a,String b){return a.isEmpty()?b:a+" && "+b;}
  private record Value(Kind kind,String value) { }
  private static Value unknown() {return new Value(Kind.UNKNOWN,null);}
  private static Value classify(String value) {
    if(value==null)return unknown();
    if(value.startsWith("redirect:"))return new Value(Kind.REDIRECT,value.substring(9));
    if(value.startsWith("forward:"))return new Value(Kind.FORWARD,value.substring(8));
    return new Value(Kind.VIEW,value);
  }
  private static Expression unwrap(Expression expression) {while(expression.isEnclosedExpr())expression=expression.asEnclosedExpr().getInner();return expression;}
  private static String literal(Expression expression,Map<String,String> constants) {
    expression=unwrap(expression);
    if(expression.isStringLiteralExpr())return expression.asStringLiteralExpr().asString();
    return expression.isNameExpr()?constants.get(expression.asNameExpr().getNameAsString()):null;
  }
  private static Value value(Expression expression,MethodDeclaration method,ReturnStmt use,Map<String,String> constants) {
    expression=unwrap(expression);String text=literal(expression,constants);
    if(text!=null)return classify(text);
    if(expression.isBinaryExpr()&&expression.asBinaryExpr().getOperator()==BinaryExpr.Operator.PLUS) {
      List<Expression> parts=new ArrayList<>();flatten(expression,parts);
      String first=literal(parts.get(0),constants);
      if(first==null||(!first.startsWith("redirect:")&&!first.startsWith("forward:")))return unknown();
      StringBuilder result=new StringBuilder();int slot=0;
      for(int i=0;i<parts.size();i++) {
        String constant=literal(parts.get(i),constants);
        if(constant!=null)result.append(constant);
        else {
          // Only authorize a complete unknown path segment between known slash boundaries.
          String following=i+1<parts.size()?literal(parts.get(i+1),constants):"";
          if(!result.toString().endsWith("/")||result.indexOf("?")>=0||result.indexOf("#")>=0||following==null||(!following.isEmpty()&&!following.startsWith("/")))return unknown();
          result.append("{expression").append(++slot).append('}');
        }
      }
      return classify(result.toString());
    }
    if(expression.isObjectCreationExpr()) {
      var object=expression.asObjectCreationExpr();String type=object.getType().getNameAsString();
      if(object.getArguments().isEmpty())return unknown();
      if(type.equals("ModelAndView")) {
        String view=literal(object.getArgument(0),constants);
        if(view!=null)return classify(view);
        return object.getArgument(0).isObjectCreationExpr()?value(object.getArgument(0),method,use,constants):unknown();
      }
      if(type.equals("RedirectView")&&object.getArguments().size()==1) {
        String url=literal(object.getArgument(0),constants);return url==null?unknown():new Value(Kind.REDIRECT_VIEW,url);
      }
    }
    if(expression.isNameExpr()) {
      String name=expression.asNameExpr().getNameAsString();
      var definitions=method.findAll(VariableDeclarator.class).stream().filter(v->belongsTo(v,method)&&v.getNameAsString().equals(name)).toList();
      if(definitions.size()!=1)return unknown();var definition=definitions.get(0);
      if(definition.getInitializer().filter(Expression::isObjectCreationExpr).map(Expression::asObjectCreationExpr).filter(o->o.getType().getNameAsString().equals("RedirectView")&&o.getArguments().isEmpty()).isPresent())return contextRedirect(name,definition,method,use,constants);
      if(definition.getInitializer().isEmpty()||!definition.getInitializer().get().isObjectCreationExpr()
          ||!definition.getInitializer().get().asObjectCreationExpr().getType().getNameAsString().equals("ModelAndView")
          ||definition.getEnd().orElseThrow().isAfter(use.getBegin().orElseThrow()))return unknown();
      var block=definition.findAncestor(BlockStmt.class);if(block.isEmpty()||!block.get().isAncestorOf(use))return unknown();
      if(method.findAll(VariableDeclarator.class).stream().anyMatch(v->v!=definition&&v.getInitializer().isPresent()
          &&v.getInitializer().get().findAll(NameExpr.class).stream().anyMatch(n->n.getNameAsString().equals(name))))return unknown();
      if(method.findAll(AssignExpr.class).stream().anyMatch(a->a.getTarget().isNameExpr()&&a.getTarget().asNameExpr().getNameAsString().equals(name)
          ||a.getValue().findAll(NameExpr.class).stream().anyMatch(n->n.getNameAsString().equals(name))))return unknown();
      if(method.findAll(ObjectCreationExpr.class).stream().anyMatch(o->o.getArguments().stream()
          .anyMatch(a->a.findAll(NameExpr.class).stream().anyMatch(n->n.getNameAsString().equals(name)))))return unknown();
      for(MethodCallExpr call:method.findAll(MethodCallExpr.class)) {
        if(call.getArguments().stream().anyMatch(a->a.findAll(NameExpr.class).stream().anyMatch(n->n.getNameAsString().equals(name))))return unknown();
        if(call.getScope().isPresent()&&call.getScope().get().findAll(NameExpr.class).stream().anyMatch(n->n.getNameAsString().equals(name))
            &&!(call.getScope().get().isNameExpr()&&Set.of("addObject","addAllObjects","getModel","getModelMap","setViewName").contains(call.getNameAsString())))return unknown();
      }
      var setters=method.findAll(MethodCallExpr.class).stream().filter(c->c.getNameAsString().equals("setViewName")&&c.getScope().filter(e->e.isNameExpr()&&e.asNameExpr().getNameAsString().equals(name)).isPresent()).toList();
      if(!setters.isEmpty()) {
        if(setters.size()!=1)return unknown();var setter=setters.get(0);
        var statement=setter.findAncestor(ExpressionStmt.class);
        if(setter.getArguments().size()!=1||statement.isEmpty()||statement.get().getParentNode().orElse(null)!=block.get()
            ||!setter.getBegin().orElseThrow().isAfter(definition.getEnd().orElseThrow())||!setter.getEnd().orElseThrow().isBefore(use.getBegin().orElseThrow()))return unknown();
        String view=literal(setter.getArgument(0),constants);return view==null?unknown():classify(view);
      }
      return value(definition.getInitializer().get(),method,use,constants);
    }
    return unknown();
  }
  private static Value contextRedirect(String name,VariableDeclarator definition,MethodDeclaration method,ReturnStmt use,Map<String,String> constants){
    var block=definition.findAncestor(BlockStmt.class);if(block.isEmpty()||!block.get().isAncestorOf(use))return unknown();
    List<MethodCallExpr> setters=new ArrayList<>();
    for(var n:method.findAll(NameExpr.class))if(n.getNameAsString().equals(name)){
      if(!belongsTo(n,method))return unknown();Node parent=n.getParentNode().orElse(null);
      if(parent==use)continue;
      if(parent instanceof MethodCallExpr call&&call.getScope().orElse(null)==n&&call.getNameAsString().equals("setUrl")){setters.add(call);continue;}
      return unknown();
    }
    if(setters.size()!=1)return unknown();var setter=setters.get(0);
    if(setter.getArguments().size()!=1||setter.findAncestor(ExpressionStmt.class).filter(s->s.getParentNode().orElse(null)==block.get()).isEmpty()||!setter.getBegin().orElseThrow().isAfter(definition.getEnd().orElseThrow())||!setter.getEnd().orElseThrow().isBefore(use.getBegin().orElseThrow()))return unknown();
    var e=unwrap(setter.getArgument(0));if(!e.isBinaryExpr()||e.asBinaryExpr().getOperator()!=BinaryExpr.Operator.PLUS)return unknown();
    var binary=e.asBinaryExpr();String suffix=literal(binary.getRight(),constants);var left=unwrap(binary.getLeft());
    if(suffix==null||!suffix.startsWith("/")||suffix.startsWith("//")||suffix.contains("..")||!left.isMethodCallExpr())return unknown();
    var context=left.asMethodCallExpr();if(!context.getNameAsString().equals("getContextPath")||!context.getArguments().isEmpty()||context.getScope().filter(Expression::isNameExpr).isEmpty())return unknown();
    String request=context.getScope().get().asNameExpr().getNameAsString();var parameters=method.getParameters().stream().filter(p->p.getNameAsString().equals(request)&&Set.of("HttpServletRequest","javax.servlet.http.HttpServletRequest","jakarta.servlet.http.HttpServletRequest").contains(p.getType().asString())).toList();
    if(parameters.size()!=1||method.findAll(VariableDeclarator.class).stream().anyMatch(v->v.getNameAsString().equals(request))||method.findAll(AssignExpr.class).stream().anyMatch(a->a.getTarget().toString().equals(request)))return unknown();
    return new Value(Kind.REDIRECT,suffix);
  }
  private static void flatten(Expression expression,List<Expression> parts) {
    expression=unwrap(expression);
    if(expression.isBinaryExpr()&&expression.asBinaryExpr().getOperator()==BinaryExpr.Operator.PLUS) {flatten(expression.asBinaryExpr().getLeft(),parts);flatten(expression.asBinaryExpr().getRight(),parts);}
    else parts.add(expression);
  }
  private static boolean belongsTo(Node node,MethodDeclaration method) {
    for(Node parent=node;parent!=method;parent=parent.getParentNode().orElse(null)) {
      if(parent==null||parent instanceof LambdaExpr||parent instanceof MethodDeclaration||parent instanceof ClassOrInterfaceDeclaration)return false;
    }
    return true;
  }
  private static String guards(Node node,MethodDeclaration method) {
    List<String> conditions=new ArrayList<>();
    for(Node child=node,parent=node.getParentNode().orElse(null);parent!=null&&parent!=method;child=parent,parent=parent.getParentNode().orElse(null)) {
      if(parent instanceof IfStmt branch)conditions.add((branch.getElseStmt().orElse(null)==child?"!(":"(")+branch.getCondition()+")");
    }
    Collections.reverse(conditions);return conditions.isEmpty()?"分支條件未求值":String.join(" && ",conditions);
  }
}
