# ADR 0157：R79 顯示欄位建模與預覽可信度標示

## 背景

[改善計畫 2026-11-17](../IMPROVEMENT_PLAN_20261117.md) 階段 3：第 5 項（純文字輸出建模為顯示欄位，可點選、可標注、併入欄位對照）與第 7 項（預覽中標出示範資料與無法確定的區塊）。待決問題 OQ-054 由需求方回覆「依你的建議繼續實作」：迴圈內重複輸出視為一個元件、命名優先用標籤文字並以綁定屬性退回、core 新增元件 kind `DISPLAY_FIELD` 且 schema 不升版。

## 決定

### R79-1 顯示欄位是「印出資料的元素」

- 以元素為單位，而非以運算式為單位：一個 HTML 元素自身內容含輸出（EL 文字 `${…}`、`<c:out>`、`<bean:write>`、`<nested:write>`、`<fmt:formatNumber>`、`<fmt:formatDate>`、`<spring:escapeBody>`，或 Thymeleaf `th:text`／`th:utext`）時，該元素是一個 `DISPLAY_FIELD` 元件；同一元素多個輸出合併為一個元件。
- 元素已是其他元件（按鈕、連結、輸入欄位、表格等）時維持原 kind；`html`、`head`、`title`、`body`、`script`、`style`、`option`、`select`、`textarea`、`template` 等不成為顯示欄位。
- 元件 ID 沿用元件規則（檔案、kind、標籤與屬性、出現次序），出現次序計入同標籤同屬性的每個元素，與 capture 的 `annotateSource` 計法一致，因此預覽元素直接對應到顯示欄位，不需新增對應機制。
- 迴圈（`c:forEach`、`logic:iterate`、`nested:iterate`、`th:each`）內的輸出是一個元件，`repeated` 為 true；條件標籤沿用 guard。
- attributes：`expression`（原始輸出，最多 300 字）、`property`（輸出為屬性路徑時的路徑，或其中第一個點分路徑）、`displayName` 與 `labelSource`。命名依序：所在欄的表頭文字（`tableHeader`，依 `th` 欄位與 `colspan` 對齊）、輸出前以「：」結尾的文字（`leadingText`）、前一個 `label`／`dt`／`th`／`strong`／`b` 的文字（`precedingLabel`）、屬性路徑（`property`）、運算式（`expression`）。
- 實作：`DisplayFields`（`screentrace-parser-jsp`）在 JSP 解析的元件之後附加，`MarkupAnalysis.parse` 本身不變。

### R79-2 React

- `screentrace-js` 的 JSX 元素沒有其他 kind、且自身子節點有資料輸出 `{…}` 時為 `DISPLAY_FIELD`。評估器能確定的值（字面值、常數表查找）、JSX、children、陣列與函式不是資料。名稱依序為輸出前以「：」結尾的文字、屬性路徑、運算式；React 不推導表頭。`ReactGraphContribution` 複製 `expression`、`property`，`componentType` 為 `DISPLAY`。

### R79-3 viewer 與 md

- `DISPLAY_FIELD` 屬於 `fieldKinds`：在右側欄「欄位」分組中標注、計入欄位統計、隨畫面與功能移除；預覽中點選可對應到清單列。名稱用證明過的標籤，不用預覽中的示範值。
- md §10 對顯示欄位以 `property` 作為欄位名稱；`模型.屬性` 的模型名稱與圖中 FORM_MODEL 相同時，列出該模型與欄位型別。

### R79-4 預覽可信度標示（第 7 項）

- 預覽工具列在「示意畫面」提示旁新增「標示示範內容」切換鈕，開啟時在預覽中以虛線框出：藍色＝示範資料（capture 填入的列與值 `data-st-demo-*`，以及所有顯示欄位），橘色＝依條件才顯示（`data-st-conditional` 或預覽元素記錄的條件），灰框＝無法確定的動態內容（既有的「動態內容」標記），並在工具列下方顯示圖例。關閉時移除全部標記；已標注保留／移除或正被聚焦的元素維持原本的框線。
- 只使用 capture 已輸出的標記與預覽元素資料，capture 與 Preview 格式不變。

## 測試

- 新增 `DisplayFieldsTest`（4）、`screentrace-js` `r79-display-fields.test`（1）、viewer `r79-display-trust.e2e`（2）。
- 合成專案的完整流程（`SyntheticProjectIntegrationTest`）斷言每種元件 kind 都出現；在 `fixtures/wp10` 四個 JSP 專案的 `page.jsp` 結尾、`</body></html>` 之前各加一行輸出（`<bean:write>` 或 `<c:out>`），其他行號不變。合成專案的預覽中，三個 JSP 專案的顯示欄位都對應到預覽元素。
- 修改的既有斷言：`MarkupAnalysisTest` 原本斷言 `MarkupAnalysis.parse` 產生「所有」kind，改為「`DISPLAY_FIELD` 以外的所有」kind（顯示欄位在其後附加）；`Wp21ComponentNamesTest` 比對 parse 與圖中的元件 ID 時排除 `DISPLAY_FIELD`，其他 ID 仍須完全相同。

## 後果

- 專案中每個印出資料的元素都會成為元件，元件數增加；分析時間與報表大小隨之增加。
- 以 JavaScript 字串組出的輸出、scriptlet `<%= %>`、自訂標籤內部的輸出不會成為顯示欄位。
- 可信度標示只反映 capture 能證明的範圍：未標示的內容不代表與實際系統相同。
