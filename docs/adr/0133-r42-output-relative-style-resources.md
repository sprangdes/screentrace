# ADR 0133：R42 擷取的樣式資源改記成相對於分析目錄

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-009：`static-preview/element-styles.json` 的計算樣式（例如 `background-image`）記錄 Chromium 解析後的絕對 `file:` URL，含擷取當時的本機路徑；樣式 ID 是內容的雜湊，所以同一個專案輸出到不同目錄時，樣式 ID 也不同。報表端的 `PreviewCaptureReader` 已經會把這些 URL 改寫成 `st-preview-resource:<相對路徑>`，並拒絕解析後離開分析目錄的路徑（含 symlink），所以單一 HTML 報表不受影響；問題只在中間產物。

## 決定

- R42-1：capture 寫入樣式時，把開頭正好是分析目錄 `file:` URL（`pathToFileURL(output)` 加 `/`）的 URL，改寫成 `st-preview-file:<相對部分>`（`element-styles.mjs` 的 `portableResourceUrls`）。只比對 URL 開頭的字串前綴；其他 URL（相鄰目錄、分析目錄以外、內嵌在別的 URL 裡、`data:`）都照原樣保留。樣式 ID 以改寫後的內容計算。
- R42-2：路徑邊界只在報表端檢查一次，capture 端的改寫不是安全邊界。`PreviewCaptureReader` 把 `st-preview-file:` 以分析目錄為基準還原成 `file:` URI，之後與原本的 `file:` URL 走同一段檢查與改寫；`st-preview-file:` 後面若是絕對路徑、帶 scheme 或 authority，直接拒絕；`..` 或 `%2e%2e` 離開分析目錄時，與 `file:` URL 一樣拒絕，錯誤訊息不含路徑。
- R42-3：報表端仍接受舊格式（絕對 `file:` URL）的 `element-styles.json`。

## 後果

- 同一個專案輸出到不同目錄時，`element-styles.json` 逐位元組相同，也不再含本機路徑。
- 報表不變：兩種寫法還原後是同一個 `st-preview-resource:` 值，報表端重算的樣式 ID 也相同。
- 驗證：
  - 新增 capture 單元測試 2 個（`portable-resources.test.mjs`）；`preview-v2.test.mjs` 的背景圖測試改為檢查 `st-preview-file:static-preview/assets/…`，且沒有 `file://`。capture 87 個測試全部通過。
  - 新增 Java 測試 2 個：相對寫法與絕對 `file:` URL 產生的報表逐位元組相同；7 種離開分析目錄或格式不對的相對寫法都被拒絕且不洩漏路徑。Maven 584 個測試 579 通過、5 個依作業系統條件略過。
  - 以 `fixtures/struts` 加上一張背景圖，CLI 輸出到兩個不同目錄：`element-styles.json` 與報表都逐位元組相同，且不含 `file:`；報表也與修改前的版本逐位元組相同。
