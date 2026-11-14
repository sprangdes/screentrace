package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** RV-401: context-absolute includes and tagdirs resolve under the page's own web root. */
class WebRootResolutionTest {
  @TempDir Path root;

  private Path file(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
    return target;
  }

  @Test
  void webContentIncludesAndTagFilesResolve() throws Exception {
    List<Path> files =
        List.of(
            file(
                "WebContent/index.jsp",
                "<%@ taglib prefix='t' tagdir='/WEB-INF/tags' %>\n"
                    + "<jsp:include page='/WEB-INF/jsp/header.jsp'/>\n"
                    + "<t:menu/>"),
            file("WebContent/WEB-INF/jsp/header.jsp", "<a href='/home'>Home</a>"),
            file("WebContent/WEB-INF/tags/menu.tag", "<a href='/orders'>Orders</a>"),
            // A same-named file under a different root must not be picked.
            file("src/main/webapp/WEB-INF/jsp/header.jsp", "<a href='/wrong'>Wrong</a>"));
    var analysis =
        new JspProjectParser()
            .analyze(
                root.toRealPath(),
                files.stream()
                    .map(
                        p -> {
                          try {
                            return p.toRealPath();
                          } catch (Exception e) {
                            throw new IllegalStateException(e);
                          }
                        })
                    .toList());
    var labels =
        analysis.interactions().stream()
            .filter(i -> i.viewPath().equals("WebContent/index.jsp"))
            .map(JspAnalysis.Interaction::label)
            .toList();
    assertTrue(labels.contains("Home"), labels + " " + analysis.diagnostics());
    assertTrue(labels.contains("Orders"), labels + " " + analysis.diagnostics());
    assertFalse(labels.contains("Wrong"), labels.toString());
  }
}
