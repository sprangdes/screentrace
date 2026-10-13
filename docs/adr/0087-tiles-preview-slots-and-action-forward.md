# ADR 0087：Tiles 版型預覽、action 層 forward 與 c:url 表單目標

## 背景

以公開專案 `ImanNazirah/demo-struts1`（Struts 1.3 + Tiles 1）實測時發現三個問題：

1. Tiles 頁面定義畫面的 `view` 是共用版型 JSP。靜態預覽只展開 `<%@ include %>` 與 `<jsp:include>`，版型裡的 `<tiles:insert name="body"/>` 原樣留在 HTML，所有 Tiles 畫面截圖都是空白。
2. `<action path="/login" forward="tiles.logon"/>` 這類寫在 action 上的 `forward`／`include` 屬性，以及內建 `ForwardAction`／`IncludeAction` 的 `parameter`，都沒有被當成轉向目標。`/login.do` 對應不到畫面，其他 action 導向 `/login.do` 的 forward 全部成為 `STRUTS_FORWARD_UNRESOLVED`。
3. `<form action="<c:url value='/postLogin.do' />">`：JSP parser 已證明常值 URL，但 Struts adapter 對表單仍使用原始屬性字串，表單與送出按鈕的路由未解析。

## 決定

- Tiles 頁面定義畫面新增 `tilesAttributes` 屬性（JSON 字串）：`{"template": 版型路徑, "attributes": {put 名稱: 項目}}`。項目為 `{"path": 專案相對 JSP 路徑}`、`{"value": 字串}`、`{"definition": 巢狀同結構}` 或 `{"unresolved": 原始值}`；值已套用 `extends` 繼承。巢狀 definition 循環時記為 `unresolved`。
- 靜態預覽（preview v2）依 `tilesAttributes` 展開 `tiles:insert`（`attribute`／`name`／`page`／`template`）、`tiles:insertAttribute`、`tiles:insertTemplate` 與 `tiles:getAsString`；`page` 插入時採用其內嵌 `tiles:put` 的常值。插入的 JSP 各自保留 `data-st-source-file`。無法解析的插槽輸出空白並寫入 `static-preview/diagnostics.json`，不猜測內容。`tiles:insertDefinition` 與以 `definition=` 直接插入尚未支援，同樣記錄診斷。
- action 的 `forward` 或 `include` 屬性優先於 `type`；未設定時，`ForwardAction`／`IncludeAction` 以 `parameter` 為目標。目標以保留名稱 `(action forward)` 存入該 mapping 的 local forwards，沿用既有 forward 鏈、路由別名與繼承呼叫者解析。
- 表單 `action` 為巢狀 `<c:url>`／`<spring:url>`，且 JSP parser 已以常值證明目標時，表單與其送出按鈕改用該常值。運算式值仍維持未解析。

## 影響

- Graph schema 版本不變；只新增 SCREEN 屬性 `tilesAttributes`。
- 既有測試與 golden 未修改。新增 `StrutsTilesForwardActionTest`、`screentrace-capture/tiles-preview.test.mjs`（已加入 CI）。
- 外部 CDN 樣式仍依預覽安全政策不載入，Tiles 畫面會顯示內容與元件但沒有原站樣式。
