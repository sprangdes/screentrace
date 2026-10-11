# ADR 0033：合成 fixture 的分析摘要基線

日期：2026-10-04。狀態：採用（WP10 追加兩項）。

## 背景與選項

雙次分析相同只能證明決定性，無法偵測同樣的回歸。需求方要求四類 fixture 的預期摘要，並禁止修改既有斷言。可比對整份圖或固定統計投影；本輪依明確指定的摘要欄位採後者，原逐 bytes 與語意斷言保留。

## 決定

在 fixtures/wp10/golden 簽入四份初始 summary.json：畫面數、元件 kind 數、行為類型數、API 總數與三種狀態、檢核層級數、圖診斷代碼數。enum 分組含零值；API 包含所有 canonical ENDPOINT，初始 review 沒有任何決策。診斷只計圖的 diagnostics，與環境相關的預覽診斷不混入。

API 狀態使用正式 viewer／md 的共用 deriveApiUsage；Node 整合測試直接讀 Java CLI first／second 報表 payload，逐欄比對 golden。不得只比較摘要總量，新增／刪除鍵、型別或任一數量不同皆失敗；錯誤帶 family／欄位路徑。新增 mutation test 檢查所有摘要葉節點及增減鍵的失敗行為。

曾嘗試 Java ApiUsage 產生摘要，遇到 CALL_API 的 null target 在 TreeMap.containsKey 觸發例外。摘要改直接重用實際報表的共用推導函式；不為本輪增加正式程式碼修正，不重新實作 API 規則。該 Java 例外尚未修正。

## 後果與更新規則

四份 golden 是初始建立，來自已通過的 WP10 原 fixture 與正式分析；未改 fixture、既有 v1 golden、任何既有測試斷言或輸出契約。測試不得寫入 golden；後續更新必須人工審查證據與差異，在提交說明列原因、family／欄位與前後值，不能只為消除失敗而更新。

使用指南增加「匯出後如何交給 AI」「如何判斷分析結果是否可信」，說明完整 md、固定警語、附錄 A 不可修改，以及診斷／來源／候選與需要分析人員協助的情況。無新相依；範圍限摘要 golden 與兩節指南。
