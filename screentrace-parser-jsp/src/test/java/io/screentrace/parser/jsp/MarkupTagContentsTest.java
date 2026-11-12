package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import org.junit.jupiter.api.Test;

class MarkupTagContentsTest {
  @Test
  void contentsSkipCommentsAndReadPastGreaterThanInAttributes() {
    String source =
        "<!-- <title>Old</title> --><TITLE lang=\"a > b\">New <b>Title</b></title>"
            + "<%-- <h1>Hidden</h1> --%><h1>One</h1><p>x</p><h1 class='c'>Two</h1><h1>Open";
    assertEquals(List.of("New <b>Title</b>"), MarkupTag.contents(source, "title"));
    assertEquals(List.of("One", "Two"), MarkupTag.contents(source, "h1"));
  }

  @Test
  void replaceTagsSubstitutesOpeningTagsAndStopsOnAMissingValue() {
    String markup = "Hello <bean:message key='name'/>, <b>welcome</b>";
    assertEquals(
        "Hello Ann, <b>welcome</b>",
        MarkupTag.replaceTags(markup, tag -> tag.name().equals("bean:message"), tag -> "Ann"));
    assertNull(
        MarkupTag.replaceTags(markup, tag -> tag.name().equals("bean:message"), tag -> null));
    assertEquals(markup, MarkupTag.replaceTags(markup, tag -> false, tag -> "x"));
  }
}
