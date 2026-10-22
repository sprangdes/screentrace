package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

/** ;jsessionid=… is servlet URL rewriting; the resource path ends before it. */
class ScriptPathParameterTest {
  @Test void pathParametersAreDroppedButQueryAndFragmentKept() {
    assertEquals("/zeprs/js/engine2.jsp", ScriptSources.withoutPathParameters("/zeprs/js/engine2.jsp;jsessionid=${pageContext.request.session.id}"));
    assertEquals("/js/app.js?v=2#top", ScriptSources.withoutPathParameters("/js/app.js;jsessionid=ABC?v=2#top"));
    assertEquals("/js/app.js", ScriptSources.withoutPathParameters("/js/app.js"));
  }
}
