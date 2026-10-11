# ADR 0005：有證據的同來源 URL 變數例外

## 背景

WP3.8 原本要求所有 EL 目標維持 UNRESOLVED，與既有 URL 變數測試衝突。依 §0.3 停止後，需求方在 OQ-002 選定方案 B，明確禁止修改既有斷言。

## 選項

A：所有 EL 均 UNRESOLVED，需授權修改衝突測試。B：同 JSP 內可證明的常值 URL 變數作為例外。

## 決定

採需求方指定 B，修訂文件 v1.2。UrlVariableResolver 使用原始標記位置建立定義與作用域索引；一個變數在整個來源只能有一次 URL 定義，使用前定義，條件作用域必須包含使用點，迴圈定義不視為單次賦值。只允許 `${var}` 與 `${fn:escapeXml(var)}`，未知函式絕不當透明包裝。c:set、其他 var 寫入、scriptlet 可變更 page scope、無法安全讀取的 include 令受影響值保持 UNRESOLVED；安全 include 只用於檢查寫入，不匯入變數定義。

URL 常值的 CONFIRMED 表示「來源字串可證明」，不表示路徑樣板已與特定端點對應；{name} 原樣保留，後端路由對應及 INFERRED／AMBIGUOUS 在 WP5 處理。param 值不展開、不追加 query。Interaction 保留 originalExpression、definitionEvidence 和穩定 componentId，圖元件保留同一證據。

## 後果與邊界

新增反例與邊界測試，既有斷言不變。不能證明作用域／單一定義的寫法保留原文與 UNRESOLVED；不執行 EL、JSP 或 Java。條件 include 的所有權證據保留在 CONTAINS，共用 fragment 元件維持同一 ID，避免跨畫面決策混用。無新增相依。

自訂控制標籤內的定義無法證明只賦值一次、動態 var 名稱或未知寫入亦保留 UNRESOLVED。來源字串確認不改寫原有較低元件信心；targetStatus 分開標示。

使用前定義以完整標籤結束位置判斷：自閉標籤以本標籤結束，成對標籤以對應 closing tag 結束；尚未關閉或在其 body 內先使用者保留 UNRESOLVED，定義證據仍指向起始標籤實際行號。

## R3 WP17 受限迴圈例外（OQ-013，2026-10-04）

需求方選定方案 B：僅 `spring:url` 可在已證明的 `c:forEach`／`logic:iterate` 迴圈內解析。定義與使用必須位於相同迴圈作用域，完整定義先於使用；同檔該變數只定義一次，value 必須是無 EL 的靜態字串。嵌套條件中的使用可保留同一迴圈身分；進入另一層迴圈、越出定義作用域、未關閉或錯配作用域均不解析。未知自訂控制標籤無法證明迴圈作用域。

第二次定義（含其他 URL 標籤）、可能寫入該變數的 `c:set`、動態寫入名稱或任何可執行 scriptlet，仍使目標保持 UNRESOLVED。只接受純變數及已授權的 `fn:escapeXml`；`{name}` 保留為樣板，`spring:param` 不展開也不追加 query。保留原始表達式、定義位置與 OQ-013 規則證據。

理由：靜態 URL 樣板在各次迴圈中不變，參數不求值；此窄例外增加可證明的導覽，而不推測執行期 ID。既有 `c:url` 迴圈行為及全部既有斷言維持原狀。兩種標籤的行為不一致列入 ROADMAP 技術債，待日後授權統一；本次不自行擴大例外。無 schema 或相依變更。
