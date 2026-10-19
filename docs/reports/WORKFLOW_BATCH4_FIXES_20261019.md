# WP74 — 第四批公開專案問題修正

日期：2026-10-19。分支：`fix/workflow-restoration`。延續 [WP73 原始驗收](COMPLETENESS_BATCH4_20261019.md)，固定三個 repository／commit，沒有換專案或放寬原始斷言。

## 修正結果

| 項目 | 結果與實測證據 |
|---|---|
| WF-024 Java ViewResolver | 支援 suffix-only Bean 與空 prefix 預設，連到實體 JSP；App1 的 10 個 return 檢查全部通過。 |
| WF-025 相對 redirect | 依唯一請求目錄連到公開 JSP，登入／註冊路徑通過；外部、私有及不能唯一證明的目的不猜測。 |
| WF-026 ModelAndView 分支 | 空物件的有限 setter 路徑保留成功／失敗畫面與來源條件；L03 通過。 |
| WF-027 條件表單 action | JSTL choose 三路及 Thymeleaf 三元兩路完整保留；S07、H07 通過。S09 的目的畫面集合已恢復，資料回顯另列 WF-035。 |
| WF-028 控制項 ID | Thymeleaf 正規化冪等，刪除確認掛回同一個控制項；H08 取消不換頁、不改列表。 |
| WF-029 原生事件 | 支援 DOMContentLoaded、元素 alias、classList 及完整 aria-expanded／show 切換形狀；S05、S06 通過。 |
| WF-030 keypress | 有限字面字元集合轉成工具的按鍵防止預設操作；L07 的 `12a3` 成為 `123`；另有 X05 驗證 Enter 也依原始 regex 被擋下，修正前 false、修正後 true 的預設阻擋旗標均保留。 |
| WF-031 日期連動 | 直接日期增量形狀轉成工具運算；X02 退房 min 為 `2026-11-02`。 |
| WF-032 本地 CSS | 13／13 本地 CSS 參照進入離線包；X01 背景 `rgb(245, 247, 251)`、system-ui 通過。9 個外部參照仍不抓取。 |
| WF-033 條件回饋 | Model.addAttribute 字面錯誤回饋依目的分支投影；H03 初始錯誤訊息隱藏，登入候選仍保留。 |
| NC-004 提交資料 | 單一直接 @ModelAttribute 的 scalar 欄位可回放；X04 兩個日期依來源 `dd-MM-yyyy` 顯示。電話不在來源頁面，姓名依賴 guest lookup，均未假造。 |
| NC-005 readOne | 沒有示範列鍵時清除選取並允許已知目的頁；H09 通過。明確無效列鍵仍拒絕，delete／upsert 不放寬。 |
| EXT-001 離線圖示 | 只替沒有本地 glyph 且寬度為零的來源圖示補 `◇`；S03、S06、S08 可操作。本地 glyph 與隱藏圖示不覆蓋。 |
| WF-037 重跑時發現 | 原生 autofocus 造成樣式擷取時序不同；同步後五次、每次 46 份產物一致。只重建 username 的邊框色與陰影，即精確重現修正前兩個 SHA-256；見 [重現證據](completeness-batch4-20261019/after/focus-style-reproduction.json)。 |
| WF-038 可見狀態複核 | 下拉選單初始已顯示但 aria=false；只對圖中已證明的切換行為及來源收合狀態補離線 hidden，明確本地 display 不覆蓋。X06 的收合→展開→收合實際可見狀態通過；原 S06 斷言保留。 |
| WF-034 本輪解鎖後發現 | 巢狀 URL 標籤的查詢值含 `${entity.id.toString()}` 時，保留字面路徑及未知查詢值，不執行 getter；S08 通過。 |

這些是受限的分析／模擬修正，不能解讀為三個原系統的業務功能已完全等價。

## 尚未解決的資料回顯

| ID | 專案／案例 | 已證明與限制 |
|---|---|---|
| WF-035 | demo-struts1；S09 | 可以選擇 create／update／delete 的可能目的畫面，但自訂 Hibernate DAO 的寫入、交易結果與分頁查詢尚未建立示範狀態契約。選擇列表後沒有帶入 artist／track；保留 FAIL。 |
| WF-036 | App1Assignment5；L08、LJ2 | `/Addbook` 已連到 bookListing.jsp；BookService 經外部 `HttpURLConnection` POST，再 GET 清單。沒有外部回應資料契約，尚不能把提交資料確定回填到 GET 清單；保留 FAIL，不以同名欄位假定成功。 |

原旅館專案仍缺 `visitor/cancel-booking.html`、`visitor/cancel-success.html`、`visitor/my-bookings.html`；維持 SOURCE_MISSING_VIEW，沒有替來源新增不存在的頁面。這三個專案沒有來源 frontend Ajax，0／0 不能作為 Ajax 正確性證據。

## 來源預期更正

- H11 的 ISO 日期預期與來源 `dd-MM-yyyy` 不符，姓名依賴 guest lookup，原斷言與 FAIL 保留。
- 重新複核發現，WP73 的 X03 電話預期同樣有誤：`booking-success.html` 沒有電話欄位。原 X03 斷言與 FAIL 保留；沒有為通過測試新增電話欄位。
- 新增 X04，僅驗證來源確實顯示、可由直接 ModelAttribute 證明的兩個提交日期。X04 PASS。X03 日期部分也已通過，只剩錯誤的電話斷言。
- X05 早期探針把 onkeypress 來源列寫為 46，實際屬性在第 45 列；僅更正新探針與複核記錄，舊失敗檔保留。
- 原 31 項操作結果與 5 個旅程照原樣報告；有效案例分母另列，不把錯誤案例悄悄改成 PASS。

## 驗證

最終機器結果見 [validation-summary.json](completeness-batch4-20261019/after/validation-summary.json)。

- 原 31 項操作：28 PASS／3 FAIL（S09、L08、H11）。原 5 旅程：3 PASS／2 FAIL（LJ2、含錯誤 H11 的 HJ2）。
- 補充 X01、X02、X04 全通過；原 X03 因來源不存在的電話斷言維持 FAIL。另有 X05 的 Enter 與 X06 的選單可見狀態邊界回歸通過，不混入原 33 項分母。
- 有效 33 項：31 PASS／2 FAIL；仍失敗的是 S09、L08 的資料回顯。
- 44 個回傳檢查：41 PASS、3 SOURCE_MISSING_VIEW；所有存在的實體來源畫面都對應正確。
- 32 頁面／片段、52 路由、179 來源控制項全部保留；必要節點沒有來源證據缺漏。
- 13／13 本地樣式通過；操作環境 pageerror 0、HTTP(S) 請求 0。
- 244 個受測檔案雜湊與 checkout 狀態不變；99 個原始分析／預覽／截圖產物雜湊不變。修正結果另存 `after/`，原始 FAIL 截圖及 JSON 未覆寫。
- 完整回歸 787 項：786 通過、1 略過；Java 437（1 略過）、JS 76、capture 74、viewer 114、E2E 86。最後的返回邊界與鍵排序另有 26 項定向測試通過。
- 五次獨立 JVM／Chromium 執行，每次 46 份圖、預覽、樣式、HTML 與截圖雜湊一致，見 [determinism.json](completeness-batch4-20261019/after/determinism.json)。修正前偶發差異、未再現的舊重跑及精確雜湊重建也保留，沒有以偶然通過取代失敗證據。
- 文件產物尚未齊備時曾有文件連結檢查失敗；產物建立後完整回歸通過，舊日誌保留為 `viewer-incomplete-docs.log`、`viewer-pending-determinism.log`。
- 完整 Java／JS／capture／viewer／E2E 的計數與日誌見 [standard-suite.json](completeness-batch4-20261019/after/standard-suite.json)。

## 重現與交付

完整來源 URL、固定 commit、source root 與原始雜湊仍在 [baseline.json](completeness-batch4-20261019/baseline.json)。使用相同三個 checkout，建置 ScreenTrace 本身後，將 `ST_BATCH4_OUTPUT` 設為獨立修正輸出目錄、`ST_BATCH4_RESULTS` 設為 `docs/reports/completeness-batch4-20261019/after`，依序執行 `analyze.py`、`audit-census.py`、`audit-returns.py`、`audit-styles.py`、`workflows.mjs`、`supplementary.mjs`、`check-integrity.py`。`verify.py` 執行工具的完整回歸。

原操作腳本及 supplementary 的 exit code 1 是保留失敗斷言的真實結果，不能當成全綠。補驗與完整回歸的原始輸出、修正後截圖、來源預期更正及產物雜湊均收在 [after/](completeness-batch4-20261019/after/)。

設計範圍與排除條件見 [ADR 0094](../adr/0094-public-batch4-workflow-repairs.md)。
