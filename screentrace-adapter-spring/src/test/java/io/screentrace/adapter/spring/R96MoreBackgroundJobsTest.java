package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.core.GraphIntegrityValidator;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R96 (ADR 0171): XML schedules, scheduler calls, Quartz jobs and @Async methods. */
class R96MoreBackgroundJobsTest {
  @TempDir Path root;

  void write(String path, String text) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.writeString(target, text);
  }

  ApplicationGraph analyze() throws Exception {
    write(
        "pom.xml",
        "<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>");
    return new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  static GraphNode job(ApplicationGraph graph, String name) {
    return graph.nodes().stream()
        .filter(n -> n.type() == NodeType.HANDLER && n.name().equals(name))
        .findFirst()
        .orElseThrow(() -> new AssertionError("no job " + name));
  }

  @Test
  void xmlSchedulerCallsQuartzAndAsync() throws Exception {
    write(
        "src/main/resources/applicationContext.xml",
        """
        <beans xmlns="http://www.springframework.org/schema/beans" xmlns:task="http://www.springframework.org/schema/task">
          <bean id="cleaner" class="demo.Cleaner"/>
          <task:scheduled-tasks>
            <task:scheduled ref="cleaner" method="purge" cron="0 0 2 * * *"/>
            <task:scheduled ref="reporter" method="send" fixed-delay="60000"/>
          </task:scheduled-tasks>
        </beans>
        """);
    write(
        "src/main/java/demo/Cleaner.java",
        "package demo; public class Cleaner { public void purge() {} }");
    write(
        "src/main/java/demo/Reporter.java",
        "package demo; @Component public class Reporter { public void send() {} }");
    write(
        "src/main/java/demo/Setup.java",
        """
        package demo;
        @Configuration @EnableAsync public class Setup {
          private final TaskScheduler scheduler; private final Mailer mailer;
          private final ScheduledExecutorService pool;
          void start() {
            scheduler.schedule(this::tick, new CronTrigger("0 */10 * * * *"));
            scheduler.scheduleAtFixedRate(() -> mailer.flush(), Duration.ofMinutes(3));
            pool.scheduleWithFixedDelay(mailer::retry, 0, 30, TimeUnit.SECONDS);
          }
          void tick() {}
          Object quartz() {
            JobDetail d = JobBuilder.newJob(ExportJob.class).build();
            Trigger t = TriggerBuilder.newTrigger().withSchedule(CronScheduleBuilder.cronSchedule("0 0 6 * * ?")).build();
            return t;
          }
        }
        """);
    write(
        "src/main/java/demo/Mailer.java",
        "package demo; @Service public class Mailer { public void flush() {} public void retry() {} @Async public void sendLater() {} }");
    write(
        "src/main/java/demo/ExportJob.java",
        "package demo; public class ExportJob extends QuartzJobBean { protected void executeInternal(JobExecutionContext c) {} }");
    write(
        "src/main/java/demo/AuditJob.java",
        "package demo; public class AuditJob implements Job { public void execute(JobExecutionContext c) {} }");
    var graph = analyze();
    assertEquals("每天 02:00", job(graph, "Cleaner.purge()").attributes().get("triggerText"));
    assertTrue(
        job(graph, "Cleaner.purge()")
            .attributes()
            .get("triggerNote")
            .contains("applicationContext.xml"));
    assertEquals(
        "上一次執行完成後隔 1 分鐘再執行", job(graph, "Reporter.send()").attributes().get("triggerText"));
    assertEquals("每 10 分鐘", job(graph, "Setup.tick()").attributes().get("triggerText"));
    assertEquals("每 3 分鐘執行一次", job(graph, "Mailer.flush()").attributes().get("triggerText"));
    assertEquals("上一次執行完成後隔 30 秒再執行", job(graph, "Mailer.retry()").attributes().get("triggerText"));
    assertEquals(
        "每天 06:00", job(graph, "ExportJob.executeInternal()").attributes().get("triggerText"));
    var audit = job(graph, "AuditJob.execute()");
    assertEquals("依 Quartz 觸發設定執行（時間無法確定）", audit.attributes().get("triggerText"));
    assertEquals(Confidence.UNRESOLVED, audit.confidence());
    var async = job(graph, "Mailer.sendLater()");
    assertEquals("ASYNC", async.attributes().get("trigger"));
    assertEquals(Confidence.CONFIRMED, async.confidence());
    GraphIntegrityValidator.validate(graph);
  }

  @Test
  void asyncWithoutEnableAsyncIsOnlyInferred() throws Exception {
    write(
        "src/main/java/demo/Mailer.java",
        "package demo; @Service public class Mailer { @Async public void later() {} }");
    var later = job(analyze(), "Mailer.later()");
    assertEquals(Confidence.INFERRED, later.confidence());
    assertTrue(later.attributes().get("triggerNote").contains("@EnableAsync"));
  }
}
