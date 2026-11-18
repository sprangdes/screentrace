# ADR 0156：R78 功能分組與心智圖、後端呼叫鏈、md 系統分析章節

## 背景

[改善計畫 2026-11-17](../IMPROVEMENT_PLAN_20261117.md) 階段 2：第 3 項（功能 → 流程 → 畫面的心智圖檢視，可標注整個功能）與第 4 項（md 補成系統分析文件）。待決問題記於 OQ-053；需求方於 2026-11-17 回覆「依你的建議繼續實作」，採用下列建議方案。

| 問題 | 決定 |
|---|---|
| 功能分組放在哪裡 | viewer 依圖中既有資訊推導（`shared/features.ts`，瀏覽器與 Node 共用），不改 schema |
| 使用者能否手動調整分組 | 不能；只顯示確定性結果。日後若加 AI 協助命名，須標示為推測 |
| 系統分析與審查結果 | 同一份 md，新增 §8～§11；附錄 A 不變 |
| 後端呼叫鏈深度 | 從處理程式起最多 4 層；超過時在最後一層註明未再追蹤 |
| `migration_target` | 預設維持原始需求（Spring Boot 4、Angular），可在工作區設定依專案改寫或設為 `"none"` 移除 |

## 決定

### R78-1 功能分組（確定性規則）

- 每個畫面依序套用：Struts module（專案有兩個以上 module 時）、處理程式類別（RENDERS／FORWARDS_TO 指向畫面的 HANDLER 的 `class` 或 `actionType`）、Tiles 定義名稱前綴（最後一個 `.` 之前）、網址前綴（第一個能區分畫面的路徑段，所有畫面共用的段落略過，與畫布分區同規則）。同一依據值至少兩個畫面共用才成組；最後只剩一個畫面的組併入「其他」。
- 功能 key 為「規則:值」（`module:/admin`、`class:demo.OwnerController`、`tiles:vet.page`、`url:/vets`、`other`），同一專案重新分析時不變。每個功能保留依據值的來源位置（最多 5 個）。
- 流程：功能內沒有其他畫面導入的畫面為入口，依導覽關係廣度優先列出；只在迴圈中的畫面從名稱最前者開始另一條流程。每個畫面只屬一條流程。排序一律以 Unicode 碼序（名稱、ID），與語系無關。

### R78-2 功能標注與繼承

- `ReviewState.featureDecisions?: Record<featureKey, Decision>`，`setFeature`、`featureDecision`；備註 `decisionNotes.features`。
- `effectiveScreen(graph, state, id)`：畫面自己的決定，未確認時用所屬功能的決定；`screenInherited` 表示來自功能。`deriveApiUsage`、`conflicts`、`statistics`（畫面計數、隨畫面移除）與帶 graph 的 `effectiveComponent` 改用有效決定；沒有功能標注時結果與 R77 完全相同。`statistics` 另回傳 `screensInherited`。
- 功能歸屬依 graph 物件快取（節點或關聯陣列換掉時重算）；沒有任何功能標注時不計算。

### R78-3 功能地圖（viewer）

- 左側清單的顯示方式新增「功能」（清單／檔案結構／功能）：清單依功能分組，主畫面在未開啟畫面時改為「功能地圖」——應用程式為根，功能為分支卡片（名稱、分組依據、畫面數與已確認數、保留／移除／未確認、備註），每條流程以畫面晶片依導覽順序排列；點晶片開啟該畫面，返回畫布時回到功能地圖。頂部列控制項數量不變。
- 隨功能決定的畫面在清單、畫布與功能地圖以較淡的標示或虛線框呈現，右側欄顯示「沒有個別標記，隨功能「X」保留／移除」；畫面自己的決定優先。

### R78-4 後端呼叫鏈（Java）

- `BackendCallChains`（`screentrace-parser-jsp`，JavaParser，與框架無關）：從 HANDLER 的類別與方法（Struts 沒有 `method` 時從 `execute`）開始，只追蹤「經由本類別欄位呼叫、欄位型別為專案內類別」的方法呼叫；同類別的方法呼叫視為本方法的一部分。介面有唯一專案實作時繼續追蹤；有多個實作為 AMBIGUOUS、同名類別多個亦為 AMBIGUOUS，不再往下；沒有專案實作（Spring Data repository、MyBatis mapper）時呼叫成立但不往下；找不到方法宣告為 UNRESOLVED。函式庫型別不列入。
- 層級：`@Service` → SERVICE；`@Repository`、`@Mapper`、繼承 `*Repository` → DAO；否則依名稱後綴（Service、Dao／DAO／Repository／Mapper）並標明依據為「名稱」；其餘為 CLASS。
- 結果寫入 HANDLER 的 `backendCalls` attribute（JSON 陣列：depth、from、to、layer、layerBasis、resolution、reason、source），並加一筆 `BackendCallChains` evidence。沿用 `simulationData` 的 attributes 擴充點，schema 不變。每個處理程式最多 200 筆。Spring（`SpringProjectAnalyzer`）與 Struts（`StrutsProjectAnalyzer`）分析完成後套用。

### R78-5 md §8～§11 與 format_version 5

- 新章節位於 §7 之後、附錄 A 之前，所有版本都輸出：§8 功能與流程（每個功能的依據、來源與流程表；用途摘要只由事實組成：按鈕數、欄位數、呼叫的 API、前往的畫面）、§9 後端呼叫鏈（`backendCalls` 格式不符時略過，不猜測）、§10 資料欄位對照（畫面欄位 ↔ BINDS_TO 的表單模型與欄位型別 ↔ 表單送出或呼叫的 API request 欄位 ↔ 檢核規則）、§11 移除影響範圍（移除畫面：仍保留的來源畫面、受影響的 API 與其狀態、共用樣板是否仍被保留畫面使用；移除元件：失去的導覽與 API 呼叫；移除 API：仍保留的呼叫來源、處理程式是否還服務其他 API）。
- §3 的畫面小標題改用有效決定；隨功能決定時加一行說明功能 key。§8 的畫面決策欄標「(隨功能)」。
- 有功能標注或功能備註時輸出 format_version 5：v4 的鍵加 `feature_decisions`，`decision_notes` 另含 `features`；否則沿用 4 或 1。匯入接受 1～5；功能 key 不在目前分析中時列為 orphan（`{featureKey}`）並保留。
- `migration_target`：報表資料 `migrationTarget` 未設定時為預設值；為物件時使用其 backend、frontend；為 null 時不輸出這三行。來源是工作區設定 `migrationTargets`（依專案路徑，值為 `{"backend","frontend"}` 或 `"none"`；每個值 1～80 字、不含控制字元，格式錯誤時載入設定失敗並指出專案），由 CLI 傳給報表產生器（`MigrationTarget`）。

## 測試

- 新增 `r78-features.test`（6：規則優先序與來源、module／Tiles、迴圈流程、繼承、v5 往返與 orphan、§9～§11、migration_target）、`r78-feature-map.e2e`（2）、`BackendCallChainsTest`（4）、`MigrationTargetInjectionTest`（2）、`WorkspaceMigrationTargetTest`（2）。
- 修改的既有斷言：`golden/review.md`、`golden/malicious-review.md`、`golden/review-v4.md` 加入 §8～§11；刪去該段後與修改前逐位元組相同（以腳本逐檔比對）。`wp40-md-decision-equivalence` 的整份 md 雜湊更新為新值；刪去 §8～§11 後的雜湊等於原值。其他斷言不變。

## 後果

- 功能分組只是整理方式：規則看不出功能時，畫面落在「其他」或依網址分組，需要人判讀。
- 後端呼叫鏈只涵蓋欄位注入的呼叫；經區域變數、靜態方法、反射或框架設定（XML bean、AOP）的呼叫不列入，§9 的說明文字告知 AI 不得自行補齊。
- 舊版報表開啟 v5 md 會因未知版本拒絕。
