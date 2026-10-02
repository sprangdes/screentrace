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
