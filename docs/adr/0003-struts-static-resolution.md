# ADR 0003 — Struts 1 靜態解析與拒絕不支援框架

## 背景

舊 Struts adapter 只讀部分 XML，來源行號固定為 1、元件 ID 含行號，且不區分 Dispatch 方法。WP2 要求完整設定、Validator、Tiles、taglib 與 Spring-managed Action；禁止啟動或載入目標類別。

## 選項

1. 以文字匹配 Java 呼叫或載入目標 Action 類別推導。
2. 共用既有 JavaParser AST 與安全檔案讀取，SAX 建立具來源行號的 XML DOM，保留未解析診斷。

## 決定

採用選項 2。adapter-struts 新增對 repo 已使用的 `javaparser-core` 直接相依；版本仍由根 pom 釘選為 3.26.1，沒有引入新版本或新的套件種類。必要性為解析繼承、Dispatch 方法、字串常值 findForward、getKeyMethodMap 與 ActionErrors，避免以 regex 解析 Java。已查閱本機 Maven 的 javaparser-parent 3.26.1 metadata：提供 LGPL 3.0 與 Apache License 2.0；採 Apache 2.0 授權選項，沿用 Spring adapter 的既有相依政策。npm audit 與 Dependency-Check 實測結果列於 M1 回報；未把本機測試宣稱為遠端 CI。

- `StrutsFrameworkDetector` 在任何 JSP / Spring contribution 前拒絕 Struts 2：struts.xml、POM Struts 2 相依、Java import/package/完整型別的 AST 訊號，以及 Gradle struts2-core 訊號。Java 註解與字串提及不構成框架訊號。CLI 同樣拒絕，不生成部分 Spring 報表。
- XML 維持 SafeProjectFiles 的 DOCTYPE/外部 entity 與 bounded read 政策；移除外部 DOCTYPE 時保留換行。設定元素保留真實 SAX 行號。
- 所有 action mapping 屬性與 DynaActionForm form-property 保留；global forward、exception、plugin 以 SOURCE_ARTIFACT metadata 表達。global forward 不再假扮 API endpoint。例外的 path 仍保留原屬性，不虛構實際發生的 runtime 分支。
- web.xml 的 config/module init-param 對應到 Struts 模組前綴。重複路由保留所有 HANDLED_BY 候選與 DUPLICATE_ROUTE 診斷，元件觸發關係保持 AMBIGUOUS。
- DispatchAction 的 parameter 由 URL query、該元件 property/value 或同一表單的 hidden 欄位取得；MappingDispatchAction 用 mapping parameter；LookupDispatchAction 僅接受 AST 字串常值 key/method 與已配置 message-resources 的唯一靜態值。不同表單、未配置資源、條件式 map.put、動態值或多個方法候選不推測。
- 呼叫到的實際方法必須是 public、回傳 ActionForward、具備 ActionMapping / ActionForm / HttpServletRequest / HttpServletResponse 四參數；可沿專案內確定的父類別追蹤，方法 source 指向宣告處。Dispatch 專用 endpoint 以 method parameter/value 納入穩定鍵，原始 route 保留在 path；沒有 servlet-mapping 證據的預設 .do 別名僅標 INFERRED，不升級為 CONFIRMED。
- `mapping.findForward` 的字串常值解析可能的 forward；非常值保留 STRUTS_FORWARD_EXPRESSION。ActionForm.validate 的 ActionErrors.add 無條件欄位規則標 INFERRED；條件、迴圈、try 或 lambda 中的檢核保持未解析，不推導規則。
- Validator XML 保留 depends、參數、訊息 key 與 validator-rules 定義；缺定義不捏造內建規則，保留 UNRESOLVED。框架來源在 evidence.detail（STRUTS_VALIDATOR / ACTION_FORM），核心 layer 為 SERVER。
- Tiles extends 合併父設定並保留子覆寫，建立 template/put-attribute/put 與巢狀定義的 INCLUDES；循環、重複或未知目標保留診斷。
- Struts taglib 元件以共用容錯 MarkupTag scanner 擷取；scanner 忽略註解、scriptlet 與 script/style 內的假標籤。元件鍵包含原始 tag、屬性、kind、同類出現序，不包含行號；共用 include 元件有多個畫面 owner。
- 導向 backend endpoint 的連結行為為 NAVIGATE（不是 SUBMIT_FORM）；Behavior 允許 endpoint 作為導頁目標。既有 NAVIGATES_TO edge 仍只指向 SCREEN，語意未變。
- 合併只有全部 contribution 都使用嚴格 2.2 時才標為 2.2；包含尚未遷移的 Spring 2.1 contribution 時維持相容版本 2.1，仍保留 behaviors/rules 並驗證其證據。這不是將舊資料補成 CONFIRMED。

## 後果

不確定結果明確列在 diagnostics；review 不會因 re-analysis 的行號變動改換元件 ID。舊 line-based ID 可能成 orphan，不能自動猜對應。完整 JSP 控制流程與 JavaScript 行為仍由 WP3/WP4 處理；現有 renderer 的畫面忠實度與單一 HTML 仍屬 WP6/WP7。沒有執行、編譯或修改目標專案。
