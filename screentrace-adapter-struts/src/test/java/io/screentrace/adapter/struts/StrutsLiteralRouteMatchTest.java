package io.screentrace.adapter.struts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import org.junit.jupiter.api.Test;

/** HC-004 / ADR 0139: a route without '*' or '\' matches only itself, as the quoted regex did. */
class StrutsLiteralRouteMatchTest {
  @Test
  void literalRoutesMatchOnlyThemselves() {
    for (String route : List.of("/orders", "/a.b", "/a+b(c)", "/x$", "/[q]", "/^p|q", ""))
      for (String path : List.of(route, route + "/", "/aXb", "/a+bc", "/orders\n", "/ORDERS")) {
        var match = StrutsWildcards.wildcardMatch(route, path, null);
        if (route.equals(path)) {
          assertEquals(path, match.path(), route);
          assertEquals(List.of(), match.captures(), route);
        } else assertNull(match, route + " vs " + path);
      }
  }

  @Test
  void wildcardAndEscapedRoutesStillUseThePattern() {
    assertEquals(
        List.of("edit", "7"),
        StrutsWildcards.wildcardMatch("/order/*/*", "/order/edit/7", null).captures());
    assertEquals(
        List.of("a/b"), StrutsWildcards.wildcardMatch("/files/**", "/files/a/b", null).captures());
    assertEquals(List.of(), StrutsWildcards.wildcardMatch("/a\\*", "/a*", null).captures());
    assertNull(StrutsWildcards.wildcardMatch("/a\\*", "/ab", null));
  }
}
