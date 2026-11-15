package io.screentrace.scanner;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** RV-113: only real build output folders are skipped, not source folders with the same name. */
class BuildOutputSkipTest {
  @TempDir Path root;

  private void file(String path) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, "x");
  }

  @Test
  void buildAndTargetAreSkippedOnlyBesideABuildFileOrAtTheRoot() throws Exception {
    file("pom.xml");
    file("target/classes/A.class");
    file("build/out.html");
    file("module/pom.xml");
    file("module/target/gen.java");
    file("src/main/java/com/acme/build/BuildAction.java");
    file("src/main/webapp/target/page.jsp");
    file("node_modules/x/index.js");
    file("src/main/webapp/node_modules/y.js");
    Path real = root.toRealPath();
    var files =
        new ProjectScanner()
            .scan(root).files().stream()
                .map(p -> real.relativize(p).toString().replace('\\', '/'))
                .toList();
    assertTrue(files.contains("src/main/java/com/acme/build/BuildAction.java"), files.toString());
    assertTrue(files.contains("src/main/webapp/target/page.jsp"), files.toString());
    assertFalse(files.stream().anyMatch(f -> f.startsWith("target/") || f.startsWith("build/")));
    assertFalse(files.contains("module/target/gen.java"));
    assertFalse(files.stream().anyMatch(f -> f.contains("node_modules/")));
  }
}
