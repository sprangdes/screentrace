# ADR 0181：R106 Struts logic 標籤與 Thymeleaf 的疊加狀態

## 背景

R84、R99 讓 React 與 JSP 的 `c:if`／`c:when` 依條件形狀標出載入中、錯誤、沒有資料區塊，預覽與截圖預設只顯示有資料狀態。Struts 1 的 `logic:` 標籤與 Thymeleaf 的 `th:if`／`th:unless` 沒有判斷，這些區塊會和正常內容疊在一起。

## 決定

- **Struts**（`strutsLogicPageState`）：`logic:empty` 依 `name`／`property` 判斷，路徑末段像錯誤（`errors`、`errorText`）時不算，其餘為「沒有資料」；`logic:notEmpty`、`logic:present` 只在路徑末段像錯誤時為「錯誤」；`logic:messagesPresent` 為「錯誤」，但 `message="true"`（一般訊息）不算。其他 `logic:` 標籤不判斷。
- `annotateConditions` 讀到 `logic:` 標籤時保留標籤原文，只把狀態記在堆疊上，內含的元素加上 `data-st-state`；不加 `data-st-conditional`，Struts 畫面的條件呈現維持原狀。標籤名稱不分大小寫。
- **Thymeleaf**（`thymeleafPageState`）：元素自己的 `th:if` 依 EL 形狀判斷；`th:unless` 只在條件是否定（`${not …}`、`${!…}`、`${not empty …}`）時，去掉否定再判斷，不是否定的 `th:unless` 在有資料時才顯示，不標。EL 形狀另認 `#lists／#arrays／#sets／#maps.isEmpty(x)`、`.size(x) == 0`（沒有資料）與 `#fields.hasErrors(…)`／`hasAnyErrors()`／`hasGlobalErrors()`（錯誤），並接受 `*{…}`。已由模型回饋規則（`data-st-model-if`）隱藏的元素不再標記。
- 判斷都在 `annotateConditions` 讀原始屬性完成，來源中寫好的 `data-st-state` 仍會被移除，不信任來源標記。

## 測試

- capture `el-page-states.test` 新增 2 個：Thymeleaf 形狀與 `th:unless`；Struts 標籤與 Thymeleaf 屬性的標記、`message="true"` 與 `logic:equal` 不標、來源寫好的狀態被移除。既有斷言不變。

## 後果

- reservio 是 React，結果不變。Struts 與 Thymeleaf 專案的預覽與截圖預設不再疊出空清單與錯誤區塊，可用狀態切換查看。
