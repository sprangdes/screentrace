package io.screentrace.adapter.struts;

import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import io.screentrace.scanner.SafeProjectFiles;
import java.nio.file.Path;
import java.util.*;

/** A Struts 2 signal rejects the whole project before any JSP or Spring analysis. */
public final class StrutsFrameworkDetector {
  private StrutsFrameworkDetector() { }
  public static Optional<Diagnostic> unsupported(ProjectInventory inventory) {
    for(Path file:inventory.files().stream().sorted().toList()) try {
      String name=file.getFileName().toString(),text="";
      if(name.equals("struts.xml")) return Optional.of(rejection(inventory,file,1));
      if(name.endsWith(".java")||name.endsWith(".xml")||name.endsWith(".gradle")||name.endsWith(".gradle.kts")) text=SafeProjectFiles.readUtf8Limited(inventory.root(),file,SafeProjectFiles.MAX_SOURCE_FILE_BYTES);
      if(name.endsWith(".java")) {
        var parsed=new com.github.javaparser.JavaParser(new com.github.javaparser.ParserConfiguration().setLanguageLevel(com.github.javaparser.ParserConfiguration.LanguageLevel.BLEEDING_EDGE)).parse(text);
        if(parsed.getResult().isPresent()) {
          var unit=parsed.getResult().get();
          var imports=unit.getImports().stream().filter(i->i.getNameAsString().startsWith("org.apache.struts2.")||i.getNameAsString().equals("org.apache.struts2")).findFirst();
          if(imports.isPresent()) return Optional.of(rejection(inventory,file,imports.get().getBegin().map(p->p.line).orElse(1)));
          var types=unit.findAll(com.github.javaparser.ast.type.ClassOrInterfaceType.class).stream().filter(t->t.getNameWithScope().startsWith("org.apache.struts2.")).findFirst();
          if(types.isPresent()) return Optional.of(rejection(inventory,file,types.get().getBegin().map(p->p.line).orElse(1)));
          if(unit.getPackageDeclaration().map(p->p.getNameAsString().startsWith("org.apache.struts2")).orElse(false)) return Optional.of(rejection(inventory,file,unit.getPackageDeclaration().get().getBegin().map(p->p.line).orElse(1)));
        }
      } else if(name.equals("pom.xml")) {
        for(var dependency:StrutsSources.elements(StrutsSources.xml(text),"dependency")) {
          var artifacts=StrutsSources.elements(dependency,"artifactId");var groups=StrutsSources.elements(dependency,"groupId");
          if(artifacts.stream().anyMatch(a->a.getTextContent().trim().equals("struts2-core")) || groups.stream().anyMatch(g->g.getTextContent().trim().equals("org.apache.struts2"))) return Optional.of(rejection(inventory,file,StrutsSources.source(StrutsSources.relative(inventory.root(),file),dependency).line()));
        }
      } else if((name.endsWith(".gradle")||name.endsWith(".gradle.kts"))&&text.contains("struts2-core")) return Optional.of(rejection(inventory,file,1));
    } catch(Exception error) {return Optional.of(StrutsSources.diagnostic("框架偵測未完成："+error.getMessage(),StrutsSources.relative(inventory.root(),file),1,"FRAMEWORK_DETECTION_UNRESOLVED"));}
    return Optional.empty();
  }
  private static Diagnostic rejection(ProjectInventory inventory,Path file,int line) {
    return StrutsSources.diagnostic("僅支援 Struts 1.x；偵測到 Struts 2，拒絕分析此專案。",StrutsSources.relative(inventory.root(),file),line,"UNSUPPORTED_FRAMEWORK");
  }
}
