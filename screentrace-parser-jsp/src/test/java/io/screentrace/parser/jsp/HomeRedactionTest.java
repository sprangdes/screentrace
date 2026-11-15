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

  @Test
  void theWholeGraphIsRedactedWhetherOrNotOnlyTheApplicationMentionsTheHome() throws Exception {
    // R75: the home is looked for before converting the whole graph.
    String previous = System.getProperty("user.home");
    Path home = Files.createDirectory(temp.resolve("someone")).toRealPath();
    System.setProperty("user.home", home.toString());
    try {
      String project = home.resolve("work").resolve("shop").toString();
      var source = new io.screentrace.core.ApplicationGraph.SourceLocation("web/a.jsp", 1);
      java.util.function.Function<String, io.screentrace.core.ApplicationGraph> graph =
          value ->
              new io.screentrace.core.ApplicationGraph(
                  new io.screentrace.core.ApplicationGraph.Application(
                      "shop", project, java.util.List.of(), null, null, null),
                  java.util.List.of(
                      new io.screentrace.core.ApplicationGraph.GraphNode(
                          "screen:a",
                          io.screentrace.core.ApplicationGraph.NodeType.SCREEN,
                          "A",
                          java.util.Map.of("note", value),
                          source,
                          io.screentrace.core.ApplicationGraph.Confidence.CONFIRMED)),
                  java.util.List.of(),
                  java.util.List.of(),
                  java.util.List.of(),
                  io.screentrace.core.ApplicationGraph.BEHAVIOR_SCHEMA_VERSION,
                  java.util.List.of(),
                  java.util.List.of());
      var plain = UrlGraphContribution.hidePrivateLocations(graph.apply("relative/path"));
      assertEquals(
          "[home]" + project.substring(home.toString().length()), plain.application().path());
      assertEquals("relative/path", plain.nodes().get(0).attributes().get("note"));
      var mentioned = UrlGraphContribution.hidePrivateLocations(graph.apply(project + "/x"));
      assertEquals(
          "[home]" + project.substring(home.toString().length()) + "/x",
          mentioned.nodes().get(0).attributes().get("note"));
    } finally {
      System.setProperty("user.home", previous);
    }
  }
}
