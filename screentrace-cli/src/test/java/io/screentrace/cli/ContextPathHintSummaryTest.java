package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class ContextPathHintSummaryTest {
  @Test void summaryPromptsConfigurationOnlyWhenHintsExist() {
    assertEquals("提示：4 個網址可能缺少 context path，請使用 ./bin/screentrace config 設定後重新分析",
        ScreenTraceCli.contextPathHintSummary(4));
    assertNull(ScreenTraceCli.contextPathHintSummary(0));
  }
}
