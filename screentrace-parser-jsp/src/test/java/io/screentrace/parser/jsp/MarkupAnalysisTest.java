package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import io.screentrace.core.ApplicationGraph.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class MarkupAnalysisTest {
  @Test void retainsKindsGuardsEventsValidationBindingsAndModalTargets() throws Exception {
    String text = Files.readString(Path.of("src/test/resources/wp3/components.jsp"));
    var result = MarkupAnalysis.parse("views/order.jsp", text);
    assertEquals(EnumSet.allOf(ComponentKind.class), EnumSet.copyOf(result.components().stream().map(MarkupAnalysis.Component::kind).toList()));
    var email = result.components().stream().filter(c -> "email".equals(c.attributes().get("id"))).findFirst().orElseThrow();
    assertEquals(6, email.source().line());
    assertEquals("${visible}", email.guard());
    assertEquals("order", email.model());
    assertEquals("email", email.field());
    assertEquals(Confidence.UNRESOLVED, email.bindingStatus());
    assertTrue(result.components().stream().filter(c -> c.kind() == ComponentKind.MULTI_SELECT).allMatch(MarkupAnalysis.Component::repeated));
    assertEquals(Set.of("required", "pattern", "minlength", "maxlength", "email", "date", "min", "max"), new HashSet<>(result.rules().stream().map(ValidationRule::kind).toList()));
    assertTrue(result.rules().stream().allMatch(r -> r.layer() == ValidationLayer.MARKUP && r.evidence().get(0).source().file().equals("views/order.jsp")));
    assertEquals(3, result.events().size());
    assertTrue(result.behaviors().stream().anyMatch(b -> b.type() == BehaviorType.OPEN_DIALOG && b.targetId() != null));
    assertTrue(result.components().stream().noneMatch(c -> c.source().line() < 5));
    assertEquals(result, MarkupAnalysis.parse("views/order.jsp", text));
  }
  @Test void projectParserExposesMarkupAndKeepsOriginalLines() throws Exception {
    Path root = Files.createTempDirectory("wp3-markup");
    Path screen = root.resolve("order.html");
    Files.copy(Path.of("src/test/resources/wp3/components.jsp"), screen);
    var result = new JspProjectParser().analyze(root, List.of(screen));
    assertEquals(JspAnalysis.ViewKind.HTML, result.views().get(0).kind());
    assertEquals(6, result.markup().get("order.html").components().stream()
        .filter(c -> "email".equals(c.attributes().get("id"))).findFirst().orElseThrow().source().line());
    assertEquals(14, result.interactions().stream().filter(i -> "${target}".equals(i.target())).findFirst().orElseThrow().source().line());
    assertTrue(result.interactions().stream().noneMatch(i -> "/fake".equals(i.target())));
    String actual = result.markup().get("order.html").components().stream()
        .map(c -> c.source().line() + "|" + c.tag() + "|" + c.kind() + "|" + Objects.toString(c.guard(), "") + "|" + c.repeated())
        .collect(java.util.stream.Collectors.joining("\n", "", "\n"));
    assertEquals(Files.readString(Path.of("src/test/resources/wp3/components.golden")), actual);
  }
  @Test void booleanAttributesAndNestedJspExpressionsPreserveAttributeBoundaries() {
    var tags = MarkupTag.scan("<input required disabled value=\"<%= user.get(\"name\") %>\" /><a href=\"<c:url value=\"/a\"/>\">A</a>");
    assertEquals(3, tags.size());
    assertEquals("", tags.get(0).attribute("required"));
    assertEquals("<%= user.get(\"name\") %>", tags.get(0).attribute("value"));
    assertEquals("<c:url value=\"/a\"/>", tags.get(1).attribute("href"));
  }
}
