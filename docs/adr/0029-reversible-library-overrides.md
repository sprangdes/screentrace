# ADR 0029：可逆元件庫覆寫與離線注入

日期：2026-10-03。狀態：採用（OQ-010 A）。

CLI 從工作區專案綁定選唯一 ComponentLibrary，經 Schema／摘要驗證後由 Java overload 注入 componentLibrary（manifest＋sha256），未綁定不注入。不帶儲存路徑。既有 generate 入口保持未選用行為。重產 report 同樣重新讀綁定，unbind 後維持 none。

viewer 文字只 textContent；manifest 以 code span／300／控制與隱形隔離，多行 usage 顯示 \n，截斷指向名稱@版本，不創建 docsUrl／homepage 網路連結。詳情列候選全數、屬性／事件對照、狀態／usage；主頁列 kind 涵蓋率。review 的 KEEP 畫面所有 owner 元件可覆寫；複合鍵不拼字串，不改 graph 或自動比對結果。

review.ts 的 partitionOverrides 共用於暫存與 md（md 於增量四接入），只用來源完整小寫 SHA-256／元件庫 ID／圖 owner 判斷有效；其餘保留 orphan。A/B/A 可自動恢復；同 ID 異來源不會誤套用。state 與 md 同用 component_overrides／orphan_component_overrides 結構，foreign 分區不參與建議／API／涵蓋率。暫存鍵納入目前摘要；同指紋 transfer 快照保存所有來源，讀後必經分區。未知圖 ID 保留待後續重新分區。

2 項單元、1 項 Java 注入、每引擎 1 項新 E2E 先失敗，涵蓋複合鍵、KEEP 限制、A/B/A、unknown owner、API 不變、HTML 摘要與隱私、manifest script 不執行。既有斷言與 v1 golden 不變，無新增相依。
