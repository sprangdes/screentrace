package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R96 (ADR 0171): a Struts + Spring project's schedules are found like a Spring project's. */
class R96StrutsBackgroundJobsTest {
  @TempDir Path root;

  @Test
  void strutsPipelineListsSpringSchedules() throws Exception {
    Files.writeString(
        root.resolve("struts-config.xml"),
        "<struts-config><action-mappings><action path='/home' type='HomeAction'><forward name='success' path='/home.jsp'/></action></action-mappings></struts-config>");
    Files.writeString(
        root.resolve("HomeAction.java"),
        "class HomeAction extends Action{public ActionForward execute(ActionMapping m,ActionForm f,HttpServletRequest req,HttpServletResponse res){return m.findForward(\"success\");}}");
    Files.writeString(root.resolve("home.jsp"), "Home");
    Files.writeString(
        root.resolve("applicationContext.xml"),
        "<beans xmlns='http://www.springframework.org/schema/beans' xmlns:task='http://www.springframework.org/schema/task'><bean id='nightly' class='NightlyJob'/><task:scheduled-tasks><task:scheduled ref='nightly' method='run' cron='0 30 1 * * *'/></task:scheduled-tasks></beans>");
    Files.writeString(
        root.resolve("NightlyJob.java"), "public class NightlyJob { public void run() {} }");
    var graph = new StrutsProjectAnalyzer().analyze(new ProjectScanner().scan(root));
    var job =
        graph.nodes().stream()
            .filter(
                n ->
                    n.type() == NodeType.HANDLER
                        && "SCHEDULE".equals(n.attributes().get("trigger")))
            .findFirst()
            .orElseThrow();
    assertEquals("NightlyJob.run()", job.name());
    assertEquals("每天 01:30", job.attributes().get("triggerText"));
  }
}
