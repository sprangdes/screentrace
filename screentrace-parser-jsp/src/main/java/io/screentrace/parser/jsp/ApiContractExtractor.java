package io.screentrace.parser.jsp;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.RecordDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import com.github.javaparser.ast.type.Type;
import io.screentrace.core.ApplicationGraph.ApiContract;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Field;
import io.screentrace.core.ApplicationGraph.Request;
import io.screentrace.core.ApplicationGraph.Response;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import java.io.IOException;
import java.nio.file.Path;
import io.screentrace.scanner.SafeProjectFiles;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Extracts only controller-declared API contracts; it never executes application code. */
public class ApiContractExtractor {
  private final Map<String, List<Dto>> dtoByName = new HashMap<>();

  public ApiContractExtractor(Path root, List<Path> javaFiles) {
    for (Path file : javaFiles) index(root, file);
  }

  public ApiContract contract(String endpointId, MethodDeclaration method, AnnotationExpr mapping, SourceLocation source,
                       List<String> views) {
    List<Field> requestFields = new ArrayList<>();
    String bodyType = null;
    for (var parameter : method.getParameters()) {
      AnnotationExpr annotation = requestAnnotation(parameter.getAnnotations());
      if (annotation == null && infrastructureParameter(parameter.getType().asString())) continue;
      String location = annotation == null ? "QUERY" : location(annotation.getName().getIdentifier());
      String name = annotation == null ? parameter.getNameAsString() : annotationValue(annotation, "value");
      if (name == null && annotation != null) name = annotationValue(annotation, "name");
      if (name == null || name.isBlank()) name = parameter.getNameAsString();
      boolean required = annotation != null && !"false".equals(annotationValue(annotation, "required"));
      String type = parameter.getType().asString();
      SourceLocation fieldSource = new SourceLocation(source.file(), parameter.getBegin().map(p -> p.line).orElse(source.line()));
      requestFields.add(new Field(name, type, location, required, fieldSource, Confidence.CONFIRMED));
      if ("BODY".equals(location) || annotation == null) {
        bodyType = type;
        requestFields.addAll(dtoFields(qualified(type,method), location, annotation != null));
      }
    }
    String responseType = responseBodyType(method.getType().asString());
    List<Field> responseFields = dtoFields(qualified(responseType,method), "BODY", true);
    String status = responseStatus(method);
    String contentType = annotationValue(mapping, "produces");
    Request request = new Request(annotationValue(mapping,"consumes"), bodyType, requestFields);
    String viewResponse = views.isEmpty() ? responseType : "VIEW: " + String.join(" | ", views);
    Response response = new Response(status, views.isEmpty() ? contentType : "text/html", viewResponse, responseFields, source,
        "200".equals(status) ? Confidence.INFERRED : Confidence.CONFIRMED);
    return new ApiContract(endpointId, request, List.of(response), source, requestFields.stream().anyMatch(f->f.confidence()==Confidence.AMBIGUOUS)||responseFields.stream().anyMatch(f->f.confidence()==Confidence.AMBIGUOUS)?Confidence.AMBIGUOUS:Confidence.CONFIRMED);
  }

  private void index(Path root, Path file) {
    try {
      String relative = root.relativize(file).toString();
      var unit = StaticJavaParser.parse(SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES));
      for (ClassOrInterfaceDeclaration type : unit.findAll(ClassOrInterfaceDeclaration.class)) {
        List<Field> fields = new ArrayList<>();
        for (var declaration : type.getFields()) if(!declaration.isStatic()) for (VariableDeclarator variable : declaration.getVariables()) {
          fields.add(field(variable.getNameAsString(), variable.getType(), relative,
              variable.getBegin().map(p -> p.line).orElse(1)));
        }
        for(var method:type.getMethods())if(method.getParameters().isEmpty()&&method.getNameAsString().startsWith("get")&&method.getNameAsString().length()>3&&!method.isStatic()){String name=java.beans.Introspector.decapitalize(method.getNameAsString().substring(3));if(fields.stream().noneMatch(f->f.name().equals(name)))fields.add(field(name,method.getType(),relative,method.getBegin().map(p->p.line).orElse(1)));}
        String parent = type.getExtendedTypes().isEmpty() ? null : type.getExtendedTypes().get(0).getNameAsString();
        register(type.getNameAsString(),type.getFullyQualifiedName().orElse(type.getNameAsString()),new Dto(fields,parent));
      }
      for (RecordDeclaration type : unit.findAll(RecordDeclaration.class)) {
        List<Field> fields = type.getParameters().stream().map(parameter -> field(parameter.getNameAsString(), parameter.getType(), relative,
            parameter.getBegin().map(p -> p.line).orElse(1))).toList();
        register(type.getNameAsString(),type.getFullyQualifiedName().orElse(type.getNameAsString()),new Dto(fields,null));
      }
    } catch (IOException | RuntimeException ignored) {
      // Controller analysis emits its normal source diagnostic; an unindexed DTO remains unresolved by omission.
    }
  }

  private static Field field(String name, Type type, String file, int line) {
    return new Field(name, type.asString(), "BODY", true, new SourceLocation(file, line), Confidence.CONFIRMED);
  }

  public List<Field> fieldsFor(String type,String location,boolean required){return dtoFields(type,location,required);}

  private List<Field> dtoFields(String type,String location,boolean required){return dtoFields(type,location,required,new java.util.HashSet<>());}
  private List<Field> dtoFields(String type, String location, boolean required,java.util.Set<String> seen) {
    String simple = simpleType(type != null && type.contains("<") ? generic(type) : type);
    String key=type==null?"":type.replace("[]","");List<Dto> candidates=dtoByName.getOrDefault(key,dtoByName.getOrDefault(simple,List.of()));
    if(candidates.isEmpty()||!seen.add(key))return List.of();List<Field> fields=new ArrayList<>();
    for(Dto dto:candidates){if(dto.parent()!=null)fields.addAll(dtoFields(dto.parent(),location,required,new java.util.HashSet<>(seen)));for(Field field:dto.fields())fields.add(new Field(field.name(),field.type(),location,required,field.source(),candidates.size()>1?Confidence.AMBIGUOUS:field.confidence()));}return fields.stream().distinct().toList();
  }
  private void register(String simple,String full,Dto dto){dtoByName.computeIfAbsent(simple,k->new ArrayList<>()).add(dto);if(!full.equals(simple))dtoByName.computeIfAbsent(full,k->new ArrayList<>()).add(dto);}
  private static String qualified(String type,MethodDeclaration method){if(type==null)return null;String value=type.replace("[]","");if(value.contains("<"))return type;var unit=method.findCompilationUnit().orElseThrow();if(!value.contains(".")){for(var i:unit.getImports())if(!i.isAsterisk()&&!i.isStatic()&&i.getName().getIdentifier().equals(value))return i.getNameAsString();String name=value;return unit.getPackageDeclaration().map(p->p.getNameAsString()+"."+name).orElse(value);}return value;}

  private static boolean infrastructureParameter(String type) {
    return type.equals("BindingResult") || type.equals("Model") || type.equals("ModelMap") || type.startsWith("Map<")
        || type.equals("WebRequest") || type.equals("HttpServletRequest") || type.equals("HttpServletResponse");
  }

  private static String simpleType(String type) {
    if (type == null) return "";
    String value = type.replaceAll("<.*>", "").replace("[]", "");
    int dot = value.lastIndexOf('.');
    return dot < 0 ? value : value.substring(dot + 1);
  }

  private static String responseBodyType(String type) {
    if (type.startsWith("ResponseEntity<")) return generic(type);
    return type.equals("void") ? null : type;
  }

  private static String generic(String type) {
    int start = type.indexOf('<');
    return start < 0 ? type : type.substring(start + 1, type.lastIndexOf('>'));
  }

  private static AnnotationExpr requestAnnotation(List<AnnotationExpr> annotations) {
    return annotations.stream().filter(annotation -> switch (annotation.getName().getIdentifier()) {
      case "RequestParam", "PathVariable", "RequestHeader", "RequestBody", "ModelAttribute" -> true;
      default -> false;
    }).findFirst().orElse(null);
  }

  private static String location(String annotation) {
    return switch (annotation) {
      case "RequestParam" -> "QUERY";
      case "PathVariable" -> "PATH";
      case "RequestHeader" -> "HEADER";
      case "RequestBody", "ModelAttribute" -> "BODY";
      default -> "UNKNOWN";
    };
  }

  private static String responseStatus(MethodDeclaration method) {
    AnnotationExpr annotation = method.getAnnotations().stream()
        .filter(item -> item.getNameAsString().equals("ResponseStatus")).findFirst().orElse(null);
    if (annotation == null) return "200";
    String code = annotationValue(annotation, "value");
    return code == null ? "200" : code.replace("HttpStatus.", "");
  }

  private static String annotationValue(AnnotationExpr annotation, String name) {
    if(annotation==null)return null;
    if (annotation.isSingleMemberAnnotationExpr() && "value".equals(name)) {
      return value(annotation.asSingleMemberAnnotationExpr().getMemberValue());
    }
    if (annotation instanceof NormalAnnotationExpr normal) return normal.getPairs().stream()
        .filter(pair -> pair.getNameAsString().equals(name)).map(pair -> value(pair.getValue())).findFirst().orElse(null);
    return null;
  }

  private static String value(com.github.javaparser.ast.expr.Expression expression) {
    if (expression instanceof StringLiteralExpr literal) return literal.asString();
    return expression.toString();
  }

  private record Dto(List<Field> fields, String parent) { }
}
