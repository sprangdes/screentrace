# ADR 0015：schema 2.2 正式輸出與歷史相容 API

## 背景與選項

WP5.7 的 schema 退場與 core 既有歷史相容測試存在範圍差異。OQ-005 的 A 保留歷史建構／缺版本預設，B 改新建圖預設並遷移歷史 fixture。

## 決定

需求方採 A 並附限制。core 舊版相容建構子與缺版本的 2.1 預設保留，標 @Deprecated、註解用途，僅限歷史資料讀取與既有 fixture。CURRENT_SCHEMA_VERSION 的歷史用途與新分析 schema 2.2 必須明確分離，正式來源不得呼叫歷史建構子，以靜態檢查證明。

所有 adapter、merger、CLI 新分析輸出須為 2.2 且通過既有嚴格驗證；不接受以改版本字串代替來源證據。merger 拒絕 2.1 或缺證據輸入，給清楚訊息，移除混合降版。報表與後續匯出拒絕非 2.2，不能靜默升版。

ApplicationGraphTest、GraphIntegrityValidatorTest 等既有斷言維持。ROADMAP 記錄待既有測試遷移後移除舊建構子的技術債。無新增相依。

## 後果與目前狀態

OQ-005 已處理。新限制與報表／匯出既有成功 fixture 發生 OQ-006；僅改版本字串無法讓無來源／kind 的報表 fixture 通過嚴格驗證。依 §0.3 暫停實作，未自行更動 fixture 或放寬驗證。此 ADR 記錄已授權決定，不宣稱程式已完成。

本次沒有更新任何測試或斷言；若另獲 fixture 遷移授權，須逐處列出修改與原因。
