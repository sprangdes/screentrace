package io.screentrace.report;
import org.junit.jupiter.api.Test;
import java.nio.file.*;
import java.util.*;
import io.screentrace.core.PreviewModel;
import static org.junit.jupiter.api.Assertions.*;
class LibraryInjectionTest {
 @Test void selectedLibraryOnlyIsInjectedWithDigestAndNoStoragePath() throws Exception {
  var library=ComponentLibrary.validate(Files.readAllBytes(Path.of("../docs/examples/component-library.sample.json")));var root=Files.createTempDirectory("library-report-");var generator=new SingleHtmlReportGenerator();var preview=new PreviewModel("2",List.of(),List.of());
  var selected=generator.generate(SingleHtmlReportGeneratorTest.graph("2.2"),preview,Map.of(),Map.of(),root,library);String html=Files.readString(selected.path());assertTrue(html.contains("Sample Controls"));assertTrue(html.contains(library.sha256()));assertFalse(html.contains(root.toString()));assertFalse(html.contains(System.getProperty("user.home")));
  var none=generator.generate(SingleHtmlReportGeneratorTest.graph("2.2"),preview,Map.of(),Map.of(),root);String noLibrary=Files.readString(none.path());assertFalse(noLibrary.contains("Sample Controls"));assertFalse(noLibrary.contains("\"componentLibrary\""));
 }
}
