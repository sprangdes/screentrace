package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.io.IOException;

/** Selects the Spring analyzer from deterministic project technology signals. */
public final class SpringProjectAnalyzer {
    public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
        if (inventory.technologies().contains("Spring MVC") || inventory.technologies().contains("JSP")) {
            return new SpringMvcAnalyzer().analyze(inventory);
        }
        return new SpringBootAnalyzer().analyze(inventory);
    }
}
