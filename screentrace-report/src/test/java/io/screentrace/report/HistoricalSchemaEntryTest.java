package io.screentrace.report;
import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class HistoricalSchemaEntryTest {
 @Test void reportMarksHistoricalEvidenceLimitAndIsDeprecated() throws Exception {assertTrue(ReportGenerator.class.isAnnotationPresent(Deprecated.class));var root=Files.createTempDirectory("legacy-report");var graph=new ApplicationGraph(new ApplicationGraph.Application("legacy",".",List.of()),List.of(),List.of(),List.of());new ReportGenerator().write(graph,root);var text=Files.readString(root.resolve("report/index.html"));assertTrue(text.contains("2.1"));assertTrue(text.contains("歷史資料,未經 2.2 證據驗證"));}
 @Test void exportMarksHistoricalEvidenceLimitAndIsDeprecated() throws Exception {assertTrue(ReviewResultGenerator.class.isAnnotationPresent(Deprecated.class));var root=Files.createTempDirectory("legacy-export");var graph=new ApplicationGraph(new ApplicationGraph.Application("legacy",".",List.of()),List.of(),List.of(),List.of());new ReportGenerator().write(graph,root);new ReviewResultGenerator().write(root,root.resolve("review.json"));var text=Files.readString(root.resolve("review.json"));assertTrue(text.contains("2.1"));assertTrue(text.contains("歷史資料,未經 2.2 證據驗證"));}
}
