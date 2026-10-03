# ADR 0025：歷史 JSON review 匯出退場

日期：2026-10-03；狀態：採用，依 WP8／OQ-006 明確授權。

## 背景與決定

WP8 新單一 md 與附錄還原已取代歷史 JSON。移除 ReviewResultGenerator、CLI export 命令／互動選項／匯出完成 helper、REVIEW_RESULT_CONTRACT 與 review-result.json 範例。新分析不再初始化僅供舊 export 的 edit-overlay.json，不刪既有使用者歷史檔；core EditOverlay 原模型／測試不在本輪清理範圍。

## 依授權退場的測試

- ReviewResultGeneratorTest 全部 13 tests：只驗已移除 generator／歷史 JSON／fixture；不投入遷移。
- StandaloneViewerTest.actualCliGraphProducesOnlyStrictStandaloneViewerAndLegacyJsonExportStillWorks：只移除尾段舊 generator 呼叫和「歷史資料」文案斷言；全部分析／HTML／CSP／application-graph.json 2.2 斷言原樣保留。方法改為 actualCliGraphProducesStrictStandaloneViewerAndSchemaTwoArchive。
- ReviewExportContractTest 已在 WP7 E 隨 POST 移除，未重新建立。

沒有修改、刪除或放寬長期程式斷言。新增 MarkdownRetirementTest 3 tests 先失敗：反射解析 export 必須在 console／檔案操作前拒絕；舊檔／契約與可載入類別不存在；新分析不初始化歷史 review 檔但保留既有使用者資料、實際新圖版本 2.2。

## 後果

CLI 只保留 analyze／report／config 與互動主選單。新 md 由本地瀏覽器產生，不透過 CLI／server 取 localStorage；文件更新到新流程。原始歷史報告與 ADR 留作紀錄，非正式入口。以 clean verify／新 ClassNotFound 斷言檢查編譯類別退場，避免 stale artifact 冒充完成。
