# ADR 0094 — 第四批公開專案的有限流程修正

- 日期：2026-10-19
- 狀態：採用；需求方要求「接著修正這些問題」。
- 工作包：WP74；分支 `fix/workflow-restoration`。

## 決定

沿用 WP73 三個固定 commit、244 個原始檔案雜湊及原始失敗結果。修復分析與離線模擬，不建置、啟動、修改受測系統，不執行其 Java／JSP／JavaScript，不連線外部服務、資料庫或 CDN。Graph 2.2、Preview 2 與相依套件不變。

### 回傳與 URL

- Java `@Bean` 中直接建立且直接回傳的 `InternalResourceViewResolver` 可貢獻 prefix／suffix；未設定者採官方空字串預設。僅接受同層、單次、字面 setter；條件設定、動態值、物件逸出不貢獻設定。RENDERS 保留設定方法來源證據。
- 無別名、未逸出的空 `ModelAndView` 可經有限 if／else setter 路徑解析。每個 return 保留可達條件及 setter 行列；任何可達路徑沒有可證明目標，該 return 保持未知。既有未初始化局部變數的有限分支賦值仍保留。
- String 相對 redirect 依處理器所有來源請求路徑推導；只有唯一可證明的結果才採用。允許直接導向存在的公開 `src/main/webapp` JSP／HTML；不公開 WEB-INF、classpath 模板或假設部署 context。原始 `RedirectView` 不套用公開資源捷徑。
- Thymeleaf 的簡單變數三元 action 與完整 JSTL choose 的字面 URL 集合保留所有分支。JSTL 限同來源 page scope、一個初值、同層完整 when／otherwise、每分支單一字面賦值；未知寫入、include 寫入、scriptlet、自訂標籤、外層條件、動態值均拒絕。此有限例外由本次修正授權，優先於 ADR 0005／OQ-013 原本對 c:set 的全面排除；不擴展到任意 EL 求值。
- 巢狀 URL 標籤若只有查詢值動態而路徑是字面，可保留路徑及未知查詢樣板；不呼叫 getter／toString。

### 共用圖、資源與事件

- Thymeleaf 正規化須為冪等操作，讓 markup 與 JS 事件沿用同一個來源控制項 ID。href／action／onclick 仍由離線包移除；不恢復來源事件執行。
- 樣式參照以 `SOURCE_ARTIFACT`／`STATIC_RESOURCE_REFERENCE`、`DECLARED_BY` 及 `StaticResourceParser` 證據進圖；擷取只消費圖中的投影。普通資源解析仍需唯一來源請求目錄或明確公開來源 alias，外部資源不抓取。
- DOMContentLoaded、不可變 DOM alias、可證明的元素存在檢查、單一 classList 操作，以及完整 aria-expanded／show 原生切換形狀可輸出有限操作資料。
- 內嵌 keypress 僅支援有限字面字元集合對 event.key 的 test；不編譯任意來源 regex。日期連動限完整的 Date(this.value)、整數天數增量、ISO 日期 min 設定形狀；viewer 用自身 UTC 日曆運算回放，沒有執行來源 Date 呼叫或任意程式碼。
- 擷取前同步唯一、可見、可用的來源原生 autofocus；僅呼叫工具的原生 DOM 對焦，不執行來源事件。避免樣式在對焦前、截圖在對焦後的時序差異。直接綁定證據 JSON 使用排序後的鍵。
- 下拉選單初始收合投影限同畫面 CONTAINS 所屬元件、無 guard／parent、AcornStaticAnalyzer CONFIRMED 的 toggleDisclosure；來源唯一按鈕 aria-expanded=false、唯一目標沒有 show、inline／本地 CSS 沒有明確 display 規則才加入 hidden，並標記離線替代。保留原 S06 檢查，新增 X06 實際可見狀態失敗與修正證據。
- 工具只替來源圖示控制項中沒有 pseudo glyph、寬度為零且非明確隱藏的空圖示補上 `◇`，並標示離線替代符號。已有本地圖示不覆蓋，沒有下載外部圖庫。

### 模型與示範狀態

- `SpringModelFeedback` 支援來源已證明的 Model／ModelMap.addAttribute 常值回饋；簡單 th:if feedback key 以空的初始示範模型隱藏，選定對應回傳分支後更新。
- `SpringSubmittedModel` 證據 JSON v1 記錄單一直接 @ModelAttribute 的 scalar 欄位到表單欄位對應，限單一 return 與可證明的 public、非 static、直接 getter／setter。只回放實際存在且唯一的表單控制項字串；支援來源明示的三種日期顯示格式。不推測巢狀 guest／room、生成 ID、價格、服務結果或持久化。
- readOne 缺少示範列鍵時清除舊選取並允許已知目的頁導覽；明確存在但無效的列鍵仍拒絕。delete／upsert 不放寬。
- 自訂 Hibernate DAO 及外部 HTTP 回應目前沒有足夠的既有示範狀態契約。新解鎖的資料回顯失敗保留為待處理缺口，不以欄位名稱猜測成功寫入或偽造列表。

## 驗收與限制

保留原 H11、X03 斷言與 FAIL。來源成功頁使用 dd-MM-yyyy、姓名依賴 guest lookup，且完全沒有電話顯示欄位；X04 改用來源實際存在的日期欄位另驗，不替來源加電話欄位。數量完整、可導覽、資料回顯與來源缺頁分開記錄，不能由單一通過率宣稱功能完全等價。

詳見 修正報告。
