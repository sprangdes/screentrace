# ADR 0154：R72 共用片段的 include 情境記在各畫面的 CONTAINS 證據

## 背景

[CODE_REVIEW_20261114](../CODE_REVIEW_20261114.md) 的 RV-409：同一個 JSP 片段被多個畫面 include 時，片段內的元件是同一個節點。`MarkupGraphContribution` 依某個畫面的 include 情境（外層 `c:if`、迴圈）把 `conditional`／`repeated` 寫成 `true`，其他畫面直接 include 同一片段時也看到 `true`，且結果依畫面處理順序而定。[CODEX_INSTRUCTIONS](../CODEX_INSTRUCTIONS.md) §4 要求控制流程內的元件標記 `conditional=true`／`repeated=true`，但沒有規定共用片段在不同畫面情境不同時的處理。

## 決定

- R72-1：元件節點的 `conditional`／`repeated` 描述元件在每個包含它的畫面都成立的情境：元件自身在控制流程內，或每一個 include 它的畫面都在條件／迴圈內 include 它時，才是 `true`。
- R72-2：每個畫面各自的情境記在該畫面到元件的 CONTAINS 邊的證據（`畫面元件來源；guard=…；repeated=…`），這部分原本就存在，不變。

## 後果

- 只在部分畫面受條件限制的共用元件，節點上改為 `false`；需要逐畫面判斷的使用者讀 CONTAINS 證據。報表與 viewer 目前不讀這兩個節點屬性，畫面不受影響。
- 14 個 fixture 的圖都沒有因此改變（沒有在不同情境下共用的片段）。
