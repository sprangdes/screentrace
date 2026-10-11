# ADR 0027：元件庫 Schema 與工作區選用

日期：2026-10-03。狀態：採用（OQ-009 A）。

元件庫 manifest 與摘要放在 report／CLI 邊界，不改 core。draft 2020-12 Schema 附於 docs/schemas，打包相同檔為 report classpath 資源，禁止輸入自選 Schema／遠端引用。採 com.networknt:json-schema-validator:1.5.9（Apache-2.0，官方 1.5.9 README 明列 draft 2020-12 與 Jackson）；版本釘選，通過 Dependency-Check 才算完成，無新 npm 相依。官方來源：https://github.com/networknt/json-schema-validator/tree/1.5.9 。不使用手寫 Schema 子集替代標準驗證器。

manifest schemaVersion 為 1，物件未知欄位全部拒絕，attributes 是明確任意鍵的字串對照；欄位 default 可為 JSON 值。元件上限 2,000、UTF-8 檔案上限 5 MiB、重複 ID 與 JSON 重複鍵拒絕。所有測試元件均為標明 Sample 的虛構資料。

SHA-256 對匯入的原始檔案 bytes 計算，不忽略空白；工作區 index 以名稱@版本加 SHA-256 為儲存鍵，內容檔以完整 SHA-256 定址。未指定 project 只存不選；明確 project 綁定唯一元件庫，重複綁定更換，unbind 解除。衝突需 --replace，更新既有綁定指向新內容並提示重產報表；舊內容項目與檔案保留且 list 全列。list 列名稱@版本、摘要前 12 碼及綁定，不列路徑。

CLI 檔案錯誤使用固定訊息，不暴露儲存／輸入絕對路徑；manifest 含本機家目錄／本機路徑拒絕。文字控制與隱形字元可見化，HTML／md 的 code span 隔離留於增量三／四。單檔只注入明確選用的元件庫；沒有綁定維持原有輸出。

增量二定義比對與涵蓋率；增量三定義手動覆寫／摘要暫存鍵／orphan；增量四擴充 md 雙格式契約。每個增量通過遠端 CI 才進下一個，未進 WP10。既有斷言／兩份 md golden 不變。
