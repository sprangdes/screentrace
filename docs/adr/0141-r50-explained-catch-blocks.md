# ADR 0141：R50 每個被吞掉的例外都要說明或縮小型別

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-002：Java 主程式有 26 處空的 `catch (Exception ignored) {}`。健檢時逐處確認過，主要的失敗都已經有其他診斷涵蓋，所以列為低優先；但程式碼裡沒有說明為什麼可以忽略，也看不出由誰報錯，而且一律接住 `Exception`，連程式本身的 bug 也一起吞掉。實作時另外找到第 27 處：`JavaScriptGraphContribution` 的 `catch (RuntimeException listingNotPermitted) {}`，說明寫在區塊外面。

## 決定

- R50-1：依例外的來源分類處理：

  | 類別 | 處數 | 例外的來源 | 處理 |
  |---|---|---|---|
  | A. Java 原始檔解析 | 3 | `ParsedJavaUnits.parse`；主流程（`SpringMvcAnalyzer`、`SpringBootAnalyzer`）已經會報「Unable to parse Java source」 | 改接 `IOException \| RuntimeException`，也就是 `parse` 實際會丟的型別，並註明由誰報錯 |
  | B. 讀取 JSP、XML 或設定檔 | 8 | 讀檔，再加上 XML 或標記解析 | 型別不變，加註解說明由誰報錯：`StrutsConfigParser`、`readFacesServletMappings`、`JspProjectParser` 的「Source file was skipped」，以及這裡少掉的是哪項補充資訊 |
  | C. 序列化記憶體中的資料 | 7 | `writeValueAsString`；寫的只有字串與數字組成的 Map、List、record | 改接 `JsonProcessingException`，發生時拋出 `IllegalStateException`。這只可能是程式 bug，讓 CI 直接失敗，不再默默少掉 `simulationData`、`simulationBindings` 等資料 |
  | D. 解析 evidence 的 JSON | 5 | `readTree`：detail 不是 JSON，或是 null | 改接 `JsonProcessingException \| IllegalArgumentException` |
  | E. 解析 URI | 2 | `URI.create`／`resolve` | 改接 `IllegalArgumentException`。`ScriptSources` 原本會因 opaque URI 的 `getPath()` 為 null 而丟 NPE、再被接住，改成明確檢查 null，結果相同 |
  | F. 其他已縮小型別的 | 2 | `NumberFormatException`；列出子程序不被允許 | 只加註解 |

- R50-2：`SpringSubmittedModel` 有一處 `try` 同時包住序列化與 `getBegin().orElseThrow()`。缺少行號時原本會被整段跳過；現在改成先檢查兩個宣告都有行號，沒有就跳過，序列化則照 C 類處理。
- R50-3：新增 `EmptyCatchGuardTest`（screentrace-cli），掃描所有模組的 `src/main/java`。只要有空的 `catch` 區塊、裡面連一行說明註解都沒有，測試就失敗。

## 後果

- 只有 C 類會改變行為，而且只在序列化真的失敗時。依目前的型別，這不會因為分析的專案不同而發生。
- 驗證：
  - 15 個 fixtures 的 277 個產物與 80 個畫面合成專案的全部產物，都與修改前逐位元組相同。
  - `EmptyCatchGuardTest` 在修改前的版本失敗，列出 27 處；修改後通過。
  - Maven 599 個（594 通過、5 略過）。
