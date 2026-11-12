package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * HC-002 / ADR 0141: a caught exception is either handled or explained. An empty catch block in
 * production code must say in a comment why the failure can be ignored and who reports it.
 */
class EmptyCatchGuardTest {
  private static final Pattern EMPTY_CATCH = Pattern.compile("catch\\s*\\([^)]*\\)\\s*\\{\\s*}");

  @Test
  void productionCodeHasNoUnexplainedEmptyCatch() throws IOException {
    Path root = Path.of("..").toAbsolutePath().normalize();
    List<String> found = new ArrayList<>();
    int files = 0;
    try (Stream<Path> modules = Files.list(root)) {
      for (Path module :
          modules
              .filter(p -> p.getFileName().toString().startsWith("screentrace-"))
              .sorted()
              .toList()) {
        Path sources = module.resolve("src/main/java");
        if (!Files.isDirectory(sources)) continue;
        try (Stream<Path> walk = Files.walk(sources)) {
          for (Path file : walk.filter(p -> p.toString().endsWith(".java")).sorted().toList()) {
            files++;
            String text = Files.readString(file);
            var matcher = EMPTY_CATCH.matcher(text);
            while (matcher.find()) {
              int line =
                  (int) text.substring(0, matcher.start()).chars().filter(c -> c == '\n').count()
                      + 1;
              found.add(root.relativize(file) + ":" + line);
            }
          }
        }
      }
    }
    assertTrue(files > 50, "scanned " + files + " files under " + root);
    assertEquals(List.of(), found);
  }
}
