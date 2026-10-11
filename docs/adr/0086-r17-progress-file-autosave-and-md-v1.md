# ADR 0086：R17 進度檔自動存檔與 md v1

## 背景

確認紀錄原本只存在瀏覽器 localStorage；清除瀏覽資料、換電腦或重新分析都會遺失。需求方選擇方案 A（R17-6）：第一次標記時選擇一個 md 進度檔，之後每次標記自動寫入；重新開啟可接續。進度檔就是交給 AI 的 md。主要使用 Chrome。

## 技術驗證（WP65 spike）

以 Playwright Chromium 140、`file://` 開啟報表實測：`isSecureContext` 為 true，`showSaveFilePicker`、`showOpenFilePicker`、`FileSystemHandle.requestPermission` 皆存在；IndexedDB 在 `file://` 可寫入並於重新整理後讀回。瀏覽器私有檔案系統（OPFS）在 `file://` 下回 `SecurityError`，本設計不使用它。原生「另存新檔」對話框與重新開啟後的授權無法自動化，另提供驗證頁請需求方在實際 Chrome 中操作確認（結果記入 R17 報告）。

## 決定

1. `progress-file.ts`：包裝檔案選擇、寫入與 IndexedDB 中的檔案 handle（鍵為應用名稱）。handle 儲存失敗只會失去「繼續上次進度」捷徑，不影響決策。
2. 頂部列以「進度檔」選單取代獨立的「開啟 md」按鈕（頂部控制項維持 6 個）。狀態：尚未設定進度檔／繼續上次進度／儲存中…／已自動儲存／儲存失敗／未自動存檔（不支援時）。
3. 第一次標記時自動展開選單，提示選擇存放位置（預設檔名 `screentrace-review-<應用名稱>.md`），可選「稍後再說」。選定後立即寫入，之後每次標記 500 ms 去抖動後依序寫入整份 md。
4. 重新開啟：有記住的檔案時顯示「繼續上次進度：<檔名>」並展開選單；仍有授權時自動載入。載入以進度檔內容為準（沿用匯入的驗證、指紋與孤兒提示）。
5. 「開啟 md…」在支援的瀏覽器用檔案選擇器開啟並設為新的寫入目標；不支援時退回 `<input type=file>`。「下載 md」永遠可用，檔名維持 `screentrace-review.md`。
6. 寫入失敗：狀態顯示失敗原因，決策留在頁面與瀏覽器暫存，可重試或改選位置。
7. localStorage 照常寫入，作為備援與不支援 File System Access 瀏覽器的主要保存。
8. md 匯出一律為 v1，正文移除元件庫、樣式、原因／備註與 API 信心欄（見 REVIEW_MD_CONTRACT「R17」）。

## 測試

- `r17-autosave.e2e`：以注入的假檔案選擇器與假 handle 儲存（`window.__screentraceHandleStore` 測試接縫）驗證：首次標記提示、寫入內容為 v1 且隨標記更新；重新開啟顯示繼續、以檔案為準、仍有授權時自動載入；寫入失敗保留決策並可重試；稍後再說停止提示；開啟既有進度檔成為寫入目標；不支援時退回下載與檔案輸入。
- md golden（`review.md`、`malicious-review.md`）更新正文：差異僅為上述移除項，附錄 A 位元組不變（逐檔比對）。`wp40-md-decision-equivalence` 的整份 md 雜湊更新為新正文的值，並移除批次標記部分。
- `md.test` WP47 測試改為「舊 v3 檔仍可匯入並維持驗證、再匯出為 v1」；`library-md.test` 改用以 R17 前產生器產生的 `golden/review-v2.md` 驗證 v2 匯入相容與欄位、摘要檢查。刪除只驗證 v2 匯出、元件庫 §6 內容的測試。
- `md.e2e` 的 5 MB 測試原本靠樣式表撐大內容，改為 11,000 個元件；`r16-jsf-warning.e2e` 改比對 §7。
- `CODEX_INSTRUCTIONS.md` §8.2 固定指示同步更新（測試逐字比對）。
