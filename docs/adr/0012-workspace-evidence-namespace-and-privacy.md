# ADR 0012：工作區證據命名空間與隱私

## 背景與選項

OQ-004 確認專案外的工作區設定不能以專案相對路徑如實表示，schema 2.2 同時禁止外部絕對來源。選項為來源命名空間或擴充來源種類。

## 決定

需求方採方案 A。工作區設定使用保留來源 `workspace:config.json`，行號取 `contextPaths` 設定鍵所在行，無法取得為 1。validator 僅接受 workspace: 加單純檔名，不含 /、反斜線、..；其他命名空間與絕對／逃逸路徑仍拒絕。目標檔名以 workspace: 開頭者在 scanner 與 SafeProjectFiles 讀取邊界拒絕，不能冒充工作區來源。

設定檔真實路徑與家目錄不傳入 graph。工作區 evidence.detail 只包含設定鍵、候選值及採用值；不含真實檔案位置或專案設定索引的絕對路徑。context 來源與採用值明確記於對應 evidence：workspace:config.json、server.servlet.context-path 或未設定。多個候選無單一採用值，全部保留並標歧義。

## 後果

設定改變可直接從 graph 證據區分，未設定也留下證據。ProjectInventory 不攜帶真實設定檔來源，CLI 使用 JSON token 的位置取得設定鍵行號。保留 schema 的來源形狀，新增命名空間例外；目標來源限制與所有既有測試斷言不變。
