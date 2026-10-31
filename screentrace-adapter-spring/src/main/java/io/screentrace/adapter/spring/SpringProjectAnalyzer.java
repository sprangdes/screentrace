package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.io.IOException;

/** Selects the Spring analyzer from deterministic project technology signals. */
public final class SpringProjectAnalyzer {
    public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
        if (inventory.technologies().contains("Spring MVC") || inventory.technologies().contains("JSP") || serverTemplates(inventory)) {
            return new SpringMvcAnalyzer().analyze(inventory);
        }
        return new SpringBootAnalyzer().analyze(inventory);
    }

    /** Server templates select the MVC pipeline; both pipelines add React screens, so a mixed project keeps them. */
    private static boolean serverTemplates(ProjectInventory inventory) {
        return inventory.files().stream().anyMatch(p->inventory.root().relativize(p).toString().replace('\\','/').startsWith("src/main/resources/templates/")&&p.toString().endsWith(".html"));
    }
}
