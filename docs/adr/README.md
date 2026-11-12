# ADR 索引與現況

這份索引依主題列出 `docs/adr/` 的全部決策紀錄，並標出哪些已被後來的 ADR 取代（HC-008，[ADR 0142](0142-r51-adr-index.md)）。逐輪的工作紀錄在 [ROADMAP](../ROADMAP.md)，健檢待辦在 [HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md)。

**狀態的判定**：只有在後來的 ADR 明確寫出取代、退場，或刪除了鎖定該功能的測試時，才標為「已被取代」或「部分被取代」，並連到取代它的 ADR；其餘標「有效」。各 ADR 的內文不改，保留當時的紀錄。

**新增 ADR 時**：在對應主題的表格加一列；若它取代了舊決策，同時更新舊 ADR 那一列的狀態。

## 基線、範圍與 schema

分析以靜態解析為主，不執行目標程式；Struts 1 與 Spring 為主要支援框架，Struts 2 明確拒絕。正式輸出是 schema 2.2 起的 Application Graph（R18 為 2.3、R19 為 2.4），舊 schema 與舊入口已退場。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0001](0001-adjustment-baseline.md) | 調整需求優先序與基線界線 | 有效 |
| [0002](0002-behavior-model-and-stable-ids.md) | 行為模型、框架中立檢核與相容版本 | 有效 |
| [0003](0003-struts-static-resolution.md) | Struts 1 靜態解析與拒絕不支援框架 | 有效 |
| [0012](0012-workspace-evidence-namespace-and-privacy.md) | 工作區證據命名空間與隱私 | 有效 |
| [0015](0015-schema-two-production-and-historical-compatibility.md) | schema 2.2 正式輸出與歷史相容 API | 有效 |
| [0016](0016-historical-report-entries-and-schema-retirement.md) | 歷史報表入口與正式 schema 退場 | 有效 |
| [0017](0017-source-export-test-root.md) | 原始碼匯出中的測試根目錄 | 有效 |

## Struts adapter

`StrutsProjectAnalyzer` 只保留分析流程，功能拆在同一個 package 的類別（R41）。struts-config、web.xml、Tiles、Validator、DispatchAction、萬用字元 action 與訊息資源都有對應的 ADR；XML 與 JSP 結構以 XML parser 與 `MarkupTag` 讀取（R46，`c:url` 前處理仍以 regex 改寫），無法證明的對應標為 UNRESOLVED，不猜測。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0073](0073-r16-unproven-servlet-test-expectations.md) | R16 unproven servlet mapping test expectations | 有效 |
| [0074](0074-r16-route-aliases-and-tiles-screen-boundary.md) | R16 路由別名與 Tiles 畫面界線 | 有效 |
| [0075](0075-r16-wp54-struts-caller-correction.md) | R16 WP54 Struts 呼叫來源補正 | 有效 |
| [0076](0076-r16-struts-wildcard-version-guard.md) | R16 Struts 萬用字元順序與版本證據 | 有效 |
| [0077](0077-r16-page-load-action-callers.md) | R16 Struts 頁面載入 action 呼叫來源 | 有效 |
| [0078](0078-r16-validator-field-binding-and-dispatch-actions.md) | R16 Validator 欄位關聯與 DispatchAction 分派 | 有效 |
| [0079](0079-r16-struts-messages-and-action-category.md) | R16 Struts messages and action category | 有效 |
| [0080](0080-r16-jsf-mixed-module-boundary.md) | R16 JSF mixed-module boundary | 有效 |
| [0081](0081-r16-wp59-struts-audit-and-documentation.md) | R16 WP59 Struts 重新稽核與文件邊界 | 有效 |
| [0082](0082-r16-wp56-wp58-acceptance-corrections.md) | R16 WP56–WP58 驗收補正 | 有效 |
| [0083](0083-r16-tiles-page-screen-names.md) | R16 Tiles 頁面畫面名稱 | 有效 |
| [0087](0087-tiles-preview-slots-and-action-forward.md) | Tiles 版型預覽、action 層 forward 與 c:url 表單目標 | 有效 |
| [0104](0104-oq039-struts-query-link-aliases.md) | Struts 直接連到 JSP 的導覽保留查詢字串 alias（OQ-039） | 有效 |
| [0132](0132-r41-split-struts-project-analyzer.md) | R41 拆分 StrutsProjectAnalyzer | 有效 |

## Spring MVC／Spring Boot adapter

Controller、回傳 view、表單綁定與伺服器端檢核以 JavaParser 靜態分析，不執行方法；同一個 Java 檔在 Spring adapter 內只解析一次（`ParsedJavaUnits`）。端點與請求的對應、API 契約與字面路徑優先規則見下列 ADR。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0013](0013-request-behavior-endpoint-correlation.md) | 請求行為與後端端點對應 | 有效 |
| [0014](0014-server-contracts-and-validation.md) | API 契約與 SERVER 檢核的靜態來源 | 有效 |
| [0037](0037-controller-return-flow.md) | Controller 回傳與表單畫面流程 | 有效 |
| [0102](0102-r18-spring-api-paths-and-external-call-notes.md) | R18 WP82 的 Spring API 選路與外部呼叫附註 | 有效 |

## JSP／標記與 URL

JSP、JSPF、tag file、Tiles 與有限的 Thymeleaf 以 `MarkupTag` 等 parser 解析；URL 對應與 context path 由共用 URL 引擎處理，有證據的例外才放寬。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0005](0005-source-local-url-variable-exception.md) | 有證據的同來源 URL 變數例外 | 有效 |
| [0006](0006-shared-markup-graph-contribution.md) | 共用標記圖貢獻與來源所有權 | 有效 |
| [0008](0008-script-context-prefix-and-static-dom.md) | script src 的 context 前綴例外與靜態 DOM | 有效 |
| [0011](0011-url-resolution-context-and-yaml.md) | 共用 URL 對應與明確 context path | 有效 |
| [0036](0036-jsp-tag-file-expansion-and-relative-url.md) | Bounded JSP tag-file expansion and relative URL evidence | 有效 |
| [0045](0045-static-visible-component-names.md) | WP21 靜態可見元件名稱 | 有效 |
| [0046](0046-endpoint-presentation-groups.md) | WP22 頁面路由與 API 呈現 | 有效 |
| [0067](0067-r14-static-route-inference-and-security.md) | R14 靜態路由推定與安全導向證據 | 有效 |
| [0137](0137-r46-parse-markup-instead-of-regex.md) | R46 以 parser 讀取 XML 與 JSP 結構，取代 regex | 有效 |

## JavaScript 與 React

`screentrace-js` 以 AST 分析 JavaScript（Acorn）與 React／TSX（@babel/parser），不執行程式。React 畫面以靜態重建呈現，路由 Guard、身分條件、狀態值與網址參數都以可證明的事實建立變體；`react/analyzer.mjs` 已拆成多個模組（R44）。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0007](0007-javascript-parser-and-json-boundary.md) | JavaScript AST 與 JSON 邊界 | 有效 |
| [0009](0009-javascript-public-api-semantics.md) | JavaScript 公開 API 語意表與未解析來源 | 有效 |
| [0010](0010-javascript-static-tracing-and-graph-contribution.md) | JavaScript 靜態追蹤、值與 canonical graph | 有效 |
| [0088](0088-react-ast-analysis.md) | Spring Boot + React 前端改用 AST 分析 | 有效 |
| [0089](0089-react-static-preview.md) | React 畫面的靜態重建預覽 | 有效 |
| [0096](0096-r18-audience-facts.md) | R18 畫面渲染事實與 schema 2.3 | 有效 |
| [0097](0097-r18-audience-variants.md) | R18 身分畫面變體與保守外框投影 | 有效 |
| [0098](0098-r18-returned-destinations-and-external-login.md) | R18 函式回傳目的地與外部登入往返 | 有效 |
| [0099](0099-r18-review-corrections.md) | R18 第一階段驗收補正 | 有效 |
| [0100](0100-r18-context-navigation-and-route-facts.md) | R18 第二次驗收補正——Context 導覽投影與固定路由事實 | 有效 |
| [0101](0101-r18-dispatch-props-and-optional-display.md) | R18 第二階段的分派表、字面 prop 與 optional 條件顯示 | 有效 |
| [0103](0103-r18-preview-state-page-components-and-style-packages.md) | R18 第三階段——預覽狀態、頁面元件與樣式缺件診斷 | 有效 |
| [0105](0105-oq036-state-value-reachability.md) | React 狀態值可達性（OQ-036） | 有效 |
| [0106](0106-oq038-query-entry-variants.md) | 查詢參數進入變體（OQ-038） | 有效 |
| [0115](0115-r24-optional-access-on-false-object.md) | R24 角色判定認得「物件為否時的可選存取」 | 有效 |
| [0116](0116-r25-query-parameter-decided-by-link.md) | R25 網址參數由連結決定，不算角色條件 | 有效 |
| [0117](0117-r26-early-return-helpers.md) | R26 沿著提早回傳算出輔助函式的結果 | 有效 |
| [0118](0118-r27-entry-renders-plain-version.md) | R27 入口只開啟不需要網址參數的畫面 | 有效 |
| [0135](0135-r44-split-react-analyzer.md) | R44 拆分 react/analyzer.mjs | 有效 |

## 角色（persona）流程

角色設定與身分維度在 schema 2.4（R19）。報表依角色呈現流程圖（R21）；角色頁的版面現在以 R32（ADR 0123）為準。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0107](0107-r19-persona-settings-and-dimensions.md) | R19 角色設定、身分維度與 schema 2.4 | 有效 |
| [0108](0108-r19-persona-verdicts.md) | R19 畫面與導覽角色判定 | 有效 |
| [0109](0109-r19-persona-flows.md) | R19 角色流程可達性 | 有效 |
| [0110](0110-r19-dimension-matching-and-shell-redirects.md) | R19 身分維度比對與外框重導 | 有效 |
| [0111](0111-r20-persona-viewer.md) | R20 報表呈現角色流程 | 部分被取代：角色流程的呈現改由 [0112](0112-r21-persona-presentation.md) |
| [0112](0112-r21-persona-presentation.md) | R21 角色流程改以流程圖呈現 | 有效 |
| [0113](0113-r22-persona-comparison.md) | R22 角色比較依可見角色分組 | 已被取代：[0114](0114-r23-persona-page.md) |
| [0114](0114-r23-persona-page.md) | R23 角色頁改用 API 頁的版面 | 部分被取代：版面改由 [0123](0123-r32-api-persona-graphics.md) |

## 預覽擷取與封裝

`screentrace-capture` 以 Playwright Chromium 重建靜態預覽，不執行目標腳本；擷取同時開多個 page、依畫面順序合併（R47），樣式只記和預設值不同的屬性，資源以相對於分析目錄的路徑記錄（R42）；封裝只保留 `packStandaloneDocuments`（R31）。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0018](0018-complete-reconstructed-preview.md) | 完整重建預覽與去重樣式契約 | 有效 |
| [0020](0020-viewer-projection-and-preview-pack.md) | 檢視器關聯投影與預覽封裝 | 有效 |
| [0031](0031-component-library-field-bounds.md) | manifest 欄位與集合上限 | 有效 |
| [0047](0047-report-local-resource-normalization.md) | OQ-016 報表讀取層的本地資源識別 | 有效 |
| [0050](0050-preview-first-cards-and-thumbnails.md) | WP24 縮圖主體卡片與高解析 PNG | 有效 |
| [0051](0051-complete-static-page-prototype.md) | WP25 完整靜態頁面檢視與離線事件邊界 | 有效 |
| [0054](0054-expansion-anchor.md) | 原始來源展開錨點（R7／OQ-017） | 有效 |
| [0061](0061-real-path-boundaries-and-friendly-errors.md) | 以實際路徑判定邊界並回報可理解的錯誤 | 有效 |
| [0122](0122-r31-retire-inline-css-pack.md) | R31 移除 capture 舊的 inline CSS 封裝入口 | 有效 |
| [0133](0133-r42-output-relative-style-resources.md) | R42 擷取的樣式資源改記成相對於分析目錄 | 有效 |
| [0138](0138-r47-concurrent-preview-capture.md) | R47 預覽擷取多頁同時處理，樣式只傳回和預設值不同的屬性 | 有效 |

## 報表檢視器（viewer）

報表是單一離線 HTML（ADR 0019），R17 起只保留「畫面」「API」兩頁（ADR 0084），之前許多頁面與介面已退場。畫布、聚焦關聯線、API 頁與方法標籤、模擬與覆蓋率依下列 ADR；API 狀態的保留／移除標記只在 viewer 判定（R30）。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0019](0019-viewer-build-and-csp.md) | 單檔檢視器建置、資料注入與 CSP | 有效 |
| [0021](0021-retire-historical-viewer.md) | WP7 E 舊檢視器與 HTTP 入口退場 | 部分被取代：保留的 `packDocuments` 已由 [0122](0122-r31-retire-inline-css-pack.md) 移除 |
| [0035](0035-focused-screen-relations.md) | 聚焦畫面的四周 SVG 關聯 | 有效 |
| [0038](0038-screen-names-and-oq014-assertions.md) | 畫面名稱與 OQ-014 限定呈現斷言 | 有效 |
| [0039](0039-navigation-layout-diagnostics-and-tag-labels.md) | 全站導覽、格狀流程與可讀明細 | 有效 |
| [0040](0040-viewer-redesign-assertions.md) | R4 UI1 外殼與被取代的呈現斷言 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0041](0041-viewer-redesign-assertions.md) | R4 UI2 畫布與畫面決策控制項 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0042](0042-viewer-redesign-assertions.md) | R4 UI3 分頁、可見標籤與直接確認 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0043](0043-viewer-redesign-assertions.md) | R4 UI4 API 主從清單 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0044](0044-viewer-responsive-assertions.md) | R4 UI5 響應式與實際鍵盤驗證 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0048](0048-report-application-path-and-navigation-wording.md) | 報表專案路徑與導向文案補強 | 有效 |
| [0049](0049-deterministic-overview-flow-layout.md) | 總覽依可證明流程分層 | 有效 |
| [0052](0052-graph-only-offline-simulation.md) | WP26 只依圖的離線操作模擬 | 部分被取代：模擬結果的呈現改由 [0053](0053-requester-simulation-results-and-coverage.md) |
| [0053](0053-requester-simulation-results-and-coverage.md) | WP26 驗收後的摘要、送出結果與覆蓋率 | 有效 |
| [0055](0055-unmapped-and-simulation-reasons.md) | 元件配對與模擬覆蓋率原因分離 | 有效 |
| [0056](0056-single-simulation-result-for-coverage.md) | Single simulation result for element coverage | 有效 |
| [0057](0057-global-navigation-semantic-identity.md) | 全站導覽使用語意欄位分組 | 有效 |
| [0058](0058-project-wide-regions-and-button-table-feedback.md) | 全專案功能區域依據與按鈕列操作摘要 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0059](0059-wp39-mode-free-viewer.md) | WP39 的無模式畫面檢視器 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0060](0060-wp40-always-available-decisions.md) | WP40 常駐決策介面與送出按鈕選取 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0063](0063-wp38-deterministic-shots-and-flow-tree.md) | WP38 截圖穩定與流程樹去重 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0064](0064-r12-wp41-shell-fit-and-resize.md) | R12 WP41 頂列、總覽適配與資訊欄調整 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0065](0065-r12-wp42-readable-names.md) | WP42 易懂的元件名稱與說明 | 有效 |
| [0066](0066-r13-screen-transition-animations.md) | R13 畫面切換動畫 | 有效 |
| [0068](0068-r14-wp45-dashboard-and-guide.md) | R14 WP45 dashboard and onboarding | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0070](0070-r14-design-system-and-review-layout.md) | R14 design tokens and review workspace alignment | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0071](0071-r14-wp48-wp49-ui-assertion-migrations.md) | R14 WP48–WP49 UI 斷言遷移 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0072](0072-r15-api-method-and-category-labels.md) | R15 API 方法與分類標籤 | 有效 |
| [0084](0084-r17-two-page-report-and-retired-tests.md) | R17 兩頁報表與退場測試 | 有效 |
| [0085](0085-r17-canvas-zoom-focus-and-click-simulation.md) | R17 畫布 zoom in 聚焦與點擊模擬 | 有效 |
| [0090](0090-overview-areas-and-pinned-relations.md) | 總覽分區、單擊看關聯、雙擊開啟畫面 | 有效 |
| [0119](0119-r28-visual-summaries.md) | R28 API 頁與角色頁加上數量的圖形摘要 | 部分被取代：角色頁每步直條改由 [0123](0123-r32-api-persona-graphics.md) |
| [0120](0120-r29-call-chain-and-overlap-bars.md) | R29 API 詳情的呼叫鏈圖與角色比較的重疊長條 | 有效 |
| [0121](0121-r30-api-decisions-viewer-only.md) | R30 API 狀態的標記判定只留在 viewer | 有效 |
| [0123](0123-r32-api-persona-graphics.md) | R32 API 方法色標、路徑參數、呼叫數長條，與角色頁改版 | 有效 |
| [0124](0124-r33-overview-labels.md) | R33 縮小的總覽上看得出每一區與每個畫面 | 有效 |
| [0126](0126-r35-focus-line-bundles.md) | R35 放大畫面時的關聯線左進右出、依區塊合併 | 部分被取代：R35-4 的固定標籤寬度改由 [0127](0127-r36-focus-label-layout.md) |
| [0127](0127-r36-focus-label-layout.md) | R36 放大畫面的關聯線標籤對齊與預覽比例 | 有效 |
| [0128](0128-r37-panel-method-tags.md) | R37 畫面側欄的 API 清單使用與 API 頁相同的方法標籤 | 有效 |

## 審查 md 與決策

確認結果以畫面／元件複合鍵保存，交付物是單一 md；R17 起使用 md v1 與自動存檔的進度檔（ADR 0086），決策原因與備註已退場。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0004](0004-screen-scoped-component-decisions.md) | 元件決策依畫面與元件複合鍵保存 | 有效 |
| [0022](0022-review-md-data-isolation.md) | review md 的專案資料隔離（OQ-007） | 有效 |
| [0023](0023-review-md-machine-state.md) | review md 機器狀態的完整性與隔離 | 有效 |
| [0024](0024-md-expression-redaction.md) | md 的運算式內容邊界 | 有效 |
| [0025](0025-retire-json-review-export.md) | 歷史 JSON review 匯出退場 | 有效 |
| [0026](0026-review-md-unicode-and-code-span.md) | Review md 隱形字元隔離與 code span 忠實度 | 有效 |
| [0062](0062-confirmation-dashboard-workflow.md) | 以既有決策模型擴充確認工作流 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0069](0069-r14-wp47-decision-notes-and-md-v3.md) | R14 WP47 決策原因、備註與 Markdown v3 | 部分被取代：決策原因與備註已退場（[0084](0084-r17-two-page-report-and-retired-tests.md)），md 改為 v1（[0086](0086-r17-progress-file-autosave-and-md-v1.md)） |
| [0086](0086-r17-progress-file-autosave-and-md-v1.md) | R17 進度檔自動存檔與 md v1 | 有效 |

## 元件庫

元件庫的報表介面已於 R17 退場（ADR 0084）；下列 ADR 保留作為歷史紀錄。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0027](0027-component-library-storage.md) | 元件庫 Schema 與工作區選用 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0028](0028-deterministic-library-matching.md) | 決定性元件比對 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0029](0029-reversible-library-overrides.md) | 可逆元件庫覆寫與離線注入 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |
| [0030](0030-library-markdown-round-trip.md) | 元件庫 md 雙格式與 orphan 還原 | 部分被取代：介面於 R17 重寫或移除，見 [0084](0084-r17-two-page-report-and-retired-tests.md) |

## 驗證用專案與一致性

合成 fixture 與 `fixtures/wp10/golden` 的摘要用來偵測回歸；公開專案的流程驗收以原始碼獨立定義的操作與真實點擊為準。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0032](0032-synthetic-project-integration.md) | 合成來源整合與同環境決定性 | 有效 |
| [0033](0033-fixture-analysis-summary-goldens.md) | 合成 fixture 的分析摘要基線 | 有效 |
| [0034](0034-api-usage-shared-vectors.md) | API 狀態 null 目標與跨語言一致性向量 | 部分被取代：Java 端不再判定標記，見 [0121](0121-r30-api-decisions-viewer-only.md) |
| [0091](0091-public-workflow-restoration.md) | 公開應用流程還原（WP69） | 有效 |
| [0092](0092-public-workflows-state-and-template-projection.md) | 第二批公開應用：操作控制、示範資料與模板投影 | 有效 |
| [0093](0093-public-completeness-workflow-repairs.md) | 第三批公開專案完整性與操作修復 | 有效 |
| [0094](0094-public-batch4-workflow-repairs.md) | 第四批公開專案的有限流程修正 | 有效 |
| [0095](0095-public-batch5-workflow-repairs.md) | 第五批公開專案的來源分析與有限流程回放 | 有效 |

## 建置、品質與效能（健檢 HC）

Java 以 google-java-format、TS／JS 以 Prettier 排版，JS 以 ESLint、TS 以 tsc 檢查，CI 都會擋；工具鏈版本固定（Maven Wrapper、Node 22、Playwright 1.63.0），CI 含 Windows 與覆蓋率。主程式不得有沒說明的空 `catch`（R50）。

| ADR | 決定 | 狀態 |
|---|---|---|
| [0125](0125-r34-analysis-performance-security.md) | R34 分析效率與安全性檢查（第一段） | 有效 |
| [0129](0129-r38-run-every-capture-test.md) | R38 CI 執行 screentrace-capture 的全部測試檔 | 有效 |
| [0130](0130-r39-java-formatting.md) | R39 Java 原始碼以 google-java-format 排版並由 CI 檢查 | 有效 |
| [0131](0131-r40-typescript-javascript-formatting.md) | R40 TypeScript／JavaScript 以 Prettier 排版並由 CI 檢查 | 有效 |
| [0134](0134-r43-toolchain-versions.md) | R43 固定建置工具鏈版本 | 有效 |
| [0136](0136-r45-windows-ci-and-coverage.md) | R45 CI 加上 Windows 與測試覆蓋率報告 | 有效 |
| [0139](0139-r48-index-graph-lookups.md) | R48 Java 分析以索引取代線性搜尋 | 有效 |
| [0140](0140-r49-lint-rules.md) | R49 JavaScript 以 ESLint、TypeScript 以 tsc 檢查 | 有效 |
| [0141](0141-r50-explained-catch-blocks.md) | R50 每個被吞掉的例外都要說明或縮小型別 | 有效 |
| [0142](0142-r51-adr-index.md) | R51 ADR 索引與現況摘要 | 有效 |
