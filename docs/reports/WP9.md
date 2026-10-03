# WP9 增量回報

## 1 Schema 與 CLI

新增 draft 2020-12 Schema、虛構 sample manifest、ComponentLibrary 驗證與 CLI LibraryStore／LibraryCommands。validate/import/list/unbind 與 --project／--replace 獨立於原分析指令；SHA-256 對原始 bytes，版本衝突拒絕、明確更換後提示受影響專案重產報表。未選用仍 none；report／viewer／md 注入留增量三／四。

4 項新 Java 測試：合法／非法 Schema、未知欄位路徑、5 MiB／2,000 上限、重複 ID、未綁定／綁定／更換／解除、同版本異內容與 --replace、保留並列所有儲存摘要、CLI 失敗訊息／家目錄隱私。初次測試缺少類別而編譯失敗；新增歷史項目列舉斷言再失敗，修正後通過。完整 Java verify 與遠端 npm audit／Dependency-Check gate 通過後才進增量二。既有測試斷言與兩份 golden 不變。

設計：[ADR 0027](../adr/0027-component-library-storage.md)。指示文件 v1.9，OQ-009 已處理。WP10 未開始。

增量一 339c78d：[遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37129070834)，Java 194 tests、三引擎／三組 npm audit／Dependency-Check 通過後進入二。

## 2 決定性比對與涵蓋率

新增 shared/library.ts 與 3 項測試，先缺模組失敗，再以矛盾條件反例失敗；priority／不同條件特異度／同分候選全列／無符合／缺少圖資訊／框架來源證據投影／canonical kind 涵蓋率／順序反轉全通過。依圖已有資訊，不改 core。設計見 [ADR 0028](../adr/0028-deterministic-library-matching.md)，無新增相依或舊斷言變更。

增量二 d6a43b3：[遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37129481920)，31 viewer unit、Java／三引擎／三組 npm audit／Dependency-Check 通過。進入增量三前因 OQ-010（舊覆寫 orphan 的來源摘要與 md 還原）依 §0.3 暫停；三／四未完成，WP10 未開始。

## 3 檢視器與手動覆寫

OQ-010 A 已處理。新增共用可逆 partitionOverrides／覆寫資料模型、摘要暫存鍵與 transfer 快照；Java／CLI 只注入已綁定元件庫。元件詳情、映射提示、KEEP 畫面全部 owner 的複合鍵手動選擇、orphan 清單與 kind 涵蓋率；文字全為隔離後 textContent，不執行 usage／不建立遠端連結。

2 項新 unit、1 項新 Java、每引擎 1 項新 E2E 先失敗後通過。33 viewer unit、195 Java、25 Chromium／WebKit E2E 全通過；A/B/A 同一離線報表重產後恢復、兩畫面共用元件獨立、來源不符不套用、API 不變、未知 owner 保留、HTML 摘要與家目錄隱私。詳見 [ADR 0029](../adr/0029-reversible-library-overrides.md)。md 接入與雙格式完整驗證留增量四；既有 v1 golden 未變更。

增量三 b7365a6：[遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37131391711)，195 Java、33 viewer unit、30 三引擎 E2E、三組 npm audit／Dependency-Check 通過後進四。

## 4 md 整合與雙格式

component_library 選用時列名稱@版本＋完整 SHA-256，未選用保持 none。§6 原始匹配涵蓋率、未對應／全數歧義、目前有效手動覆寫與使用候選詳細契約；manifest usage 單行可見 \n 與 code span／300／來源標記。§7 僅 orphan 數量分類，機器區完整還原原 ID／摘要。format_version 1 無覆寫完全不變；2 必須含兩個分區，未知／缺欄位／錯摘要拒絕，SHA 含新欄位。

4 項 md unit、1 項舊決策遷移 unit、每引擎 1 項下載／清暫存／匯入／外庫隔離／再匯出／回原庫 E2E、2 項 Java symlink／priority 反例均先失敗後通過。A/B 共用 ID 不誤套用、A/B/A 恢復、未知 owner 保留、反引號／換行／隱形 screen／component／library ID lossless、v1/v2 位元組相同、SHA 修改偵測、orphan 不改 API／§6。v1 golden 與原斷言完全不變。

C7 統一 SafeProjectFiles 的原始 bytes 邊界（不改 readUtf8 行為）；priority Schema／runtime 限安全整數避免假同分。最終本機：197 Java（0 failure/error/skip）、38 viewer unit、27 Chromium／WebKit E2E、4 文件基線全通過；TypeScript／esbuild 成功。500 screens／5,000 components／3,000 navigations 首繪 170.1 ms，zoom median 1 ms，未放寬既有 3 秒門檻。詳見 [ADR 0030](../adr/0030-library-markdown-round-trip.md)。

## 完成定義對照

- Schema／範例／validate/import/list/unbind／同版本衝突與 --replace：通過。
- 決定性匹配／特異度／全數歧義／NONE／kind 涵蓋率：通過。
- KEEP 畫面複合鍵手動覆寫／單份離線 HTML／不可信資料與隱私：通過。
- md v1/v2／§6／可逆 orphan／完整性與暫存共用模型：通過。
- C1–C4：不執行目標、保留原證據／狀態、明確排序，不改 core／加入框架名。
- C5–C7：textContent／code span，既有 CSP／sandbox／無網路 E2E 通過，讀寫共用安全邊界與上限。
- C8–C10：ADR 0027 釘選驗證器與授權；穩定複合鍵，繁體中文 UI／說明。相依安全以最新 remote gate 為準。
- OQ-009／010 已處理，文件 v1.9／修訂順序／ROADMAP 版本／兩契約／README／ARCHITECTURE／ADR 0027–0030 同步。
- 與文件差異：依需求方明確決定把手動覆寫改 MUST、顯式選庫、摘要版本與可逆 orphan；沒有其他需求放寬。
- 已知界線：只支援 manifest，不解析 Angular 套件／Storybook／.d.ts；圖缺規則必要資訊明確失敗，不能猜測。
- WP10 未開始；本輪於 WP9 遠端 gate 通過後停止等待驗收。
