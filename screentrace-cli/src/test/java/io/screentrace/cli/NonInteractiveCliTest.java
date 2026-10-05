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

  @Test void completeSettingsAllowAnalyzeToRunWithClosedInput() throws Exception {
    Result result = run("analyze", false, true);
    assertEquals(0, result.exitCode(), result.output());
    assertTrue(result.output().contains("分析完成"), result.output());
    assertFalse(result.output().contains("Exception"), result.output());
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
