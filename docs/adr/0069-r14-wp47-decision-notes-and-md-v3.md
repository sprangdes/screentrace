# ADR 0069：R14 WP47 決策原因、備註與 Markdown v3

狀態：採用

## 背景

逐頁盤點需要讓需求方為保留／移除決定留下固定原因與補充說明，並讓 md 可安全地接續還原。既有 md v1／v2 golden 代表無備註與元件庫覆寫的穩定契約，不能因新增欄位而改變。

## 決定

- `ReviewState.decisionNotes` 採可選欄位，形狀為畫面 ID 與 `(screenId, componentId)` 巢狀字典；備註最多 1,000 Unicode code point，輸入時移除控制字元。
- 移除原因固定為 `DISCONTINUED`、`REPLACED`、`DEV_ONLY`、`OTHER`；保留原因固定為 `IN_USE`、`COMPLIANCE`、`OTHER`。改成相反決策時，只清除不相容原因、保留備註；改為 UNDECIDED 時原因與備註留在暫存，但不輸出，重新作出相容決策時恢復。
- 只有目前 KEEP／REMOVE 決策含非空原因或備註時，md 才升為 format_version 3。v3 必含 v2 的兩個覆寫鍵及 `decision_notes`；v1／v2 欄位、狀態雜湊與 golden 不變。沒有活動中的備註仍輸出原 v1 或 v2。
- v3 正文在畫面與元件表增加原因、備註欄。原因用中文標籤及固定代碼；備註採用 `projectText` 的 code span、可見化、表格跳脫與 300 字元上限，截斷位置指向附錄 A 對應鍵。固定 §8.2 文字不變。
- 匯入 v1／v2 得到空的 `decisionNotes`。v3 驗證未知鍵、巢狀字典、決策相容原因、備註型別與長度，並把新欄位納入 `state_sha256`；任何錯誤整份拒絕，不改現有決策。

## 驗證與測試先行

先提交 `5938230` 新增的 WP47 失敗測試，再實作。測試鎖定原因代碼與決策相容性、備註長度與控制字元處理、決策切換及 UNDECIDED 草稿保留、舊 state 載入、v3 安全正文、狀態雜湊及拒絕案例、瀏覽器輸入與 v3 下載。初始失敗是 `setDecisionNote is not a function` 及瀏覽器找不到 `data-decision-reason="screen:a"`，分別證明資料層與工作區尚未提供新契約。

v1／v2 golden 測試未修改，確認無備註時輸出維持逐位元組相同。WP47 未修改既有測試斷言。
