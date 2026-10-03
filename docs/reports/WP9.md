# WP9 增量回報

## 1 Schema 與 CLI

新增 draft 2020-12 Schema、虛構 sample manifest、ComponentLibrary 驗證與 CLI LibraryStore／LibraryCommands。validate/import/list/unbind 與 --project／--replace 獨立於原分析指令；SHA-256 對原始 bytes，版本衝突拒絕、明確更換後提示受影響專案重產報表。未選用仍 none；report／viewer／md 注入留增量三／四。

4 項新 Java 測試：合法／非法 Schema、未知欄位路徑、5 MiB／2,000 上限、重複 ID、未綁定／綁定／更換／解除、同版本異內容與 --replace、保留並列所有儲存摘要、CLI 失敗訊息／家目錄隱私。初次測試缺少類別而編譯失敗；新增歷史項目列舉斷言再失敗，修正後通過。完整 Java verify 與遠端 npm audit／Dependency-Check gate 通過後才進增量二。既有測試斷言與兩份 golden 不變。

設計：[ADR 0027](../adr/0027-component-library-storage.md)。指示文件 v1.9，OQ-009 已處理。WP10 未開始。
