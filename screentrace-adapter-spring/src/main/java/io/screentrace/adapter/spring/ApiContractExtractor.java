package io.screentrace.adapter.spring;

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
final class ApiContractExtractor {
  private final Map<String, Dto> dtoByName = new HashMap<>();

  ApiContractExtractor(Path root, List<Path> javaFiles) {
    for (Path file : javaFiles) index(root, file);
  }

  ApiContract contract(String endpointId, MethodDeclaration method, AnnotationExpr mapping, SourceLocation source,
                       List<String> views) {
    List<Field> requestFields = new ArrayList<>();
    String bodyType = null;
    for (var parameter : method.getParameters()) {
      AnnotationExpr annotation = requestAnnotation(parameter.getAnnotations());
      if (annotation == null && infrastructureParameter(parameter.getType().asString())) continue;
      String location = annotation == null ? "QUERY" : location(annotation.getNameAsString());
      String name = annotation == null ? parameter.getNameAsString() : annotationValue(annotation, "value");
      if (name == null && annotation != null) name = annotationValue(annotation, "name");
      if (name == null || name.isBlank()) name = parameter.getNameAsString();
      boolean required = annotation != null && !"false".equals(annotationValue(annotation, "required"));
      String type = parameter.getType().asString();
      SourceLocation fieldSource = new SourceLocation(source.file(), parameter.getBegin().map(p -> p.line).orElse(source.line()));
      requestFields.add(new Field(name, type, location, required, fieldSource, Confidence.CONFIRMED));
      if ("BODY".equals(location) || annotation == null) {
        bodyType = type;
        requestFields.addAll(dtoFields(type, location, annotation != null));
      }
    }
    String responseType = responseBodyType(method.getType().asString());
    List<Field> responseFields = dtoFields(responseType, "BODY", true);
    String status = responseStatus(method);
    String contentType = annotationValue(mapping, "produces");
    Request request = new Request(null, bodyType, requestFields);
    String viewResponse = views.isEmpty() ? responseType : "VIEW: " + String.join(" | ", views);
    Response response = new Response(status, views.isEmpty() ? contentType : "text/html", viewResponse, responseFields, source,
        "200".equals(status) ? Confidence.INFERRED : Confidence.CONFIRMED);
    return new ApiContract(endpointId, request, List.of(response), source, Confidence.CONFIRMED);
  }

  private void index(Path root, Path file) {
    try {
      String relative = root.relativize(file).toString();
      var unit = StaticJavaParser.parse(SafeProjectFiles.readUtf8Limited(root, file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES));
      for (ClassOrInterfaceDeclaration type : unit.findAll(ClassOrInterfaceDeclaration.class)) {
        List<Field> fields = new ArrayList<>();
        for (var declaration : type.getFields()) for (VariableDeclarator variable : declaration.getVariables()) {
          fields.add(field(variable.getNameAsString(), variable.getType(), relative,
              variable.getBegin().map(p -> p.line).orElse(1)));
        }
        String parent = type.getExtendedTypes().isEmpty() ? null : type.getExtendedTypes().get(0).getNameAsString();
        dtoByName.putIfAbsent(type.getNameAsString(), new Dto(fields, parent));
      }
      for (RecordDeclaration type : unit.findAll(RecordDeclaration.class)) {
        List<Field> fields = type.getParameters().stream().map(parameter -> field(parameter.getNameAsString(), parameter.getType(), relative,
            parameter.getBegin().map(p -> p.line).orElse(1))).toList();
        dtoByName.putIfAbsent(type.getNameAsString(), new Dto(fields, null));
      }
    } catch (IOException | RuntimeException ignored) {
      // Controller analysis emits its normal source diagnostic; an unindexed DTO remains unresolved by omission.
    }
  }

  private static Field field(String name, Type type, String file, int line) {
    return new Field(name, type.asString(), "BODY", true, new SourceLocation(file, line), Confidence.CONFIRMED);
  }

  private List<Field> dtoFields(String type, String location, boolean required) {
    String simple = simpleType(type != null && type.contains("<") ? generic(type) : type);
    Dto dto = dtoByName.get(simple);
    if (dto == null) return List.of();
    List<Field> fields = new ArrayList<>();
    if (dto.parent() != null) fields.addAll(dtoFields(dto.parent(), location, required));
    for (Field field : dto.fields()) fields.add(new Field(field.name(), field.type(), location, required, field.source(), field.confidence()));
    return fields;
  }

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
    return type.equals("void") || type.equals("String") ? null : type;
  }

  private static String generic(String type) {
    int start = type.indexOf('<');
    return start < 0 ? type : type.substring(start + 1, type.lastIndexOf('>'));
  }

  private static AnnotationExpr requestAnnotation(List<AnnotationExpr> annotations) {
    return annotations.stream().filter(annotation -> switch (annotation.getNameAsString()) {
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
