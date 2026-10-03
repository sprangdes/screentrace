# ADR 0031：manifest 欄位與集合上限

日期：2026-10-04。狀態：採用（WP9 驗收後補強授權）。

## 背景

既有 5 MiB／2,000 元件上限未限制單一欄位與元件內部集合。需求方要求新增 Schema 上限，禁止修改既有測試斷言；本輪不進入 WP10。

## 選項與決定

採 draft 2020-12 的 maxLength／maxItems，沿用共用驗證入口，不另建 CLI／HTML 驗證規則。library.name／version 與元件 id／name／selector／category 設 maxLength 200；所有 description（元件、inputs、outputs、slots）與 usage 設 4,000。每元件 inputs／outputs／slots／matches 設 maxItems 200；matches 原 minItems 1 保留。

長度依 JSON Schema 的 Unicode code point 定義，不以 UTF-16 單位計數。上限值本身合法，超過一個即拒絕。這是輸入驗證，與 md 正文 300 字元顯示規則分開。

maxLength／maxItems 錯誤以 validator 的 instanceLocation 與 schema 上限產生繁體中文訊息，保留規則鍵，不回顯超限文字；其他既有錯誤保持原行為與決定性排序。

## 後果與驗證

既有虛構 sample 不需改內容，新增 CLI 成功驗證與失敗 validate／import 測試。三項新測試先失敗後實作，逐一驗證所有受限欄位的邊界與溢位、四集合 200／201、補充字元計數、路徑與上限訊息、過長原文不回顯及失敗不儲存。所有既有斷言與 v1 golden 不變；沒有新相依、沒有新格式版本。
