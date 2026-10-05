# ScreenTrace 第九輪調整指示（R9：路徑比對在大小寫／符號連結下失敗）

給 Codex 執行。執行前依 AGENTS.md §10 讀取 `AGENTS.md`、`docs/CODEX_INSTRUCTIONS.md`、`docs/ROADMAP.md`、`docs/reports/R5.md`（OQ-016）、`docs/reports/R8.md`。REQUIREMENTS §1 原文與 §2 決策不得更動。前幾輪的「不要做」與「停止條件」仍適用。

## 0. 問題（需求方在自己的電腦實際遇到）

在 macOS 執行 `./bin/screentrace` 分析時崩潰：

```text
Exception in thread "main" java.io.IOException: Preview local resource URL is invalid or outside the analysis output
	at io.screentrace.report.PreviewCaptureReader.normalizeResources(PreviewCaptureReader.java:107)
	at io.screentrace.report.PreviewCaptureReader.read(PreviewCaptureReader.java:31)
	at io.screentrace.report.SingleHtmlAnalysisWriter.generate(SingleHtmlAnalysisWriter.java:48)
	at io.screentrace.cli.ScreenTraceCli.analyze(ScreenTraceCli.java:174)
```

### 已重現的根因（審查者在本機驗證）

`PreviewCaptureReader.normalizeResources()` 以**純文字**方式比對：`output.toAbsolutePath().normalize()` 對 `Path.of(location).toAbsolutePath().normalize()` 做 `startsWith`。但預覽截圖（Node／Chromium）回報的資源位置是**真實路徑**（磁碟實際大小寫、已解開符號連結），設定檔中的輸出根目錄則是使用者輸入的字串。兩者寫法不同就誤判為「在分析輸出之外」。

| 設定的輸出根目錄 | 結果 |
|---|---|
| `/Users/machi/IntelliJ/screentrace_target/analyze_x`（與磁碟大小寫一致） | 成功 |
| `/Users/machi/Intellij/screentrace_target/analyze_x`（小寫 i；macOS 檔案系統不分大小寫） | **失敗（需求方的實際設定）** |
| `/tmp/x`（符號連結，真實路徑 `/private/tmp/x`） | **失敗** |
| 專案根目錄大小寫不一致、輸出根目錄在他處 | 成功 |

此檢查隨 R5 的 OQ-016 修補（跨輸出目錄決定性）加入；當時只驗證了「不同目錄輸出相同」與「報表無本機路徑」，沒有驗證「設定路徑與真實路徑寫法不同」。

Windows 的檔案系統同樣不分大小寫（磁碟機代號大小寫、`C:\` 與 `c:/`、短路徑），同類風險存在，但本輪無法在 Windows 實測，須以單元測試涵蓋可模擬的部分並在報告註明未實測。

## 1. 工作包

### WP33　以真實路徑比對，並讓失敗可理解

1. **比對方式**：所有「某檔案是否位於某根目錄內」的檢查，改為比較雙方的**真實路徑**（`Path.toRealPath()`，解開符號連結並取得磁碟上的實際大小寫）；對尚不存在的路徑，先解析最近的既有祖先再接上剩餘片段。禁止以字串前綴或不分平台的大小寫轉換作比對。
2. **全面盤點**：搜尋 Java（`screentrace-*`）與 Node（`screentrace-capture`、`screentrace-js`、`screentrace-viewer`）中所有路徑包含／越界檢查（如 `startsWith`、`relative`、`isInside`、`safe-files.mjs`），逐一確認是否有相同風險；有則一併修正，並在報告列出清單（含「已確認無風險」者與理由）。
3. **設定儲存時正規化**：`./bin/screentrace config` 儲存前，將專案根目錄與輸出根目錄解析為真實路徑再寫入設定檔；若與使用者輸入不同，顯示一行中文提示說明已採用的實際路徑（例如「已將 /Users/machi/Intellij/… 校正為 /Users/machi/IntelliJ/…」）。既有設定檔（寫法不同者）在載入時也要容忍：內部使用真實路徑，不要求使用者手動修改。
4. **失敗訊息**：真正越界（例如資源指向輸出目錄之外的另一個目錄）仍須拒絕，但訊息不得是堆疊追蹤；以中文說明「預覽資源位於分析輸出目錄之外，已拒絕」，並列出（相對化後、不含使用者家目錄的）資源位置與輸出根目錄的種類，結束碼非 0。不得因為此修正放寬安全檢查：`..` 逃逸、指向輸出外的符號連結、指向其他磁碟機的路徑，都必須繼續被拒絕。
5. **測試（先提交失敗測試）**：
   - Java：在暫存目錄內建立輸出根目錄，分別以「大小寫變體」（僅在檔案系統不分大小寫時執行，否則明確略過並註明原因）與「符號連結」兩種寫法作為設定值，斷言 `PreviewCaptureReader` 成功且輸出與標準寫法**逐位元組相同**。
   - 安全反例：資源位置含 `..` 逃逸、指向輸出外的符號連結、輸出外的絕對路徑 → 全部被拒絕。
   - 單元測試涵蓋 Windows 風格路徑字串的可模擬部分（磁碟機代號大小寫、混用分隔符號）；平台無法執行者以介面抽象或明確略過，報告註明 Windows 未實測。
   - CLI 整合：設定檔寫成大小寫變體與符號連結兩種，執行 `analyze` 與 `report` 皆成功，報表與標準寫法逐位元組相同（沿用 R5 的跨目錄決定性比對方式），且報表不含本機路徑。
   - 設定儲存：輸入大小寫變體後，設定檔內存的是真實路徑，並出現校正提示。
6. 在 `docs/ANALYST_GUIDE.md` 的疑難排解加一小節：路徑大小寫／符號連結的處理方式與錯誤訊息的意義。

## 2. 停止點與報告

完成後停止。每個工作包提交前執行完整驗證（指令同 R3 §5；基線 270 Java／40 JS／83 viewer／41 capture／86 E2E，只增不減）。報告 `docs/reports/R9.md` 須包含：根因與修正說明、盤點清單、新增測試與其在舊實作上失敗的證明、四種設定寫法（正確大小寫／大小寫變體／符號連結／越界反例）的實際 CLI 輸出、決定性比對結果、未驗證項目（Windows）。未驗證不得寫成已完成。

## 3. 不要做的事

- 不放寬任何越界檢查；不改報表內容、分析邏輯、schema、md 格式。
- 不以「小寫化所有路徑」之類的字串處理取代真實路徑比對。
- 不複製真實專案內容進 repo；不修改、不啟動被分析專案。
