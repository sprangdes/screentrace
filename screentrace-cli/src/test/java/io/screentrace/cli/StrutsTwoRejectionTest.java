package io.screentrace.cli;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.scanner.ProjectScanner;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.lang.reflect.InvocationTargetException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class StrutsTwoRejectionTest {
  @TempDir Path root;
  private void strutsTwoProject(Path project) throws IOException {
    Files.writeString(project.resolve("pom.xml"),"<project><dependencies><dependency><artifactId>spring-boot</artifactId></dependency><dependency><artifactId>struts2-core</artifactId></dependency></dependencies></project>");
  }
  @Test void refusesSpringFallbackBeforeAnyPartialGraphIsGenerated() throws Exception {
    strutsTwoProject(root);
    var method=ScreenTraceCli.class.getDeclaredMethod("analyze",ProjectScanner.ProjectInventory.class);method.setAccessible(true);
    var failure=assertThrows(InvocationTargetException.class,()->method.invoke(null,new ProjectScanner().scan(root)));
    assertInstanceOf(IOException.class,failure.getCause());assertTrue(failure.getCause().getMessage().contains("UNSUPPORTED_FRAMEWORK"));
  }
  @Test void cliPrintsTheRejectionAsOneMessageAndExitsTwo() throws Exception {
    Path project=Files.createDirectories(root.resolve("projects/legacy")),screenTrace=Files.createDirectory(root.resolve("screentrace"));
    strutsTwoProject(project);
    String home=System.getProperty("user.home"),previous=System.getProperty("screentrace.home");
    System.setProperty("user.home",Files.createDirectory(root.resolve("home")).toString());System.setProperty("screentrace.home",screenTrace.toString());
    try{
      var bytes=new ByteArrayOutputStream();
      assertEquals(2,ScreenTraceCli.runReportingRefusals(new String[]{"analyze",project.toString()},new PrintStream(bytes,true,StandardCharsets.UTF_8)));
      String error=bytes.toString(StandardCharsets.UTF_8);
      assertTrue(error.startsWith("UNSUPPORTED_FRAMEWORK: "),error);
      assertFalse(error.contains("Exception")||error.contains("\tat "),error);
      assertFalse(Files.exists(screenTrace.resolve("analyze/legacy/application-graph.json")));
    }finally{
      System.setProperty("user.home",home);
      if(previous==null)System.clearProperty("screentrace.home");else System.setProperty("screentrace.home",previous);
    }
  }
}
