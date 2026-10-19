# ADR 0093 — 第三批公開專案完整性與操作修復

- 日期：2026-10-19
- 狀態：採用；需求方要求「修正這些測出的問題」並指示繼續。
- 工作包：WP72；延續 `fix/workflow-restoration`。

## 背景與選項

WP71 的四個新公開專案暴露 WF-014–022、NC-002–003。畫面、路由和控制項數量齊全，仍遺漏 Ajax、分支回傳、片段組合、彈窗、回饋及示範資料。只補數量或只驗收跳頁不能滿足操作需求；啟動目標系統、執行目標腳本或從 DOM 猜測後端行為違反既有約束。採用帶來源證據的有限靜態解讀，讓工具自己的離線狀態機消費同一份圖。

延續 ADR 0092 的需求方授權，修復 Thymeleaf 表單與資料投影；此授權優先於舊版指示中的模板排除。不更改需求原文、既有測試斷言、Graph 2.2／Preview 2、依賴或大小限制，不修改／建置／啟動任何受測專案。

## 決定

### 來源範圍與請求目錄

scanner 採納安全、常值且存在的 NetBeans `web.docbase.dir`，排除已證明未啟用的傳統 web root；路徑仍通過現有 realpath／symlink 安全檢查。不明設定不猜測啟用根目錄。

外部腳本可由唯一有效 web root 對應；Boot static/public 中的相對檔案，只有 canonical graph 證明原畫面請求目錄時才採用。共用片段的所有來源畫面須得到一致目錄。相對 API 同樣只從 GET／ANY → handler → RENDERS 或既有 literal routeAlias 直接對應公開實體 JSP/HTML 取得目錄。私有 WEB-INF、classpath templates、action alias、動態路徑及多個目錄不可當作直接公開頁；不從 redirect 推定原文件目錄。保留原 URL、推導與 INFERRED 證據。

### Java 回傳與回饋

JavaParser 對未初始化、未逸出、單一區域 ModelAndView alias 的有限 if/else 賦值保留所有可能 view 與條件。限制 32 層／64 路徑；未知修改、迴圈與不支援控制流程維持未知。已初始化 alias 延續原保守規則。同一行不同賦值以 column 區分邊 ID，不合併遺失。handler 的 `unresolvedReturnCount` 保留混合已知／未知結果，檢視器不得因有一個已知目的地而隱藏未知選項。

回傳區塊內可證明的 ModelAndView.addObject 常值文字，或唯一且無重新賦值的區域字串，產生 `SpringModelFeedback` evidence JSON v1 `{version:1,values:{key:text}}`。只投影被選取分支的訊息，清除前次訊息，用 textContent 顯示。這是分支示範，不執行後端條件或宣稱註冊成功。

### JavaScript 有限語意

Acorn 解析 Ajax `.done/.fail`、原生及 jQuery DOM alias、常值文字／display／color，以及有限 select.value switch（字串 case、明確 break）。圖證據保存 selector、效果、來源及 `when` 選項值；工具只套用已知效果，不 eval。

重新使用的 Ajax 設定變數，僅可從同一 block 緊鄰上一個直接物件宣告／賦值取值；不得跨越未知呼叫、控制流程或非物件。記錄 configurationSource 並標 INFERRED，既有 scalar reassignment 規則不放寬。名稱遮蔽的 DOM／jQuery factory 不授權產生效果。事件 trace 保存呼叫及位置，避免複製整個 handler 導致報表溢位；不刪除未知行為或增加容量限制。既有 library signature 機制補上已知第三方套件，自有 minified 程式照常分析。

### 標記、片段與彈窗

c:import 常值片段參與圖與靜態頁組合，包含只含 import 的父頁；相對路徑只在安全且唯一的祖先檔案候選下推論，動態或歧義保留診斷。Struts styleId 投影成 DOM id；bean:write query 保留 `{field}` 未知參數、原式及來源，不捏造真實資料。JSP lexer 處理巢狀標籤中的引號；屬性替換／移除以 lexer token 範圍進行，避免字串內的假屬性破壞頁面。

來源 data-toggle/data-bs-toggle 指定的 modal/offcanvas 直接開啟原節點，保存位置、style、hidden，關閉時還原，避免 clone 導致重複 ID 和表單值遺失。工具在開窗時派送圖中已解析的 shown.bs.modal 模擬行為。HTML `target=_blank` 不再被誤判為 URL；真正 href/action 仍依圖處理。來源 script 與事件屬性保持移除，iframe 不允許 scripts。

### 快照決定性

連續生成 429 個產物測出 6 個檔案變動，來源圖維持一致。快照原本在 DOMContentLoaded 後擷取，改為等待本機載入完成、document.fonts.ready 與每張 img.decode()，再收集 layout／style／pixels；不啟用目標腳本。並對平行 include 收集的診斷排序，保留每一筆原文，避免完成順序影響輸出。新增延遲 CSS 的真實 Chromium 反例，確認擷取前尺寸已定且來源 script 不執行。第一階段載入／字型等待後仍有 5 個變動，位置／樣式值一致，像素差異定位到 25×25 頭像，故再加顯式圖片解碼等待。進一步的 software／deterministic Chromium flags 與預繪也未消除頭像縮放差異，未保留無效的額外設定。此為新增 WF-023：診斷順序已修正，像素一致性仍未解決；嚴格產物雜湊比對維持 FAIL，原失敗雜湊及結果保留，不以圖穩定冒稱像素一致。

### 示範資料與模板

延伸 ADR 0092 的 simulationData v1：同一 handler 可為不同 repository 產生多個 readAll model，單一 collection 必須有唯一 model；多 readOne／混合寫入／歧義不提供推測契約。只有可證明的 try 內單一 save 與空 catch、無 finally／條件／額外寫入時，可輸出 `conditional:true`；UI 明示示範成功／例外兩條路徑，例外不寫工具資料。

Thymeleaf 常值 `*{field}` 投影成 name；未知 th:field 覆蓋靜態 fallback 並保留未知證據。表格與 select 選項使用已證明的模型／基本欄位；有限常值文字和已證明欄位串接可以產生 label，數字運算、函式、日期、關聯與服務計算不執行。不把可示範 CRUD 說成資料庫／業務邏輯等價，重載重置工具 session。

## 驗收更正與後果

歷史 B08 斷言尋找來源不存在的 `#deposit-card`，並未先打開 offcanvas；來源實際為 `.deposit-card`。原 runner／斷言及 FAIL 證據完全保留，不在產品捏造 id。新增獨立案例按來源開窗，驗證四種表單顯隱、關閉重開與唯一 ID。新增 API 獨立比對逐個核對來源呼叫、方法及 backend 宣告，不以「發現 CALL_API」代替正確路由；來源缺少 handler 另列，不列入成功分母。

完整數據、修正矩陣、原型操作、來源完整性、決定性及重現入口見 [WP72 報告](../reports/WORKFLOW_BATCH3_FIXES_20261019.md)。原失敗基線維持不動；本批不能證明四套業務系統所有功能已完整還原。
