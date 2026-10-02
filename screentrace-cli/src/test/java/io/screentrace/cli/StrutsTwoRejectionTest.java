package io.screentrace.cli;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.scanner.ProjectScanner;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class StrutsTwoRejectionTest {
  @TempDir Path root;
  @Test void refusesSpringFallbackBeforeAnyPartialGraphIsGenerated() throws Exception {
    Files.writeString(root.resolve("pom.xml"),"<project><dependencies><dependency><artifactId>spring-boot</artifactId></dependency><dependency><artifactId>struts2-core</artifactId></dependency></dependencies></project>");
    var method=ScreenTraceCli.class.getDeclaredMethod("analyze",ProjectScanner.ProjectInventory.class);method.setAccessible(true);
    var failure=assertThrows(InvocationTargetException.class,()->method.invoke(null,new ProjectScanner().scan(root)));
    assertInstanceOf(IOException.class,failure.getCause());assertTrue(failure.getCause().getMessage().contains("UNSUPPORTED_FRAMEWORK"));
  }
}
