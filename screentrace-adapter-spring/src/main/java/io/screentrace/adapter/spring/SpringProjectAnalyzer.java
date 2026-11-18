package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.parser.jsp.BackendCallChains;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.io.IOException;

/** Selects the Spring analyzer from deterministic project technology signals. */
public final class SpringProjectAnalyzer {
  public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
    if (inventory.technologies().contains("Spring MVC")
        || inventory.technologies().contains("JSP")
        || serverTemplates(inventory)) {
      return BackendCallChains.enrich(
          SpringBackgroundJobs.enrich(new SpringMvcAnalyzer().analyze(inventory), inventory),
          inventory);
    }
    return BackendCallChains.enrich(
        SpringBackgroundJobs.enrich(new SpringBootAnalyzer().analyze(inventory), inventory),
        inventory);
  }

  /**
   * Server templates select the MVC pipeline; both pipelines add React screens, so a mixed project
   * keeps them.
   */
  private static boolean serverTemplates(ProjectInventory inventory) {
    return inventory.files().stream()
        .anyMatch(
            p ->
                SpringMvcAnalyzer.templateRoot(
                            inventory.root().relativize(p).toString().replace('\\', '/'))
                        != null
                    && p.toString().endsWith(".html"));
  }
}
