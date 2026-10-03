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
}
```

`screenDecisions[screenId]` 與 `componentDecisions[screenId][componentId]` 為明確決策。缺值等於 UNDECIDED；以巢狀字典表示複合鍵，ID 不串接、不假設分隔符，也不存取繼承屬性。標記對象為全部畫面、BUTTON／LINK／SUBMIT，以及有 graph 行為／導頁／API／表單觸發的其他元件；共用元件各 owner 是獨立決策。

`setScreen`／`setComponent` 回傳新狀態，不突變輸入。畫面 REMOVE 不改寫其元件；`effectiveComponent` 顯示 INHERITED_REMOVE（隨畫面移除），不寫入字典。統計分別計算明確三態，另列隨畫面移除數量。總覽／檔案樹依畫面明確狀態篩選；聚焦元件依有效狀態篩選。保留元件導向移除畫面列警告，不自動修正。

API 使用狀態依 R-API-1–6 推導；載入時／未解析 selector 的畫面來源不可遺失，回呼從父行為追蹤。元件來源依其 `(screenId, componentId)` 或畫面 REMOVE 視為移除；無來源為 UNREFERENCED，不授權移除。

localStorage 鍵為 `screentrace:review:v1:<encodeURIComponent(application)>:<fingerprint>`。指紋來自排序鍵的分析圖 JSON SHA-256。讀取需 format／version／schema／application／fingerprint 相符，決策限三態；非法或存取失敗顯示警告並保留操作能力。儲存失敗不刪當前記憶體決策。未知 ID 不丟棄；還原模組保留，WP8 匯入層據圖列 orphan 清單。

本輪只有自動暫存；md 匯出／匯入及 JSON 匯出退場屬 WP8，未實作。
