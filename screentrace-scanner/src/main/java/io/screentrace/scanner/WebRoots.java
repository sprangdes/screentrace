package io.screentrace.scanner;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Web roots of a project (src/main/webapp, WebContent, WebRoot, webapp, web, or the folder set in
 * nbproject/project.properties); src/main/webapp is also recognised inside a module folder. A
 * context-absolute path such as {@code /WEB-INF/jsp/header.jsp} written in a file under one web
 * root names a file under that same root, so the web root is taken from the file that holds the
 * reference (RV-317, RV-401).
 */
public final class WebRoots {
  private WebRoots() {}

  /** Conventional web roots, used when nbproject/project.properties names none. */
  public static final List<String> DEFAULTS =
      List.of("src/main/webapp/", "WebContent/", "WebRoot/", "webapp/", "web/");

  /** Web-root prefixes for the project at {@code root}, each ending in '/'. */
  public static List<String> of(Path root) {
    return ProjectScanner.webRoots(root);
  }

  /**
   * The web root holding {@code relativeFile} (project-relative, '/'-separated), including the
   * module folder before a nested src/main/webapp, or null when the file is under none.
   */
  public static String rootOf(List<String> roots, String relativeFile) {
    if (relativeFile == null) return null;
    String file = relativeFile.replace('\\', '/');
    for (String root : roots) if (file.startsWith(root)) return root;
    // Inside a module folder only the Maven layout is a web root; a folder that is merely named
    // "web" or "webapp" deeper in the tree (resources, docs) is not.
    for (String root : roots) {
      if (!root.startsWith("src/main/")) continue;
      int index = file.indexOf("/" + root);
      if (index >= 0) return file.substring(0, index + 1) + root;
    }
    return null;
  }

  /**
   * Project-relative candidates for a context-absolute {@code target} referenced from {@code
   * relativeFile}, in the order to try. A file under a web root resolves within that root, then the
   * project root; otherwise each web root, then the project root, is tried.
   */
  public static List<String> candidates(List<String> roots, String relativeFile, String target) {
    String path = target.startsWith("/") ? target.substring(1) : target;
    String own = rootOf(roots, relativeFile);
    // The project root stays the last resort, as before; other web roots are never tried.
    if (own != null) return List.of(own + path, path);
    List<String> result = new ArrayList<>();
    for (String root : roots) result.add(root + path);
    result.add(path);
    return result;
  }
}
