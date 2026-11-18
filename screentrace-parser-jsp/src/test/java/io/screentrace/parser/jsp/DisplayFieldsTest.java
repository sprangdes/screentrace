package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;

import io.screentrace.core.ApplicationGraph.ComponentKind;
import java.util.*;
import org.junit.jupiter.api.Test;

/**
 * R79 (ADR 0157): elements that print data are display fields, named by the label the markup
 * proves.
 */
class DisplayFieldsTest {
  private static final String PAGE =
      """
      <table>
        <thead><tr><th>姓名</th><th>城市</th></tr></thead>
        <c:forEach items="${owners}" var="owner">
          <tr><td><a href="edit">${owner.firstName}</a></td><td class="city">${owner.city}</td></tr>
        </c:forEach>
      </table>
      <dl><dt>電話</dt><dd><c:out value="${owner.telephone}"/></dd></dl>
      <c:if test="${admin}"><p>地址：${owner.address}</p></c:if>
      <span th:text="${pet.name}">Leo</span>
      <p><bean:write name="ownerForm" property="email"/></p>
      <button>${label}</button>
      <script>var x = "${y}";</script>
      <p>${fn:escapeXml(owner.lastName)} 先生</p>
      """;

  private static Map<String, MarkupAnalysis.Component> byTag(List<MarkupAnalysis.Component> list) {
    Map<String, MarkupAnalysis.Component> result = new LinkedHashMap<>();
    for (var c : list) result.put(c.tag() + ":" + c.attributes().get("property"), c);
    return result;
  }

  @Test
  void elementsPrintingDataAreFieldsNamedByHeaderLabelOrProperty() {
    var fields = DisplayFields.find("web/owners.jsp", PAGE, Map.of());
    var found = byTag(fields);
    assertEquals(
        List.of(
            "td:owner.city",
            "dd:owner.telephone",
            "p:owner.address",
            "span:pet.name",
            "p:ownerForm.email",
            "p:owner.lastName"),
        new ArrayList<>(found.keySet()));
    var city = found.get("td:owner.city");
    assertEquals(ComponentKind.DISPLAY_FIELD, city.kind());
    assertEquals("城市", city.attributes().get("displayName"));
    assertEquals("tableHeader", city.attributes().get("labelSource"));
    assertEquals("${owner.city}", city.attributes().get("expression"));
    assertTrue(city.repeated());
    assertEquals(4, city.source().line());
    assertEquals("電話", found.get("dd:owner.telephone").attributes().get("displayName"));
    var address = found.get("p:owner.address");
    assertEquals("地址", address.attributes().get("displayName"));
    assertEquals("leadingText", address.attributes().get("labelSource"));
    assertEquals("${admin}", address.guard());
    assertFalse(address.repeated());
    assertEquals("pet.name", found.get("span:pet.name").attributes().get("displayName"));
    assertEquals("property", found.get("span:pet.name").attributes().get("labelSource"));
  }

  @Test
  void idsFollowTheComponentScheme() {
    // The same element written twice gets two ids, counted the way the capture counts them.
    String twice = "<p>${a.b}</p>\n<p>${a.b}</p>";
    var fields = DisplayFields.find("x.jsp", twice, Map.of());
    assertEquals(2, fields.size());
    assertNotEquals(fields.get(0).id(), fields.get(1).id());
    assertEquals(
        io.screentrace.core.StableGraphIds.component(
            "x.jsp", ComponentKind.DISPLAY_FIELD, new TreeMap<>(Map.of("tag", "p")), 1),
        fields.get(1).id());
  }

  @Test
  void plainPropertyPathsAndExpressions() {
    assertEquals("owner.lastName", DisplayFields.property("${owner.lastName}"));
    assertEquals("owner.pets[0].name", DisplayFields.property("${owner.pets[0].name}"));
    assertEquals("owner.name", DisplayFields.property("${fn:escapeXml(owner.name)}"));
    assertEquals("pet.name", DisplayFields.property("*{pet.name}"));
    assertNull(DisplayFields.property("${1 + 2}"));
  }

  @Test
  void aPageWithoutOutputAddsNothing() {
    var markup = MarkupAnalysis.parse("x.jsp", "<p>靜態文字</p>");
    assertSame(markup, DisplayFields.add(markup, "x.jsp", "<p>靜態文字</p>", Map.of()));
  }
}
