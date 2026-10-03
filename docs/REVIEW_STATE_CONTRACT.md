# Review 狀態契約 v1（WP7 D；WP8 共用）

正式模組：`screentrace-viewer/src/shared/review.ts`，可於瀏覽器與 Node 使用。圖只接受 schema 2.2；注入入口另做完整 GraphIntegrityValidator 嚴格證據驗證。

```typescript
interface ReviewState {
  format: 'screentrace-review';
  version: 1;
  schemaVersion: '2.2';
  application: string;
  fingerprint: string;
  screenDecisions: Record<string, 'UNDECIDED' | 'KEEP' | 'REMOVE'>;
  componentDecisions: Record<string, Record<string, 'UNDECIDED' | 'KEEP' | 'REMOVE'>>;
  manifest_sha256?: string; // currently selected manifest, lowercase SHA-256
  component_overrides?: Record<string, Record<string, string>>;
  orphan_component_overrides?: Array<{screenId: string; componentId: string; libraryComponentId: string; manifest_sha256: string}>;
}
```

`screenDecisions[screenId]` 與 `componentDecisions[screenId][componentId]` 為明確決策。缺值等於 UNDECIDED；以巢狀字典表示複合鍵，ID 不串接、不假設分隔符，也不存取繼承屬性。標記對象為全部畫面、BUTTON／LINK／SUBMIT，以及有 graph 行為／導頁／API／表單觸發的其他元件；共用元件各 owner 是獨立決策。

`setScreen`／`setComponent` 回傳新狀態，不突變輸入。畫面 REMOVE 不改寫其元件；`effectiveComponent` 顯示 INHERITED_REMOVE（隨畫面移除），不寫入字典。統計分別計算明確三態，另列隨畫面移除數量。總覽／檔案樹依畫面明確狀態篩選；聚焦元件依有效狀態篩選。保留元件導向移除畫面列警告，不自動修正。

API 使用狀態依 R-API-1–6 推導；載入時／未解析 selector 的畫面來源不可遺失，回呼從父行為追蹤。元件來源依其 `(screenId, componentId)` 或畫面 REMOVE 視為移除；無來源為 UNREFERENCED，不授權移除。

localStorage 鍵為 `screentrace:review:v1:<encodeURIComponent(application)>:<fingerprint>`。指紋來自排序鍵的分析圖 JSON SHA-256。讀取需 format／version／schema／application／fingerprint 相符，決策限三態；非法或存取失敗顯示警告並保留操作能力。儲存失敗不刪當前記憶體決策。未知 ID 不丟棄；還原模組保留，WP8 匯入層據圖列 orphan 清單。

WP8 已支援 md 匯出／匯入且 JSON 匯出退場。WP9 OQ-010：覆寫資料使用與附錄相同的 component_overrides／orphan_component_overrides，當前來源由 manifest_sha256 標識；格式 version 1 為瀏覽器容器版本，md format_version 1／2 由是否有覆寫決定。

partitionOverrides 是唯一分區邏輯：把全部覆寫收集為帶來源摘要的 ID record，按 (screenId, componentId, manifest_sha256) 去重；相同來源鍵衝突拒絕。摘要等於目前、元件庫 ID 有效且圖 owner 相符者有效，其餘 orphan。換回來源庫／圖 ID 可恢復，不丟棄。每個 record 只含 ID 與 64 碼小寫摘要，未知鍵拒絕。API 推導／kind 涵蓋率不讀覆寫。有效覆寫只在 KEEP 畫面展示；setOverride 只允許 KEEP 並驗證 owner／元件庫 ID。

選用庫時暫存鍵加 :<manifest_sha256>；無庫沿用舊鍵。另以同分析指紋 :library-transfer 保存完整共用模型供 A/B/A／解除綁定轉移，讀取後一律經上述分區；不直接套用前庫資料。未知 ID／外庫覆寫列 orphan 提示，不靜默套用。暫存失敗不影響記憶體狀態。

md 雙格式契約見 REVIEW_MD_CONTRACT；有效／orphan ID 同時可逆還原，v1 golden 不變。

首次選用元件庫可讀同指紋的舊 WP8 key，保留決策後立即經共用分區；v1 md 匯入即使沒有覆寫，也正規化到目前 manifest 摘要 key。不得因匯入 v1 而退回未含摘要的暫存 key。
