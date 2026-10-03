# ADR 0024：md 的運算式內容邊界

日期：2026-10-03；狀態：採用。

## 背景與選項

OQ-007 允許 guard／未解析運算式，但禁止函式本體與完整敘述式。只搜尋 function／分號會錯刪字串與正規表示式，又漏掉物件方法及模板插值裡的函式本體。新增反例測試先失敗，不修改既有斷言。

## 決定

共用 md 以 Acorn 8.18.0（MIT，與 screentrace-js 已釘選版本相同）解析運算式，不執行目標文字。依 AST 排除 statement／declaration／block 函式本體及運算式後完整敘述式；原本的單純呼叫、字串／regex 保持資料。用迭代 traversal，避免工具自己遞迴堆疊。

EL 整段 ${...} 可解析內部；非 JS 模板 guard 不冒充 JavaScript，採字串／註解／regex 邊界的保守省略檢查。省略以固定標記與來源顯示，不輸出完整程式或隱藏自由 detail。

相依是純 AST parser，無執行期 UI／布局框架、無 eval／Function／vm，打入同一 HTML／Node 共用 bundle，不發網路請求。新增 npm lock，npm audit／Dependency-Check 仍為每增量 gate；授權來源見已安裝 acorn package 的 LICENSE。

## 後果

增加 bundle 容量；仍接受同一 100 MB HTML／5 MB md 警告與 3 秒效能驗收。能保留含 function／分號的字串資料而拒絕真正方法／模板插值函式本體，不用正規表示式充當 JS 主要解析器。

## 分發授權

瀏覽器與 Node 共用 bundle 都附完整 Acorn MIT LICENSE notice；新建置測試先失敗再補足。CSP hash 在加入 notice 後計算，Java 仍驗證完整 script 的同一摘要。工具授權文字不是目標專案文字。
