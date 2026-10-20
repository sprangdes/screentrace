package io.screentrace.adapter.spring;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.scanner.ProjectScanner.ProjectInventory;
import java.io.IOException;

/** Selects the Spring analyzer from deterministic project technology signals. */
public final class SpringProjectAnalyzer {
    public ApplicationGraph analyze(ProjectInventory inventory) throws IOException {
        if (inventory.technologies().contains("Spring MVC") || inventory.technologies().contains("JSP") || thymeleafOnly(inventory)) {
            return new SpringMvcAnalyzer().analyze(inventory);
        }
        return new SpringBootAnalyzer().analyze(inventory);
    }

    /** Server templates select the MVC pipeline only when no React screens would be lost;
     * React screens are contributed by the Boot pipeline alone. */
    private static boolean thymeleafOnly(ProjectInventory inventory) {
        return !inventory.technologies().contains("React")
            && inventory.files().stream().anyMatch(p->inventory.root().relativize(p).toString().replace('\\','/').startsWith("src/main/resources/templates/")&&p.toString().endsWith(".html"));
    }
}
