# ADR 0028：決定性元件比對

日期：2026-10-03。狀態：採用。

共用 TypeScript library 模組供 viewer／Node／md 重用，僅讀取 graph 元件 kind、attributes（包括既有原始 tag）與 evidence.detail 已有的結構化框架來源標籤。matches.attributes 的「框架來源標籤」為 evidence 白名單資料投影，不寫入 core，也不以 parser 名稱猜測框架。缺少規則所需欄位時明確失敗，要求確認資訊；不捏造預設屬性。

條件為精確字串相等的 AND，不作模糊或機率比對。先以 priority 由高到低，再以不同條件（欄位＋值）數由高到低；重複相同條件只算一次，矛盾條件必須同時檢查，不互相覆蓋。相同元件的多條成功規則只保留最高分；最高分不同候選 ID 全列 AMBIGUOUS，ID 排序只使列舉決定性，不作破同分擇一。deprecated 不默默排除，於詳情保留狀態。

涵蓋率以 canonical COMPONENT ID 每種 kind 各計一次（共享片段不因多畫面重複計數），分 MATCH／NONE／AMBIGUOUS。每個畫面仍可依複合鍵獨立覆寫，覆寫不改原始比對涵蓋率。所有排序採明確 UTF-16 字串次序；圖與 manifest 排列反轉不影響結果。

3 項新增測試：priority／特異度／全數歧義／NONE／反轉排序、缺資料失敗與既有來源標籤投影、覆蓋矛盾／重複條件與涵蓋率。無新增相依；既有斷言與 md golden 不變。
