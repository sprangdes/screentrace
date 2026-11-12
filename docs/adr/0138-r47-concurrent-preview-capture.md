# ADR 0138：R47 預覽擷取多頁同時處理，樣式只傳回和預設值不同的屬性

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-004：預覽擷取（`capture-static-jsp.mjs`）用一個 page 逐一處理畫面。HEALTH_CHECK 寫 R34 的 React 預先分析「沒有合併」，實際上 `feature/r34-react-preview-alongside` 已經合併到 main（ADR 0125），這一輪一併更正。

修改前先在 sandbox（4 核心）量出時間基準：

- `fixtures/` 的 15 個專案最多 10 個畫面，完整分析共 40.2 秒，其中預覽擷取 20.6 秒，大部分是啟動 Chromium 的時間（每個專案約 0.9 秒）。
- 為了量出畫面數多時的表現，另外產生一個 80 個畫面的合成 Struts 專案（每個畫面有 40 列的表格與表單，只放在 sandbox，沒有加入版本控制）：
  - CLI 完整分析 163 秒。預覽擷取超過 CLI 的 120 秒上限而被中止，**所有畫面都沒有預覽**。
  - 單獨執行擷取 170 秒，其中 `collectElementStyles` 119 秒、JSP 重建 21 秒、縮圖 8.6 秒、截圖 3.9 秒。
  - `collectElementStyles` 的 106 秒花在頁面內讀取 computed style。在同一頁實驗的結果：只在頁面內計算要 0.15 秒，把每個元素約 350 個屬性的完整樣式傳回 Node 要 1.24 秒（每頁約 4MB）。瓶頸是傳輸，不是計算。
  - Java 分析與報表（不含擷取）35 秒。JFR 取樣中 JavaParser 只占約 1.4%，主要耗時是 `PrototypeModelGenerator`、`JspTagFileExpander` 等處的線性搜尋，留待 R48 處理。

## 決定

- R47-1：`collectElementStyles` 先取得畫面用到的元素名稱，在 baseline 頁算出各元素的預設樣式，再把預設樣式傳進頁面，在頁面內只保留和預設值不同的屬性。比對方式與原本 Node 端的過濾相同（字串相等），之後的 URL 改寫、排序與雜湊不變，所以 `element-styles.json` 逐位元組不變。
- R47-2：擷取改成同時開多個 page（`--capture-concurrency=N`，預設 4，可設 1 到 32；1 就是原本的逐一處理）。CLI 不傳這個參數，使用預設值。
  - 每個畫面的 manifest、reconstruction、截圖、互動元件、樣式與樣式診斷先記在各自的結果裡，全部完成後依畫面順序合併，輸出的 key 順序與診斷順序不受完成先後影響。`diagnostics.json` 原本就排序後才寫出。
  - JSP 重建使用模組層級的狀態（`localTagDirs`、`previewExpressions`），所以同一時間只重建一個畫面（`exclusive()`）；開啟頁面、樣式、截圖與縮圖則同時進行。
  - 畫面 ID 轉成檔名後相同的畫面（例如 `x.y` 與 `x_y` 都對應 `x_y.html`），放在同一條序列依畫面順序處理，維持「後面的畫面覆蓋前面」的結果。
  - 共用的工具放在新模組 `capture-pool.mjs`（`captureConcurrency`、`outputChains`、`runChains`、`exclusive`）。
- R47-3：CLI 的 120 秒擷取上限不改。加速後，80 個畫面的合成專案已經能在上限內完成；上限是否要依畫面數放寬，記錄在 HEALTH_CHECK 待辦。
- R47-4：HEALTH_CHECK 原本建議統一 Java 原始檔的解析快取。量測顯示重複解析不是 Java 端的瓶頸，改成處理實際的熱點（R48）。

## 後果

| 量測（sandbox，4 核心） | 修改前 | 修改後 |
|---|---|---|
| 80 個畫面單獨擷取，concurrency 1 | 170 秒 | 85.6 秒 |
| 80 個畫面單獨擷取，concurrency 4（預設） | — | 48.7 秒 |
| 80 個畫面 CLI 完整分析 | 163 秒，預覽逾時全部失敗 | 91.3 秒，預覽完整 |
| 15 個 fixtures 完整分析合計（3 次中位數） | 40.2 秒（擷取 20.6 秒） | 38.4 秒（擷取 17.3 秒） |

- 每個 page 各自占記憶體，同時開 4 頁時 Chromium 的記憶體峰值較高。
- 驗證：
  - 修改前後的 CLI 分析 `fixtures/` 的 15 個專案，277 個產物逐位元組相同（兩次都使用同一個專案路徑，所以沒有來源路徑的差異）。
  - 80 個畫面的合成專案以修改前的版本、修改後 concurrency 1 與 4 擷取，`static-preview/` 與 `screenshots/` 的所有檔案（含截圖）逐位元組相同。
  - 新增 `capture-pool.test.mjs` 的 6 個測試：參數檢查、相同檔名的畫面放在同一條序列、同時執行的上限與序列內的順序、`exclusive` 依呼叫順序執行、無效參數會中止擷取、7 個畫面（含檔名相同的兩個）以 1 頁與 4 頁擷取的檔案相同且依畫面順序合併。把 `capture-pool.mjs` 放進修改前的版本後，「無效參數會中止擷取」會失敗（舊版忽略這個參數）。
  - capture 93 個測試、Maven 594 個（589 通過、5 略過）全部通過。
