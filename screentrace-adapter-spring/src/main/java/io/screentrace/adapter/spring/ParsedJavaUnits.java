package io.screentrace.adapter.spring;
import com.github.javaparser.ast.CompilationUnit;import io.screentrace.parser.jsp.JavaSources;import io.screentrace.scanner.SafeProjectFiles;import java.io.IOException;import java.nio.file.Path;import java.util.*;
/** One analysis run's parsed Java sources, keyed by path, so each enricher reads and parses a file at most once.
 * A failed read or parse is kept and rethrown as the same exception, so every caller still reports its own diagnostic.
 * Callers only read the trees; nothing here may be mutated. */
final class ParsedJavaUnits {
 private final Path root;private final Map<Path,Object> units=new HashMap<>();
 ParsedJavaUnits(Path root){this.root=root;}
 CompilationUnit parse(Path file) throws IOException {
  Object unit=units.get(file);
  if(unit==null){try{unit=JavaSources.parse(SafeProjectFiles.readUtf8Limited(root,file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES));}catch(IOException|RuntimeException error){unit=error;}units.put(file,unit);}
  if(unit instanceof IOException error)throw error;if(unit instanceof RuntimeException error)throw error;return (CompilationUnit)unit;
 }
}
