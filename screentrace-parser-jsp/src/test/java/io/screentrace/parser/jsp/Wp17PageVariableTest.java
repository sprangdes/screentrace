package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import io.screentrace.core.ApplicationGraph.Confidence;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class Wp17PageVariableTest {
  @Test void resolvesEarlierPageScopeCSetLiteralWithoutChangingExistingBoundaryCases() throws Exception {
    Path root = Path.of("..", "fixtures", "r3", "wp17").toAbsolutePath().normalize();
    var analysis = new JspProjectParser().analyze(root, List.of(root.resolve("cset-url.jsp")));
    var link = analysis.interactions().stream().filter(i -> i.type() == JspAnalysis.InteractionType.NAVIGATION).findFirst().orElseThrow();
    assertEquals("/orders/list", link.target());
    assertEquals(Confidence.CONFIRMED, link.confidence());
    assertEquals("${pageUrl}", link.originalExpression());
  }
}
