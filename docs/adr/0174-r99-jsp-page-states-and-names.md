# ADR 0174：R99 JSP 的疊加狀態與更多狀態命名

## 背景

R84（[ADR 0162](0162-r84-page-states-in-preview.md)）只在 React 預覽辨識載入中／錯誤／沒有資料，且命名限於 `loading`、`error`、`empty` 一類。JSP 也常以 `<c:if test="${empty list}">` 顯示「沒有資料」、以 `<c:if test="${not empty errors}">` 顯示錯誤，預覽同樣會與資料表疊在一起。

## 決定

- **JSP**（`screentrace-capture/el-page-states.mjs`）：`annotateConditions` 已為 `c:if`／`c:when` 內的元素標上條件，現在同時依條件分類並加 `data-st-state`。只認下列 EL 形狀（去掉 `${…}` 後，以頂層 `and`／`&&` 分段）：
  - 沒有資料：`empty X`（X 不是錯誤名稱）、`fn:length(X) == 0`、`X.size() == 0`、`X.isEmpty()`、`X.empty`；
  - 錯誤：`not empty X`、`!empty X`、`X != null`，且 X 的最後一段名稱含 `error` 或為 `failed`／`failure`；或單獨的錯誤旗標；
  - 載入中：單獨的 `loading`／`isLoading`／`busy` 旗標。
  `c:otherwise` 與其他條件不分類。JSP 預覽的 `<head>` 加上與 React 相同的預設隱藏規則，viewer 的「畫面狀態」切換同樣適用。
- **React 命名**（`page-states.mjs`）：載入中另認 `isPending`、`isSubmitting`、`isBusy`、`busy`、`refreshing` 與 `status === 'busy'|'fetching'|'submitting'`；錯誤另認 `'rejected'`；沒有資料另認 `noData`、`noResults`、`hasNoItems` 一類。

## 測試

- capture `el-page-states.test`（2）；JS `r84-page-states.test` 新增 7 個案例。既有 JS、capture、Maven、viewer 測試不需修改。

## 後果

- Struts 的 `logic:empty`／`logic:present` 標籤與 Thymeleaf 的 `th:if` 尚未分類。
