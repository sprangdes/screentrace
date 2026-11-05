# ADR 0121：R30 API 狀態的標記判定只留在 viewer

## 背景

[ADR 0034](0034-api-usage-shared-vectors.md) 保留了兩份 API 狀態的正式實作：Java 的 `ApiUsage.derive(graph, screenDecisions, componentDecisions)` 與 TypeScript 的 `deriveApiUsage(graph, state)`，以共用向量 `docs/examples/api-usage-vectors.json` 確認兩者一致，並在 ROADMAP 記為技術債。檢查後發現，Java 在正式程式中只有 `SpringExternalCalls` 呼叫 `ApiUsage`，而且只用到「沒有任何呼叫來源（UNREFERENCED）」；保留／移除標記與「可移除（REMOVABLE）」只有測試會用到。報表、md 與 API 頁的狀態都由 viewer 的 `deriveApiUsage` 計算。

## 選項

1. 維持兩份完整實作：規則改動時兩邊都要改，標記判定在 Java 端沒有使用者。
2. Java 端移除標記判定，只推導呼叫來源；標記判定只留在 TypeScript：採用。
3. 分析時把每個 API 的呼叫來源寫進圖（schema 2.5），viewer 改為讀取：完全消除重複，但要改 schema、驗證器、golden fixture 與決定性測試，範圍過大，不採用。

## 決定

- R30-1：`ApiUsage.derive(graph)` 只有圖一個參數，輸出每個 API 的排序呼叫來源，狀態只有 `IN_USE`（有呼叫來源）與 `UNREFERENCED`（沒有）。移除 `Decision`、`ComponentKey` 與 `REMOVABLE`。呼叫來源的推導（R-API-1、R-API-4～6，包括轉址繼承）不變。
- R30-2：保留／移除標記與「可移除」只由 viewer 的 `deriveApiUsage` 判定（R-API-2、R-API-3）。
- R30-3：共用向量檔案不變，仍是一致性依據。TypeScript 測試照舊逐案例比對狀態與呼叫來源；Java 測試逐案例比對呼叫來源，並確認 `UNREFERENCED` 與預期一致，不讀取案例中的標記。
- R30-4：Java 測試中只檢查標記判定的 2 個測試移除（向量案例與 viewer 的 `review.test.mjs` 已涵蓋相同情境），其餘測試改為檢查呼叫來源。分析輸出、schema 與報表不變。

## 後果

標記判定只剩一份實作。呼叫來源的推導仍有 Java 與 TypeScript 兩份，由共用向量確認一致；若日後要完全消除，需要選項 3 的 schema 變更。
