package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Recorded source paths are real paths; user.home may be a link or a Windows 8.3 short name. */
class HomeRedactionTest {
  @TempDir Path temp;

  @Test
  void theRealPathOfAnAliasedHomeIsRedactedToo() throws Exception {
    Path real = Files.createDirectory(temp.resolve("real-home")).toRealPath();
    Path alias = Files.createSymbolicLink(temp.resolve("home-link"), real);
    String previous = System.getProperty("user.home");
    System.setProperty("user.home", alias.toString());
    try {
      String recorded = real.resolve("projects").resolve("demo").toString();
      assertEquals(
          "[home]" + recorded.substring(real.toString().length()),
          UrlGraphContribution.hidePrivateLocation(recorded));
      assertEquals(
          "[home]/projects/demo",
          UrlGraphContribution.hidePrivateLocation(
              real.toString().replace('\\', '/') + "/projects/demo"));
      assertEquals(
          "[home]" + "/x", UrlGraphContribution.hidePrivateLocation(alias.toString() + "/x"));
    } finally {
      System.setProperty("user.home", previous);
    }
  }

  @Test
  void onlyWholePathPrefixesAreRedacted() {
    // RV-412
    var homes = java.util.List.of("/root");
    assertEquals("[home]/x", UrlGraphContribution.redactHome("/root/x", homes));
    assertEquals("[home]", UrlGraphContribution.redactHome("/root", homes));
    assertEquals(
        "/rootCategory/list", UrlGraphContribution.redactHome("/rootCategory/list", homes));
    assertEquals("C:[home]\\a", UrlGraphContribution.redactHome("C:/root\\a", homes));
  }
}
