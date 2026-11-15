package io.screentrace.adapter.spring;

import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;
import java.util.Optional;
import java.util.Set;

/**
 * Controller mapping rules shared by the Spring MVC and Spring Boot analyzers, so a fix to how a
 * controller method is recognized reaches both (RV-801).
 */
final class SpringMappings {
  static final Set<String> MAPPINGS =
      Set.of(
          "RequestMapping",
          "GetMapping",
          "PostMapping",
          "PutMapping",
          "DeleteMapping",
          "PatchMapping");

  private SpringMappings() {}

  /** Whether `type` is a Spring controller. */
  static boolean isController(ClassOrInterfaceDeclaration type) {
    return has(type, "Controller") || has(type, "RestController");
  }

  /** The first request-mapping annotation on `method`. */
  static Optional<AnnotationExpr> mapping(MethodDeclaration method) {
    return method.getAnnotations().stream()
        .filter(annotation -> MAPPINGS.contains(annotation.getNameAsString()))
        .findFirst();
  }

  /**
   * Whether the method writes its response body instead of naming a view: a REST controller,
   * {@code @ResponseBody} on the type or method, a {@code ResponseEntity}, or a void method with
   * {@code @ResponseStatus}.
   */
  static boolean respondsWithBody(ClassOrInterfaceDeclaration type, MethodDeclaration method) {
    return has(type, "RestController")
        || has(type, "ResponseBody")
        || has(method, "ResponseBody")
        || method.getType().isClassOrInterfaceType()
            && method.getType().asClassOrInterfaceType().getNameAsString().equals("ResponseEntity")
        || (has(type, "ResponseStatus") || has(method, "ResponseStatus"))
            && method.getType().isVoidType();
  }

  /** A class-level path and a method-level path joined into one absolute route. */
  static String join(String base, String child) {
    String path = (child.isEmpty() ? base : base + "/" + child).replaceAll("/{2,}", "/");
    return path.isEmpty() ? "/" : path.startsWith("/") ? path : "/" + path;
  }

  private static boolean has(NodeWithAnnotations<?> node, String name) {
    return node.getAnnotations().stream().anyMatch(a -> a.getNameAsString().equals(name));
  }
}
