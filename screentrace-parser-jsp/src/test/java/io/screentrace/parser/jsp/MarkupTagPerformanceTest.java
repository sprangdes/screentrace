package io.screentrace.parser.jsp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class MarkupTagPerformanceTest {
  @Test void tracksLinesAcrossFiftyThousandTagsInOnePass() {
    String source = IntStream.range(0, 50_000).mapToObj(index -> "<input name=\"f" + index + "\"/>\n").collect(Collectors.joining());
    var tags = MarkupTag.scan(source);
    assertEquals(50_000, tags.size());
    assertEquals(50_000, tags.get(tags.size() - 1).line());
  }
}
