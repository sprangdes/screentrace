package io.screentrace.adapter.spring;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.core.GraphIntegrityValidator;
import io.screentrace.scanner.ProjectScanner;
import java.nio.file.*;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** R81 (ADR 0159): code that runs without a screen — schedules, event listeners, startup. */
class R81BackgroundJobsTest {
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
    write(
        "src/main/java/demo/App.java",
        "package demo; @SpringBootApplication @EnableScheduling public class App {}");
    return new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root));
  }

  static Optional<GraphNode> job(ApplicationGraph graph, String name) {
    return graph.nodes().stream()
        .filter(n -> n.type() == NodeType.HANDLER && n.name().equals(name))
        .findFirst();
  }

  @Test
  void cronAndFixedSchedulesBecomeHandlersInPlainWords() throws Exception {
    write(
        "src/main/java/demo/Jobs.java",
        """
        package demo;
        @Component public class Jobs {
          @Scheduled(cron = "0 */5 * * * *") public void sweep() {}
          @Scheduled(cron = "0 15 3 * * *", zone = "Asia/Taipei") public void nightly() {}
          @Scheduled(cron = "0 0 9 * * MON-FRI") public void weekdays() {}
          @Scheduled(cron = "0 0 0 1 1 ?") public void yearly() {}
          @Scheduled(fixedDelay = 5 * 60 * 1000, initialDelay = 1000) public void poll() {}
          @Scheduled(fixedRate = 30, timeUnit = TimeUnit.SECONDS) public void beat() {}
          @Scheduled(fixedRateString = "PT2H") public void iso() {}
        }
        """);
    var graph = analyze();
    assertEquals(
        "每 5 分鐘", job(graph, "Jobs.sweep()").orElseThrow().attributes().get("triggerText"));
    assertEquals(
        "每天 03:15（時區 Asia/Taipei）",
        job(graph, "Jobs.nightly()").orElseThrow().attributes().get("triggerText"));
    assertEquals(
        "每週一至五 09:00", job(graph, "Jobs.weekdays()").orElseThrow().attributes().get("triggerText"));
    // A shape the describer does not know stays as written instead of being guessed.
    assertEquals(
        "依排程規則 0 0 0 1 1 ? 執行",
        job(graph, "Jobs.yearly()").orElseThrow().attributes().get("triggerText"));
    assertEquals(
        "上一次執行完成後隔 5 分鐘再執行；啟動後先等 1 秒",
        job(graph, "Jobs.poll()").orElseThrow().attributes().get("triggerText"));
    assertEquals(
        "每 30 秒執行一次", job(graph, "Jobs.beat()").orElseThrow().attributes().get("triggerText"));
    assertEquals(
        "每 2 小時執行一次", job(graph, "Jobs.iso()").orElseThrow().attributes().get("triggerText"));
    var sweep = job(graph, "Jobs.sweep()").orElseThrow();
    assertEquals("SCHEDULE", sweep.attributes().get("trigger"));
    assertEquals("demo.Jobs", sweep.attributes().get("class"));
    assertEquals("sweep", sweep.attributes().get("method"));
    assertEquals(Confidence.CONFIRMED, sweep.confidence());
    assertTrue(
        sweep.evidence().stream()
            .anyMatch(
                e ->
                    e.parser().equals(io.screentrace.parser.jsp.BackgroundJobs.PARSER)
                        && e.source()
                            .equals(new SourceLocation("src/main/java/demo/Jobs.java", 3))));
    GraphIntegrityValidator.validate(graph);
  }

  @Test
  void placeholderUsesTheBaseConfigurationOrTheSourceDefaultAndSaysWhatMayOverrideIt()
      throws Exception {
    write(
        "src/main/java/demo/Jobs.java",
        """
        package demo;
        @Component public class Jobs {
          @Scheduled(cron = "${app.cleanup-cron:0 30 3 * * *}") public void cleanup() {}
          @Scheduled(fixedDelayString = "${app.worker-delay-ms:1000}") public void worker() {}
          @Scheduled(cron = "${app.unknown}") public void unknown() {}
          @Scheduled(cron = CRON) public void constant() {}
        }
        """);
    write("src/main/resources/application.yml", "app:\n  worker-delay-ms: 2000\n");
    write(
        "src/main/resources/application-prod.yml",
        "app:\n  cleanup-cron: ${CLEANUP_CRON:0 0 4 * * *}\n");
    var graph = analyze();
    var cleanup = job(graph, "Jobs.cleanup()").orElseThrow();
    assertEquals("每天 03:30", cleanup.attributes().get("triggerText"));
    assertEquals("app.cleanup-cron", cleanup.attributes().get("triggerProperty"));
    assertEquals(Confidence.INFERRED, cleanup.confidence());
    assertTrue(cleanup.attributes().get("triggerNote").contains("取自程式碼中 app.cleanup-cron 的預設值"));
    assertTrue(
        cleanup
            .attributes()
            .get("triggerNote")
            .contains(
                "src/main/resources/application-prod.yml 將 app.cleanup-cron 設為 ${CLEANUP_CRON:0 0 4 * * *}"));
    var worker = job(graph, "Jobs.worker()").orElseThrow();
    assertEquals("上一次執行完成後隔 2 秒再執行", worker.attributes().get("triggerText"));
    assertTrue(
        worker.attributes().get("triggerNote").contains("取自 src/main/resources/application.yml"));
    var unknown = job(graph, "Jobs.unknown()").orElseThrow();
    assertEquals(Confidence.UNRESOLVED, unknown.confidence());
    assertTrue(unknown.attributes().get("triggerText").startsWith("排程規則無法確定"));
    assertEquals(Confidence.UNRESOLVED, job(graph, "Jobs.constant()").orElseThrow().confidence());
  }

  @Test
  void eventListenersStartupHooksAndPublishers() throws Exception {
    write(
        "src/main/java/demo/Listeners.java",
        """
        package demo;
        @Component public class Listeners {
          @EventListener public void created(OrderCreated event) {}
          @TransactionalEventListener(phase = TransactionPhase.AFTER_ROLLBACK) public void undone(OrderCreated event) {}
          @EventListener(ApplicationReadyEvent.class) public void warm() {}
        }
        """);
    write(
        "src/main/java/demo/Orders.java",
        "package demo; @Service public class Orders { ApplicationEventPublisher events;"
            + " public void place() { events.publishEvent(new OrderCreated(1)); } }");
    write(
        "src/main/java/demo/Seed.java",
        "package demo; @Component public class Seed implements CommandLineRunner { public void run(String... args) {} }");
    var graph = analyze();
    var created = job(graph, "Listeners.created()").orElseThrow();
    assertEquals("EVENT", created.attributes().get("trigger"));
    assertEquals("當 OrderCreated 事件發生時", created.attributes().get("triggerText"));
    assertEquals("OrderCreated", created.attributes().get("eventType"));
    assertTrue(created.attributes().get("eventPublishers").contains("Orders#place"));
    assertEquals(
        "交易回復後，當 OrderCreated 事件發生時",
        job(graph, "Listeners.undone()").orElseThrow().attributes().get("triggerText"));
    var warm = job(graph, "Listeners.warm()").orElseThrow();
    assertEquals("STARTUP", warm.attributes().get("trigger"));
    assertEquals("應用程式啟動完成後執行一次", warm.attributes().get("triggerText"));
    assertEquals("STARTUP", job(graph, "Seed.run()").orElseThrow().attributes().get("trigger"));
    GraphIntegrityValidator.validate(graph);
  }

  @Test
  void aJobCallingAServiceGetsABackendCallChain() throws Exception {
    write(
        "src/main/java/demo/Jobs.java",
        "package demo; @Component public class Jobs { private final Reminders reminders;"
            + " @Scheduled(cron = \"0 0 * * * *\") public void hourly() { reminders.send(); } }");
    write(
        "src/main/java/demo/Reminders.java",
        "package demo; @Service public class Reminders { public void send() {} }");
    var hourly = job(analyze(), "Jobs.hourly()").orElseThrow();
    assertEquals("每小時第 0 分", hourly.attributes().get("triggerText"));
    assertTrue(hourly.attributes().get("backendCalls").contains("Reminders#send"));
  }

  @Test
  void withoutEnableSchedulingTheScheduleIsOnlyInferred() throws Exception {
    write(
        "pom.xml",
        "<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>");
    write(
        "src/main/java/demo/Jobs.java",
        "package demo; @Component public class Jobs { @Scheduled(fixedRate = 1000) public void tick() {} }");
    var tick =
        job(new SpringProjectAnalyzer().analyze(new ProjectScanner().scan(root)), "Jobs.tick()")
            .orElseThrow();
    assertEquals(Confidence.INFERRED, tick.confidence());
    assertTrue(tick.attributes().get("triggerNote").contains("@EnableScheduling"));
  }

  @Test
  void aProjectWithoutJobsIsUnchanged() throws Exception {
    write(
        "src/main/java/demo/Api.java",
        "package demo; @RestController public class Api { @GetMapping(\"/x\") String x() { return \"\"; } }");
    var graph = analyze();
    assertTrue(graph.nodes().stream().noneMatch(n -> n.attributes().containsKey("trigger")));
  }
}
