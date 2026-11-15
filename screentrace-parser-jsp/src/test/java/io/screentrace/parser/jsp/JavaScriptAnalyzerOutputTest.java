package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.screentrace.core.ApplicationGraph.BehaviorType;
import io.screentrace.core.ApplicationGraph.Confidence;
import org.junit.jupiter.api.Test;

/** RV-414: unknown analyzer values affect one item, never the whole contribution. */
class JavaScriptAnalyzerOutputTest {
  private static final ObjectMapper JSON = new ObjectMapper();

  @Test
  void unknownTypeAndStatusAreContainedPerItem() throws Exception {
    assertEquals(
        BehaviorType.NAVIGATE,
        JavaScriptGraphContribution.behaviorType(JSON.readTree("{\"type\":\"NAVIGATE\"}")));
    assertNull(JavaScriptGraphContribution.behaviorType(JSON.readTree("{\"type\":\"NEW_KIND\"}")));
    assertNull(JavaScriptGraphContribution.behaviorType(JSON.readTree("{}")));
    assertEquals(
        Confidence.INFERRED,
        JavaScriptGraphContribution.confidence(JSON.readTree("{\"status\":\"INFERRED\"}")));
    assertEquals(
        Confidence.UNRESOLVED,
        JavaScriptGraphContribution.confidence(JSON.readTree("{\"status\":\"PROBABLY\"}")));
    assertEquals(
        Confidence.UNRESOLVED, JavaScriptGraphContribution.confidence(JSON.readTree("{}")));
  }

  @Test
  void reactScreenNeedsAnAbsoluteRoute() {
    // RV-421: an empty route used to throw and drop every React screen.
    assertTrue(ReactGraphContribution.absoluteRoute("/"));
    assertTrue(ReactGraphContribution.absoluteRoute("/orders/:id"));
    assertFalse(ReactGraphContribution.absoluteRoute(""));
    assertFalse(ReactGraphContribution.absoluteRoute("orders"));
    assertFalse(ReactGraphContribution.absoluteRoute(null));
  }
}
