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
      Value value=value(expression,method,statement,constants);
      String detail="類別="+className+"；方法="+className+"."+method.getNameAsString()+"；原始運算式="+raw+"；目標="+Objects.toString(value.value(),"UNRESOLVED")+"；條件="+guards(statement,method);
      targets.add(new Target(value.kind(),value.value(),raw,source,List.of(new AnalysisEvidence(source,"SpringControllerReturns",value.kind()==Kind.UNKNOWN?ResolutionStatus.UNRESOLVED:value.kind()==Kind.VIEW?ResolutionStatus.CONFIRMED:ResolutionStatus.INFERRED,detail))));
    }
    return List.copyOf(targets);
  }
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
            &&!(call.getScope().get().isNameExpr()&&Set.of("addObject","addAllObjects","getModel","getModelMap").contains(call.getNameAsString())))return unknown();
      }
      return value(definition.getInitializer().get(),method,use,constants);
    }
    return unknown();
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
