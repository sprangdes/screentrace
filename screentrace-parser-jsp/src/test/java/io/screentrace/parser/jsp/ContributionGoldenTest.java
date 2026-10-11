package io.screentrace.parser.jsp;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class ContributionGoldenTest {
  @Test void completeMarkupContributionMatchesReviewedGolden() throws Exception {
    String source=Files.readString(Path.of("src/test/resources/wp3/components.jsp"));
    String actual=new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(MarkupAnalysis.parse("views/order.jsp",source))+"\n";
    assertEquals(Files.readString(Path.of("src/test/resources/wp3/components.json")),actual);
  }
  @Test void componentIdsSurviveUnrelatedSourceAndLineChanges() throws Exception {
    String source=Files.readString(Path.of("src/test/resources/wp3/taglibs.jsp"));
    var old=MarkupAnalysis.parse("taglibs.jsp",source).components().stream().map(MarkupAnalysis.Component::id).toList();
    assertEquals(old,MarkupAnalysis.parse("taglibs.jsp","<%-- unrelated comment --%>\n"+source).components().stream().map(MarkupAnalysis.Component::id).toList());
  }
}
