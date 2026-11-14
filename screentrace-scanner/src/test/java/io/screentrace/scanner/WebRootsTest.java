package io.screentrace.scanner;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** RV-317 / RV-401: context-absolute paths resolve under the web root of the referring file. */
class WebRootsTest {
  private static final List<String> DEFAULTS =
      List.of("src/main/webapp/", "WebContent/", "WebRoot/", "webapp/", "web/");

  @TempDir Path root;

  @Test
  void webRootIsTakenFromTheReferringFileIncludingModuleFolders() {
    assertEquals("WebContent/", WebRoots.rootOf(DEFAULTS, "WebContent/WEB-INF/jsp/a.jsp"));
    assertEquals(
        "app/src/main/webapp/", WebRoots.rootOf(DEFAULTS, "app/src/main/webapp/index.jsp"));
    assertEquals("src/main/webapp/", WebRoots.rootOf(DEFAULTS, "src/main/webapp/web/x.jsp"));
    assertNull(WebRoots.rootOf(DEFAULTS, "src/main/java/A.java"));
    assertNull(WebRoots.rootOf(DEFAULTS, "mywebapp/a.jsp"));
    assertNull(WebRoots.rootOf(DEFAULTS, "src/main/resources/web/a.jsp"));
    assertNull(WebRoots.rootOf(DEFAULTS, "docs/webapp/a.jsp"));
    assertEquals(
        List.of("WebRoot/WEB-INF/tags/a.tag", "WEB-INF/tags/a.tag"),
        WebRoots.candidates(DEFAULTS, "WebRoot/page.jsp", "/WEB-INF/tags/a.tag"));
    assertEquals(
        List.of(
            "src/main/webapp/x.jsp",
            "WebContent/x.jsp",
            "WebRoot/x.jsp",
            "webapp/x.jsp",
            "web/x.jsp",
            "x.jsp"),
        WebRoots.candidates(DEFAULTS, "tiles-defs.xml", "/x.jsp"));
  }

  @Test
  void configuredWebRootReplacesTheDefaults() throws Exception {
    Path project = root.toRealPath();
    Files.createDirectories(project.resolve("nbproject"));
    Files.createDirectories(project.resolve("site"));
    Files.writeString(project.resolve("nbproject/project.properties"), "web.docbase.dir=site\n");
    assertEquals(List.of("site/"), WebRoots.of(project));
    assertEquals(DEFAULTS, WebRoots.of(Files.createDirectories(root.resolve("other"))));
  }
}
