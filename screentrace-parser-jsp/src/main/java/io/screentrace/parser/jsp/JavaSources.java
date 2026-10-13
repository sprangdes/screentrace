package io.screentrace.parser.jsp;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseProblemException;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;

/** One Java parser configuration for every analyzer, so records, switch expressions and text blocks parse alike. */
public final class JavaSources {
    private static final ParserConfiguration.LanguageLevel LEVEL = ParserConfiguration.LanguageLevel.JAVA_21;

    private JavaSources() { }

    /** Parses a whole compilation unit; like {@code StaticJavaParser.parse}, any syntax problem throws. */
    public static CompilationUnit parse(String source) {
        var result = new JavaParser(new ParserConfiguration().setLanguageLevel(LEVEL)).parse(source);
        if (!result.isSuccessful() || result.getResult().isEmpty()) throw new ParseProblemException(result.getProblems());
        return result.getResult().get();
    }
}
