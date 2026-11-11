package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * R34: `node` on PATH may be a version-manager shim (Volta, asdf) that runs the real Node as its
 * child. Stopping an analysis must stop that child too, or a cancelled React preview pass leaves a
 * Node process running.
 *
 * <p>Both scripts write their own PID, so the test looks processes up by PID instead of reading
 * other processes' command lines, and both exit on their own after 60 seconds, so a failed run
 * cannot keep the build waiting on its output.
 */
class NodeProcessTreeTest {
  private static final ObjectMapper JSON = new ObjectMapper();

  @TempDir Path dir;

  @Test
  void interruptingAnAnalysisStopsTheRealNodeBehindAShim() throws Exception {
    assumeTrue(
        processListingPermitted(),
        "this system does not let a process list other processes (OQ-050); PR CI runs this test");
    Path hang = dir.resolve("hang.mjs");
    Path hangPid = dir.resolve("hang.pid");
    Path shimPid = dir.resolve("shim.pid");
    Files.writeString(hang, script(hangPid, "process.stdin.resume();"));
    Path shim = dir.resolve("shim.mjs");
    Files.writeString(
        shim,
        script(
            shimPid,
            "import {spawn} from 'node:child_process';"
                + "spawn(process.execPath,["
                + JSON.writeValueAsString(hang.toString())
                + "],{stdio:'inherit'});"));
    String previous = System.getProperty("screentrace.js.module");
    System.setProperty("screentrace.js.module", shim.toString());
    try {
      Thread worker =
          new Thread(
              () -> {
                try {
                  JavaScriptGraphContribution.run(Map.of("mode", "react"));
                } catch (Exception expected) {
                  // The interrupted analysis fails; only the processes it leaves behind matter
                  // here.
                }
              });
      worker.start();
      assertTrue(
          waitUntil(() -> alive(shimPid) && alive(hangPid), 20_000),
          "the real Node process starts behind the shim");
      worker.interrupt();
      worker.join(10_000);
      assertFalse(worker.isAlive(), "the interrupted analysis returns");
      assertTrue(
          waitUntil(() -> !alive(shimPid) && !alive(hangPid), 5_000),
          "neither the shim nor the real Node process is left running");
    } finally {
      if (previous == null) System.clearProperty("screentrace.js.module");
      else System.setProperty("screentrace.js.module", previous);
      stop(hangPid);
      stop(shimPid);
    }
  }

  /**
   * Stopping the whole tree needs the process list; without it only the direct child can be
   * stopped.
   */
  private static boolean processListingPermitted() {
    try {
      ProcessHandle.current().descendants().count();
      return true;
    } catch (RuntimeException notPermitted) {
      return false;
    }
  }

  /**
   * An ES module that records its PID, runs {@code body}, then stays alive for at most 60 seconds.
   */
  private static String script(Path pidFile, String body) throws Exception {
    return "import {writeFileSync} from 'node:fs';"
        + body
        + "writeFileSync("
        + JSON.writeValueAsString(pidFile.toString())
        + ",String(process.pid));"
        + "setTimeout(()=>process.exit(0),60000);\n";
  }

  private static long pid(Path pidFile) {
    try {
      String text = Files.readString(pidFile).trim();
      return text.isEmpty() ? -1 : Long.parseLong(text);
    } catch (Exception notWrittenYet) {
      return -1;
    }
  }

  private static boolean alive(Path pidFile) {
    long pid = pid(pidFile);
    return pid > 0 && ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false);
  }

  private static void stop(Path pidFile) {
    long pid = pid(pidFile);
    if (pid > 0) ProcessHandle.of(pid).ifPresent(ProcessHandle::destroyForcibly);
  }

  private static boolean waitUntil(BooleanSupplier condition, long millis)
      throws InterruptedException {
    long end = System.currentTimeMillis() + millis;
    while (System.currentTimeMillis() < end) {
      if (condition.getAsBoolean()) return true;
      Thread.sleep(100);
    }
    return condition.getAsBoolean();
  }
}
