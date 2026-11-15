package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** RV-007: a file that cannot be parsed only blocks analysis when it may hold a Struts 2 signal. */
class StrutsFrameworkDetectorTest {
  @TempDir Path root;

  private Path file(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
    return target;
  }

  @Test
  void malformedXmlWithoutStrutsTwoDoesNotBlockAnalysis() throws Exception {
    file("pom.xml", "<project><dependencies><dependency><artifactId>spring-core");
    file("legacy/module/pom.xml", "<project><unclosed");
    assertTrue(StrutsFrameworkDetector.unsupported(new ProjectScanner().scan(root)).isEmpty());
  }

  @Test
  void malformedPomThatMentionsStrutsTwoStillStopsDetection() throws Exception {
    file("pom.xml", "<project><dependencies><dependency><artifactId>struts2-core");
    assertEquals(
        "FRAMEWORK_DETECTION_UNRESOLVED",
        StrutsFrameworkDetector.unsupported(new ProjectScanner().scan(root)).orElseThrow().code());
  }

  @Test
  void byteScanFindsTheMarkerAcrossReadBoundariesAndInAnyCase() throws Exception {
    String padding = "x".repeat(64 * 1024 - 3);
    assertTrue(
        StrutsFrameworkDetector.mayMentionStrutsTwo(root, file("a.txt", padding + "STRUTS2")));
    assertTrue(StrutsFrameworkDetector.mayMentionStrutsTwo(root, file("b.txt", "strutstruts2")));
    assertFalse(
        StrutsFrameworkDetector.mayMentionStrutsTwo(root, file("c.txt", padding + "struts 2")));
    assertTrue(StrutsFrameworkDetector.mayMentionStrutsTwo(root, root.resolve("missing.txt")));
  }

  @Test
  void onlyStrutsOneArtifactsAndJarsAreVersionEvidence() throws Exception {
    // RV-311: struts-menu and spring-webmvc-struts used to add conflicting "Struts versions".
    file(
        "pom.xml",
        "<project><dependencies>"
            + "<dependency><groupId>org.apache.struts</groupId><artifactId>struts-core</artifactId><version>1.3.10</version></dependency>"
            + "<dependency><groupId>struts-menu</groupId><artifactId>struts-menu</artifactId><version>2.4.3</version></dependency>"
            + "</dependencies></project>");
    file("WebContent/WEB-INF/lib/spring-webmvc-struts-2.5.6.jar", "jar");
    file("WebContent/WEB-INF/lib/struts-taglib-1.3.10.jar", "jar");
    var evidence = StrutsConfigParser.detectStrutsVersion(new ProjectScanner().scan(root));
    assertEquals("1.3.10", evidence.version(), evidence.description());
    assertTrue(evidence.isVersion13());
  }
}
