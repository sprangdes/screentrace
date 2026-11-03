package io.screentrace.cli;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class ContextPathHintSummaryTest {
  @Test void summaryPromptsConfigurationOnlyWhenHintsExist() {
    assertEquals("提示：4 個網址可能缺少 context path，請使用 ./bin/screentrace config 設定後重新分析",
        ScreenTraceCli.contextPathHintSummary(4));
    assertNull(ScreenTraceCli.contextPathHintSummary(0));
  }
  @Test void personaSummariesAreLoggedOnlyWhenPresent() throws Exception {
    var type=Class.forName("io.screentrace.cli.ScreenTraceCli$AnalysisResult");var constructor=type.getDeclaredConstructor(java.nio.file.Path.class,String.class,java.util.List.class,long.class,long.class,long.class,java.nio.file.Path.class,long.class,java.util.List.class);constructor.setAccessible(true);
    var method=ScreenTraceCli.class.getDeclaredMethod("logAnalysis",type);method.setAccessible(true);var logger=java.util.logging.Logger.getLogger(ScreenTraceCli.class.getName());var messages=new java.util.ArrayList<String>();var handler=new java.util.logging.Handler(){public void publish(java.util.logging.LogRecord r){messages.add(r.getMessage());}public void flush(){}public void close(){}};logger.addHandler(handler);
    try {method.invoke(null,constructor.newInstance(java.nio.file.Path.of("report"),"sample",java.util.List.of(),0L,0L,0L,java.nio.file.Path.of("out"),0L,java.util.List.of("角色 訪客：可達 1、可能 0、未到達 0、未判定導覽 0","角色 顧客：可達 1、可能 0、未到達 0、未判定導覽 0")));assertEquals(2,messages.get(0).lines().filter(line->line.stripLeading().startsWith("角色 ")).count());messages.clear();method.invoke(null,constructor.newInstance(java.nio.file.Path.of("report"),"sample",java.util.List.of(),0L,0L,0L,java.nio.file.Path.of("out"),0L,java.util.List.of()));assertFalse(messages.get(0).contains("角色 "));}finally{logger.removeHandler(handler);}
  }
}
