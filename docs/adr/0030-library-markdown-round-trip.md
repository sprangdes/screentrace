# ADR 0030：元件庫 md 雙格式與 orphan 還原

日期：2026-10-03。狀態：採用（OQ-010 A）。

沒有有效／orphan 覆寫時精確沿用 format_version 1；有任何覆寫才用 2，共同欄位外必須有 component_overrides／orphan_component_overrides。v1 拒絕兩個新欄位，v2 缺任何新欄位拒絕；未知欄位與來源摘要格式嚴格驗證。v1 兩份 golden 不修改。

component_library 檔頭以 JSON 相容物件（name_version、manifest_sha256）保留名稱@版本與選用內容摘要；未選用維持 none。有效覆寫來源取匯出檔頭，orphan 自帶原摘要。唯一 review.ts 分區函式共用瀏覽器暫存與 md，不實作第二套映射；A 的同名 ID 在 B 中隔離，完整機器區保存來源，回 A 恢復。未知圖 owner／庫 ID 保留；不將 foreign/orphan 傳入建議／涵蓋率／API。

SHA 對完整機器狀態（排除 state_sha256）正規化後計算，包含新分區與來源摘要；不宣稱檔頭／整份文件防竄改。正文只在 §7 列 orphan 數量與分類，不洩漏其建議內容。§6 使用目前決定性候選與有效覆寫，不把 orphan 候選當作規則輸入。

manifest 多行 usage 用可見 \n，所有資料用共用 projectText 的 code span／300／Unicode 隔離，截斷來源為名稱@版本；HTML／base64 仍不以 active 資源輸出。原解析／末尾區塊／JSON 32 MiB／檔案 64 MiB／完整未知 ID／污染防護沿用。

4 項新 unit＋每引擎 1 項 E2E，先失敗再實作：A/B/A、同 ID 異摘要隔離、v1/v2 位元組相等、golden 未變、非法 SHA／未知鍵／v1 帶 v2／v2 缺鍵、hostile ID／usage、SHA 修改偵測、API／§6 不變。沒有新增相依或修改既有斷言。

C7 補足：manifest 輸入／索引／內容檔與寫入統一走 SafeProjectFiles。新增 readBytesLimited 保留同一防 symlink／逃逸／大小界線，原 readUtf8Limited 委派而不改既有文字行為；摘要直接對原 bytes，不以文字解碼重編改變來源。新增 CLI symlink 反例先失敗後修正，既有 scanner／CLI 斷言不變。

v1／無覆寫匯入仍按目前 manifest 正規化暫存 key，已選用時不能退回未帶摘要的 key。首次綁定時讀取同指紋的舊 WP8 key 並保留畫面決策，再經同一分區。新增舊決策遷移與無覆寫 digest key 反例先失敗後修正。

公開 homepage／docsUrl 是資料、不發出請求；隱私檢查排除 HTTP(S) URL token 的一般路徑判斷，避免 https:/ 或 URL 的 /home/ 被誤認為本機路徑。實際家目錄字串仍對完整原文拒絕，URL 外的磁碟路徑仍拒絕。新增公開文件 URL／Windows 本機路徑反例先失敗後修正，不更改既有斷言。
