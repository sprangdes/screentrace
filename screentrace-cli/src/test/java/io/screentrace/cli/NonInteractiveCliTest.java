package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class NonInteractiveCliTest {
  private static final String SETUP_MESSAGE = "尚未設定專案根目錄與輸出根目錄。請先在終端機執行 `./bin/screentrace config`";

  @Test void missingSettingsFailsClearlyForClosedAndOpenInputWithoutWaiting() throws Exception {
    for (String command : new String[] {"analyze", "report"}) {
      Result closed = run(command, false, false);
      assertFriendlyFailure(closed, command + " with closed stdin");
      Result open = run(command, true, false);
      assertFriendlyFailure(open, command + " with open stdin");
    }
  }

  @Test void configWithoutAnInteractiveTerminalNamesTheConfigRequirement() throws Exception {
    Result result = run("config", false, false);
    assertEquals(2, result.exitCode(), result.output());
    assertTrue(result.output().contains("config 需要互動式終端機"), result.output());
    assertFalse(result.output().contains("尚未設定專案根目錄"), result.output());
    assertFalse(result.output().contains("Exception"), result.output());
  }

  @Test void completeSettingsAllowAnalyzeToRunWithClosedInput() throws Exception {
    Result result = run("analyze", false, true);
    assertEquals(0, result.exitCode(), result.output());
    assertTrue(result.output().contains("分析完成"), result.output());
    assertFalse(result.output().contains("Exception"), result.output());
  }

  @Test void actualAnalyzeAndReportAcceptCaseAndSymlinkWorkspaceRootsWithIdenticalHtml() throws Exception {
    Path workspace=Files.createTempDirectory("screentrace-path-cli-");
    Path projects=Files.createDirectory(workspace.resolve("CaseProjects"));
    Path output=Files.createDirectory(workspace.resolve("CaseOutput"));
    Path source=Path.of("").toAbsolutePath();while(source!=null&&!(Files.isRegularFile(source.resolve("pom.xml"))&&Files.isDirectory(source.resolve("screentrace-core"))))source=source.getParent();
    assertNotNull(source,"repository source root");
    Path fixture=source.resolve("fixtures/wp10/spring-mvc-jsp"),project=projects.resolve("spring-mvc-jsp");
    try(var files=Files.walk(fixture)){for(Path file:files.toList()){Path copy=project.resolve(fixture.relativize(file));if(Files.isDirectory(file))Files.createDirectories(copy);else Files.copy(file,copy);}}

    byte[] standard=analyzeAndReport(workspace.resolve("home-standard"),projects,output,"spring-mvc-jsp");
    Path caseProjects=workspace.resolve("caseprojects"),caseOutput=workspace.resolve("caseoutput");
    boolean caseInsensitive;try{caseInsensitive=Files.isSameFile(projects,caseProjects)&&Files.isSameFile(output,caseOutput);}catch(java.nio.file.NoSuchFileException unavailable){caseInsensitive=false;}
    if(caseInsensitive)assertArrayEquals(standard,analyzeAndReport(workspace.resolve("home-case"),caseProjects,caseOutput,"spring-mvc-jsp"),"case aliases");

    Path projectLink=workspace.resolve("project-link"),outputLink=workspace.resolve("output-link");
    Files.createSymbolicLink(projectLink,projects);Files.createSymbolicLink(outputLink,output);
    assertArrayEquals(standard,analyzeAndReport(workspace.resolve("home-link"),projectLink,outputLink,"spring-mvc-jsp"),"root symlinks");
    String html=new String(standard,java.nio.charset.StandardCharsets.UTF_8);
    assertFalse(html.contains(workspace.toString()));
  }

  @Test void actualReportRejectsOutsidePreviewResourceWithChineseMessageAndNonzeroExit() throws Exception {
    Path workspace=Files.createTempDirectory("screentrace-path-reject-");
    Path projects=Files.createDirectory(workspace.resolve("projects")),output=Files.createDirectory(workspace.resolve("output"));
    Path source=Path.of("").toAbsolutePath();while(source!=null&&!(Files.isRegularFile(source.resolve("pom.xml"))&&Files.isDirectory(source.resolve("screentrace-core"))))source=source.getParent();
    assertNotNull(source,"repository source root");Path fixture=source.resolve("fixtures/wp10/spring-mvc-jsp"),project=projects.resolve("spring-mvc-jsp");
    try(var files=Files.walk(fixture)){for(Path file:files.toList()){Path copy=project.resolve(fixture.relativize(file));if(Files.isDirectory(file))Files.createDirectories(copy);else Files.copy(file,copy);}}
    Path home=workspace.resolve("home");Files.createDirectories(home.resolve(".screentrace"));
    Files.writeString(home.resolve(".screentrace/config.json"),new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(java.util.Map.of("projectRoot",projects.toString(),"outputRoot",output.toString())));
    Result analyzed=run(home,"analyze","spring-mvc-jsp");assertEquals(0,analyzed.exitCode(),analyzed.output());
    Path analysis=output.resolve("spring-mvc-jsp"),capture=analysis.resolve("static-preview/element-styles.json");
    var mapper=new com.fasterxml.jackson.databind.ObjectMapper();var data=(com.fasterxml.jackson.databind.node.ObjectNode)mapper.readTree(capture.toFile());
    var styles=(com.fasterxml.jackson.databind.node.ObjectNode)data.path("styles");
    styles.elements().forEachRemaining(style->((com.fasterxml.jackson.databind.node.ObjectNode)style).put("background-image","url(\"file:///Users/private/secret.svg\")"));
    mapper.writeValue(capture.toFile(),data);Path priorReport=analysis.resolve("report/screentrace-report.html");byte[] priorBytes=Files.readAllBytes(priorReport);
    Result rejected=run(home,"report","spring-mvc-jsp");
    assertEquals(2,rejected.exitCode(),rejected.output());
    assertTrue(rejected.output().contains("預覽資源位於分析輸出目錄之外，已拒絕"),rejected.output());
    assertTrue(rejected.output().contains("輸出外資源/secret.svg"),rejected.output());
    assertTrue(rejected.output().contains("根目錄類型：分析輸出目錄"),rejected.output());
    assertFalse(rejected.output().contains("/Users/private"),rejected.output());
    assertFalse(rejected.output().contains("Exception"),rejected.output());
    assertArrayEquals(priorBytes,Files.readAllBytes(priorReport));
  }

  private static byte[] analyzeAndReport(Path home,Path projectRoot,Path outputRoot,String project) throws Exception {
    Files.createDirectories(home.resolve(".screentrace"));
    var mapper=new com.fasterxml.jackson.databind.ObjectMapper();
    Files.writeString(home.resolve(".screentrace/config.json"),mapper.writeValueAsString(java.util.Map.of("projectRoot",projectRoot.toString(),"outputRoot",outputRoot.toString())));
    Result analyzed=run(home,"analyze",project);
    assertEquals(0,analyzed.exitCode(),analyzed.output());assertTrue(analyzed.output().contains("分析完成"),analyzed.output());
    Result reported=run(home,"report",project);
    assertEquals(0,reported.exitCode(),reported.output());assertFalse(reported.output().contains("Exception"),reported.output());
    return Files.readAllBytes(outputRoot.resolve(project+"/report/screentrace-report.html"));
  }

  private static Result run(Path home,String command,String project) throws Exception {
    String classpath=System.getProperty("surefire.test.class.path",System.getProperty("java.class.path"));
    var args=new java.util.ArrayList<String>();args.add(Path.of(System.getProperty("java.home"),"bin","java").toString());
    args.add("-Duser.home="+home);args.add("-Djava.awt.headless=true");args.add("-cp");args.add(classpath);args.add(ScreenTraceCli.class.getName());args.add(command);args.add(project);
    Process process=new ProcessBuilder(args).redirectErrorStream(true).redirectInput(new File("/dev/null")).start();
    var output=CompletableFuture.supplyAsync(()->{try{return new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);}catch(java.io.IOException error){throw new java.io.UncheckedIOException(error);}});
    assertTrue(process.waitFor(Duration.ofSeconds(10).toMillis(),TimeUnit.MILLISECONDS),command+" timed out");
    return new Result(process.exitValue(),output.get(2,TimeUnit.SECONDS));
  }

  private static void assertFriendlyFailure(Result result, String context) {
    assertTrue(result.exitCode() != 0, context + " should return nonzero");
    assertTrue(result.output().contains(SETUP_MESSAGE), context + " should explain configuration: " + result.output());
    assertFalse(result.output().contains("Exception"), context + " must not print a stack trace: " + result.output());
  }

  private static Result run(String command, boolean leaveInputOpen, boolean configured) throws Exception {
    Path home = Files.createTempDirectory("screentrace-cli-home-");
    Path projectRoot = Files.createDirectory(home.resolve("projects"));
    Path outputRoot = Files.createDirectory(home.resolve("output"));
    if (configured) {
      Path project = Files.createDirectory(projectRoot.resolve("demo"));
      Files.writeString(project.resolve("pom.xml"), "<project><dependencies><dependency><artifactId>spring-webmvc</artifactId></dependency></dependencies></project>");
      Files.createDirectories(home.resolve(".screentrace"));
      Files.writeString(home.resolve(".screentrace/config.json"), "{\"projectRoot\":\"" + json(projectRoot.toString()) + "\",\"outputRoot\":\"" + json(outputRoot.toString()) + "\"}");
    }
    String classpath = System.getProperty("surefire.test.class.path", System.getProperty("java.class.path"));
    var args = new java.util.ArrayList<String>();
    args.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
    args.add("-Duser.home=" + home);
    args.add("-Djava.awt.headless=true");
    args.add("-cp");args.add(classpath);args.add(ScreenTraceCli.class.getName());args.add(command);
    if (configured) args.add("demo");
    ProcessBuilder builder = new ProcessBuilder(args).redirectErrorStream(true);
    if (!leaveInputOpen) builder.redirectInput(new File("/dev/null"));
    Process process = builder.start();
    if (!leaveInputOpen) process.getOutputStream().close();
    var output = CompletableFuture.supplyAsync(() -> {
      try { return new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8); }
      catch (java.io.IOException error) { throw new java.io.UncheckedIOException(error); }
    });
    boolean exited = process.waitFor(Duration.ofSeconds(5).toMillis(), TimeUnit.MILLISECONDS);
    if (!exited) { process.destroyForcibly(); process.waitFor(2, TimeUnit.SECONDS); }
    assertTrue(exited, command + " hung while stdin remained open");
    return new Result(process.exitValue(), output.get(2, TimeUnit.SECONDS));
  }

  private static String json(String value) { return value.replace("\\", "\\\\").replace("\"", "\\\""); }
  private record Result(int exitCode, String output) { }
}
