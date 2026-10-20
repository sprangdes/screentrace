import com.github.javaparser.*;
import com.github.javaparser.ast.*;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import java.nio.file.*;
import java.util.*;
/** Independent test census. Parses source text only; never loads target classes. */
public class SourceCensus {
 static final Set<String> MAPPINGS=Set.of("RequestMapping","GetMapping","PostMapping","PutMapping","DeleteMapping","PatchMapping");
 static String simple(AnnotationExpr a){return a.getName().getIdentifier();}
 static Expression attr(AnnotationExpr a,String key){if(a==null)return null;if(a.isSingleMemberAnnotationExpr()&&key.equals("value"))return a.asSingleMemberAnnotationExpr().getMemberValue();if(a.isNormalAnnotationExpr())return a.asNormalAnnotationExpr().getPairs().stream().filter(p->p.getNameAsString().equals(key)).map(p->p.getValue()).findFirst().orElse(null);return null;}
 static List<String> strings(Expression e){if(e==null)return List.of("");if(e.isStringLiteralExpr())return List.of(e.asStringLiteralExpr().asString());if(e.isArrayInitializerExpr()){List<String> v=new ArrayList<>();for(var n:e.asArrayInitializerExpr().getValues())v.addAll(strings(n));return v;}return List.of("UNRESOLVED:"+e);}
 static List<String> paths(AnnotationExpr a){var e=attr(a,"path");return strings(e==null?attr(a,"value"):e);}
 static int line(Node n){return n.getBegin().map(p->p.line).orElse(1);}
 static void emit(Map<String,Object> row){System.out.println(json(row));}
 static Map<String,Object> row(String kind,String file,Node n){Map<String,Object> m=new LinkedHashMap<>();m.put("kind",kind);m.put("file",file);m.put("line",line(n));return m;}
 static String json(Object value){if(value==null)return "null";if(value instanceof Number||value instanceof Boolean)return value.toString();if(value instanceof Map<?,?> m)return "{"+String.join(",",m.entrySet().stream().map(e->json(e.getKey().toString())+":"+json(e.getValue())).toList())+"}";if(value instanceof Collection<?> c)return "["+String.join(",",c.stream().map(SourceCensus::json).toList())+"]";String s=value.toString();StringBuilder b=new StringBuilder("\"");for(char ch:s.toCharArray())switch(ch){case '"'->b.append("\\\"");case '\\'->b.append("\\\\");case '\n'->b.append("\\n");case '\r'->b.append("\\r");case '\t'->b.append("\\t");default->{if(ch<32)b.append(String.format("\\u%04x",(int)ch));else b.append(ch);}}return b.append('"').toString();}
 public static void main(String[] args)throws Exception {
  Path root=Path.of(args[0]);var parser=new JavaParser(new ParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_17));
  for(String rel:Files.readAllLines(Path.of(args[1]))) {
   var parsed=parser.parse(Files.readString(root.resolve(rel),java.nio.charset.Charset.forName(args.length>2?args[2]:"UTF-8")));if(!parsed.isSuccessful()){emit(Map.of("kind","parseError","file",rel,"problems",parsed.getProblems().toString()));continue;}
   var unit=parsed.getResult().orElseThrow();
   for(var type:unit.findAll(ClassOrInterfaceDeclaration.class)) {
    var isController=type.getAnnotations().stream().anyMatch(a->Set.of("Controller","RestController").contains(simple(a)));if(!isController)continue;
    var base=type.getAnnotations().stream().filter(a->simple(a).equals("RequestMapping")).findFirst().orElse(null);
    for(var method:type.getMethods()) {
     for(var mapping:method.getAnnotations())if(MAPPINGS.contains(simple(mapping))) {
      List<String> verbs;if(simple(mapping).equals("RequestMapping")){Expression e=attr(mapping,"method");verbs=e==null?List.of("ANY"):e.isArrayInitializerExpr()?e.asArrayInitializerExpr().getValues().stream().map(v->v.toString().replace("RequestMethod.","")).toList():List.of(e.toString().replace("RequestMethod.",""));}else verbs=List.of(simple(mapping).replace("Mapping","").toUpperCase(Locale.ROOT));
      for(String a:paths(base))for(String b:paths(mapping))for(String verb:verbs){var m=row("endpoint",rel,method);m.put("class",type.getNameAsString());m.put("method",method.getNameAsString());m.put("lineEnd",method.getEnd().orElseThrow().line);m.put("httpMethod",verb);m.put("path",("/"+a+"/"+b).replaceAll("/+","/").replaceFirst("(?<=.)/$",""));m.put("params",Objects.toString(attr(mapping,"params"),""));m.put("rest",type.getAnnotations().stream().anyMatch(x->simple(x).equals("RestController"))||method.getAnnotations().stream().anyMatch(x->simple(x).equals("ResponseBody")));emit(m);}
      for(var ret:method.findAll(ReturnStmt.class)){var m=row("return",rel,ret);m.put("class",type.getNameAsString());m.put("method",method.getNameAsString());m.put("expression",ret.getExpression().map(Object::toString).orElse(""));List<String> guards=new ArrayList<>();for(Node n=ret;n.getParentNode().isPresent();n=n.getParentNode().orElseThrow())if(n.getParentNode().orElseThrow() instanceof IfStmt branch)guards.add(branch.getCondition().toString());m.put("guards",guards);emit(m);}
      for(var call:method.findAll(MethodCallExpr.class))if(call.getNameAsString().equals("setViewName")&&call.getArguments().size()==1){var m=row("viewAssignment",rel,call);m.put("method",method.getNameAsString());m.put("expression",call.toString());m.put("literalView",call.getArgument(0).isStringLiteralExpr()?call.getArgument(0).asStringLiteralExpr().asString():null);emit(m);}
      for(var creation:method.findAll(ObjectCreationExpr.class))if(creation.getType().getNameAsString().equals("ModelAndView")){var m=row("modelAndView",rel,creation);m.put("method",method.getNameAsString());m.put("expression",creation.toString());m.put("literalView",creation.getArguments().isNonEmpty()&&creation.getArgument(0).isStringLiteralExpr()?creation.getArgument(0).asStringLiteralExpr().asString():null);emit(m);}
     }
    }
   }
   for(var call:unit.findAll(MethodCallExpr.class))if(Set.of("loginProcessingUrl","logoutUrl").contains(call.getNameAsString())&&call.getArguments().size()==1&&call.getArgument(0).isStringLiteralExpr()){var m=row("frameworkEndpoint",rel,call);m.put("path",call.getArgument(0).asStringLiteralExpr().asString());m.put("configurationCall",call.getNameAsString());emit(m);}
   for(var annotation:unit.findAll(AnnotationExpr.class))if(Set.of("NotNull","NotBlank","NotEmpty","Email","Size","Min","Max","Pattern","Positive","Valid").contains(simple(annotation))){var m=row("validationAnnotation",rel,annotation);m.put("expression",annotation.toString());emit(m);}
  }
 }
}
