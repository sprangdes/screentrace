package io.screentrace.report;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.PreviewModel;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

/** R78 (ADR 0156): the analyst's migration target reaches the report payload; none is explicit. */
class MigrationTargetInjectionTest {
  private String report(MigrationTarget target) throws Exception {
    var root = Files.createTempDirectory("migration-target-");
    var output =
        new SingleHtmlReportGenerator()
            .generate(
                SingleHtmlReportGeneratorTest.graph("2.2"),
                new PreviewModel("2", List.of(), List.of()),
                Map.of(),
                Map.of(),
                root,
                null,
                target);
    return Files.readString(output.path());
  }

  @Test
  void defaultSetAndNoneAreDistinctInThePayload() throws Exception {
    assertFalse(report(null).contains("\"migrationTarget\""));
    assertTrue(
        report(new MigrationTarget("Quarkus 3", "React"))
            .contains("\"migrationTarget\":{\"backend\":\"Quarkus 3\",\"frontend\":\"React\"}"));
    assertTrue(report(MigrationTarget.NONE).contains("\"migrationTarget\":null"));
  }

  @Test
  void blankOverlongControlOrHalfTargetsAreRefused() {
    for (var pair :
        List.of(
            new String[] {"", "React"},
            new String[] {"a".repeat(81), "React"},
            new String[] {"Spring\u0007", "React"},
            new String[] {"Spring", null}))
      assertThrows(IllegalArgumentException.class, () -> new MigrationTarget(pair[0], pair[1]));
  }
}
