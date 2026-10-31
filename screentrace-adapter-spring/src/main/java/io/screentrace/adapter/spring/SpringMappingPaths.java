package io.screentrace.adapter.spring;

import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.BinaryExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import io.screentrace.core.ApplicationGraph.AnalysisEvidence;
import io.screentrace.core.ApplicationGraph.Confidence;
import io.screentrace.core.ApplicationGraph.Diagnostic;
import io.screentrace.core.ApplicationGraph.ResolutionStatus;
import io.screentrace.core.ApplicationGraph.SourceLocation;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Mapping path values: string literals, final String fields of the declaring type initialized from those, and
 * their {@code +} concatenation. Any other expression is reported as unresolved instead of becoming an empty path.
 */
final class SpringMappingPaths {
    static final String CODE = "SPRING_MAPPING_PATH_UNRESOLVED";
    private static final Set<String> PATH_NAMES = Set.of("value", "path");
    private static final int MAX_DEPTH = 8;

    /** {@code omitted} is true only when the annotation declares no path at all. */
    record Result(List<String> paths, List<String> unresolved, boolean omitted) { }

    private SpringMappingPaths() { }

    static Result of(AnnotationExpr annotation, ClassOrInterfaceDeclaration type) {
        List<Expression> declared = new ArrayList<>();
        if (annotation instanceof SingleMemberAnnotationExpr single) declared.add(single.getMemberValue());
        else if (annotation instanceof NormalAnnotationExpr normal)
            normal.getPairs().stream().filter(pair -> PATH_NAMES.contains(pair.getNameAsString())).forEach(pair -> declared.add(pair.getValue()));
        List<Expression> values = new ArrayList<>();
        declared.forEach(value -> flatten(value, values));
        Map<String, Expression> constants = constants(type);
        List<String> paths = new ArrayList<>(), unresolved = new ArrayList<>();
        for (Expression value : values) {
            Optional<String> resolved = evaluate(value, constants, type.getNameAsString(), 0);
            if (resolved.isPresent()) paths.add(resolved.get());
            else unresolved.add(value.toString());
        }
        return new Result(List.copyOf(paths), List.copyOf(unresolved), values.isEmpty());
    }

    /** The paths to map: the resolved ones, or "" only when no path was declared. */
    static List<String> effective(Result result) {
        return result.omitted() ? List.of("") : result.paths();
    }

    static void report(Result result, SourceLocation source, String owner, List<Diagnostic> diagnostics) {
        for (String expression : result.unresolved()) {
            String detail = owner + " 的 mapping 路徑無法靜態解析：" + expression;
            diagnostics.add(new Diagnostic(detail, Confidence.UNRESOLVED, source, CODE,
                List.of(new AnalysisEvidence(source, "SpringMappingPaths", ResolutionStatus.UNRESOLVED, "原始運算式=" + expression))));
        }
    }

    private static void flatten(Expression value, List<Expression> values) {
        if (value.isArrayInitializerExpr()) value.asArrayInitializerExpr().getValues().forEach(item -> flatten(item, values));
        else values.add(value);
    }

    private static Map<String, Expression> constants(ClassOrInterfaceDeclaration type) {
        Map<String, Expression> values = new HashMap<>();
        type.getFields().stream().filter(field -> field.isFinal() && field.getElementType().asString().equals("String"))
            .forEach(field -> field.getVariables().forEach(variable -> variable.getInitializer().ifPresent(init -> values.put(variable.getNameAsString(), init))));
        return values;
    }

    private static Optional<String> evaluate(Expression value, Map<String, Expression> constants, String typeName, int depth) {
        if (depth > MAX_DEPTH) return Optional.empty();
        if (value.isEnclosedExpr()) return evaluate(value.asEnclosedExpr().getInner(), constants, typeName, depth + 1);
        if (value.isStringLiteralExpr()) return Optional.of(value.asStringLiteralExpr().asString());
        String name = null;
        if (value.isNameExpr()) name = value.asNameExpr().getNameAsString();
        else if (value.isFieldAccessExpr() && value.asFieldAccessExpr().getScope().toString().equals(typeName)) name = value.asFieldAccessExpr().getNameAsString();
        if (name != null) {
            Expression init = constants.get(name);
            return init == null ? Optional.empty() : evaluate(init, constants, typeName, depth + 1);
        }
        if (value.isBinaryExpr() && value.asBinaryExpr().getOperator() == BinaryExpr.Operator.PLUS) {
            Optional<String> left = evaluate(value.asBinaryExpr().getLeft(), constants, typeName, depth + 1);
            Optional<String> right = evaluate(value.asBinaryExpr().getRight(), constants, typeName, depth + 1);
            return left.isPresent() && right.isPresent() ? Optional.of(left.get() + right.get()) : Optional.empty();
        }
        return Optional.empty();
    }
}
