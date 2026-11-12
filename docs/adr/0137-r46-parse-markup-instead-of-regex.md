# ADR 0137：R46 以 parser 讀取 XML 與 JSP 結構，取代 regex

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-005：AGENTS.md 要求不要以 regex 作為解析結構化語言的主要手段，但 Struts adapter、`JspProjectParser` 與 `SpringMvcAnalyzer` 有幾處用 regex 讀 XML 或 JSP／HTML 結構。這些 regex 會把註解裡的內容當真，遇到屬性值裡的 `>` 會切錯，也只接受固定的屬性順序與引號寫法。

## 決定

- R46-1：盤點這三處所有 regex 用法。用來讀結構的 7 處改用既有的 parser：

  | # | 位置 | 改成 |
  |---|---|---|
  | S1 | `StrutsServletMappings.markUnsupportedJsf`：web.xml 的 FacesServlet | `StrutsSources` 的 XML parser（行號沿用元素的 `line`） |
  | S2 | 同上：JSP 的 taglib 指令、`xmlns:` 宣告與 JSF 標籤 | `MarkupTag.scan` |
  | S3 | `StrutsControls.selectOptionValues`：`<option value>` | `MarkupTag.scan` |
  | S4 | `StrutsTiles`：`<title>`／`<h1>`、`bean:message`、屬性 | `MarkupTag.contents`／`replaceTags` |
  | J1 | `JspProjectParser.messageTitle`：`<title>` 裡的 `bean:message` | `MarkupTag.contents`／`replaceTags` |
  | P1 | `SpringMvcAnalyzer`：`SimpleMappingExceptionResolver` 的 `defaultErrorView` | XML parser 與既有的 `property(bean, name)` |
  | P2 | `SpringMvcAnalyzer.jspPreview`：表單欄位與按鈕摘要 | `MarkupTag.scan` |

- R46-2：`MarkupTag` 新增兩個公開方法，供 Struts 與 JSP 共用：`contents(source, name)` 取出每個 `<name>` 到其後第一個 `</name>` 之間的內容；`replaceTags(markup, which, replacement)` 把指定的開始標籤換成文字，任一個換不出來時回傳 null。兩者都沿用 `scan` 的規則，略過註解、scriptlet 與 EL 內的標籤。
- R46-3：以下 regex 保留，因為它們處理的是字串而不是結構：URL／路徑的 `?#` 與分隔符號、識別字與版本號檢查、萬用字元 action 比對、檔名副檔名、build.xml／build.properties 的版本字串、為了取出可見文字而移除標籤與還原實體、`StrutsSources` 在 XML 解析前移除 DOCTYPE、元素內容在判斷靜態標題前移除註解與 scriptlet。
- R46-4：`JspProjectParser` 的 `c:url` 前處理（以 regex 把 `<c:url value>` 改寫成網址）不在本段範圍：它會改寫原始碼並影響後續所有位置，留待之後修改相關功能時處理。

## 後果

- 行為差異只在 regex 原本會讀錯的情況，且都朝正確的方向：註解裡的 FacesServlet、taglib、`<option>`、`<title>` 不再被當真；屬性值含 `>` 的標籤可以正確讀取；`<option value=x>` 等不加引號的屬性、`<property><value>…</value></property>` 的寫法也能讀到。
- 驗證：
  - 修改前後的 CLI 分析 `fixtures/` 的 15 個專案，277 個產物檔案除了專案來源路徑以及由它算出的報表 fingerprint 外完全相同。
  - 新增 `MarkupParsingBoundaryTest`（4 個）、`SpringMarkupParsingTest`（2 個）、`MarkupTagContentsTest`（2 個）。其中 5 個在修改前的版本會失敗；`xmlns` 宣告的 JSF 偵測修改前就正確，作為回歸測試保留。
  - Maven 594 個測試 589 通過、5 個依作業系統條件略過。
