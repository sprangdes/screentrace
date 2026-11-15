# ADR 0149：R62 以索引取代三個熱點的線性搜尋，過大的元素樣式不再讓報表失敗

## 背景

[CODE_REVIEW_20261114](../CODE_REVIEW_20261114.md) 的 RV-701～710 列出多處 O(n²) 以上的搜尋。為了挑出真正影響執行時間的部分，R62 以 300 組 Struts action 的合成專案（每頁 40 列表格、表單、前後頁連結；每個 Action 20 個方法）執行 CLI 並以 JFR 取樣：

- Java 分析的取樣有 64% 落在三個位置：`StrutsScreens.screenForView` 每次查詢掃描全部節點（351 筆）、`MarkupGraphContribution` 每個互動掃描全部行為（261 筆）、`StrutsInteractions.addInteractions` 每個標籤掃描全部互動（159 筆）。
- 同時發現新問題：300 個畫面的 `element-styles.json` 為 70 MB，超過 `PreviewCaptureReader` 的 32 MiB 讀取上限，例外讓 CLI 完全沒有產出報表。

## 決定

- R62-1：三個熱點改用索引，結果與原本的線性搜尋相同。
  - `StrutsScreens`：`State.nodes` 改為 `NodesByViewName`（`TreeMap` 子類別，`put`／`putAll`／`merge` 時依 view 的檔名記錄 SCREEN 節點）；查詢以檔名取候選後，再對目前的節點逐一確認，所以被取代或移除的節點不會被回傳。查詢路徑以 `/` 開頭，符合者的檔名必然等於路徑最後一段，因此候選集合不會漏掉。
  - `MarkupGraphContribution`：先記下已有導覽／送出／未知行為的觸發元件，並在迴圈新增行為時同步加入。
  - `StrutsInteractions`：分析開始時建立 `componentId → 第一個互動` 的對照表。
- R62-2：`element-styles.json` 超過 32 MiB 時不讀取，報表照常產生（預覽文件仍在），但不含元素樣式與元件標示；報表的 manifest 診斷加入 `PREVIEW_STYLES_TOO_LARGE`，CLI 也印出警告。不提高上限：讀入 Jackson tree 的記憶體用量約為檔案大小的數倍，畫面數再增加就會耗盡 heap。縮小擷取資料本身留待之後處理。

## 後果

- 量測（sandbox，4 核心，只計 Java 分析，不含預覽擷取）：300 個 action 的合成專案由 37.7 秒降為 18.5 秒；完整 CLI 由失敗（無報表）變為 186 秒產出報表。
- 驗證：以修改前的 commit（worktree）與修改後版本，分別產出合成專案與 14 個 fixture 專案的 `application-graph.json` 與 `prototype-model.json`，全部逐位元組相同（`wp10/struts2-rejected` 依設計兩邊都拒絕）。新增 `NodesByViewNameTest`（索引查詢與全掃描結果一致，含 merge、取代與移除）與過大擷取仍產出報表的測試；Maven 全數通過。
