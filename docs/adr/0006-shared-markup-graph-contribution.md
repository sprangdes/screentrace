# ADR 0006：共用標記圖貢獻與來源所有權

## 背景

Spring／Struts 各自建立互動元件，Spring 舊 ID 依行號且共享 include 產生不同 ID；新的完整元件、檢核、事件與彈窗需進入同一 Application Graph。

## 選項

各 adapter 重複完整 DOM 邏輯，或由 parser 提供來源元件與共用圖貢獻，adapter 只補路由與模型證據。

## 決定

採共用 MarkupAnalysis／MarkupGraphContribution，元件按來源路徑、種類、原始屬性、同類出現序建立穩定 ID。Interaction 帶 componentId，Spring／Struts 使用同一種 kind 判斷，不依行號、畫面使用者或檔案掃描順序建立元件 ID。布林屬性是來源屬性鍵的一部分；修正早期漏掉布林屬性的解析會影響受影響元件的 ID，屬語意修正而非無關修改造成的漂移。

共享片段的所有權條件、迴圈證據留在 CONTAINS。元件上的 conditional／repeated 表示至少一個使用處有此性質，行為 guard 保留宣告來源條件；不能將一個畫面的 include 條件套到所有畫面。彈窗候選在所有畫面所有權建立後解析，多候選 AMBIGUOUS、列出候選，不選一個。

表單欄位只以來源模型證據建立 BINDS_TO，不載入目標 class；缺少／不能唯一證明時保留 UNRESOLVED。Spring 使用已有 JavaParser，確認註解來源 import／全名與 DTO 型別；Struts 使用既有 config／JavaParser 來源。validate 為靜態檢核規則關聯事件，不宣稱已執行瀏覽器或存在 JS 監聽器。

## 後果

沒有新增相依，既有測試斷言不變。完整元件與規則、來源 JSON／標籤矩陣 golden、重排／無關註解 ID、include／Tiles、模型綁定反例均有測試。歷史 schema 讀取與新分析輸出統一由 WP5 完成，不在 WP3 提前改變既有相容路徑。

Spring 模型候選另須有本表單已證明的提交處理器，或本表單所有畫面所有者的已證明 rendering 處理器；provider 限同來源 Controller。不同畫面的同名模型不得以全域名稱相同直接綁定。無處理器／rendering 證據時保留 UNRESOLVED。
