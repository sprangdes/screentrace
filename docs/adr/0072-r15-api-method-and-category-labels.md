# ADR 0072：R15 API 方法與分類標籤

## 背景

API 清單曾把端點分類 `REDIRECT` 寫進 HTTP 方法徽章，導致 `ANY /...` 同時丟失方法語意，分類列也可能顯示 `REDIRECT`、`REST_API` 或 `MVC_SCREEN` 等內部值。

## 決定

- 方法徽章依方法呈現：`ANY` 顯示「任何方法」，tooltip 保留 `ANY`；既有特殊方法值 `REDIRECT` 顯示「轉址」，tooltip 保留 `REDIRECT`。
- 分類標籤獨立呈現：`REDIRECT` →「轉址」、`REST_API` →「API」、`MVC_SCREEN` →「畫面網址」；未知分類顯示「其他」。分類 tooltip 保留來源值。
- 不更動圖資料、endpoint 分類或 API 狀態。

## 既有測試斷言授權記錄（OQ-023 方案 B）

依 R14 §2.4 格式記錄需求方明確授權的單一 selector 調整：

| 測試 | 舊定位／預期 | 新定位／預期 | 原因 |
|---|---|---|---|
| `R14 redirect-category rows show 轉址 and retain REDIRECT in the tooltip`（`r14-redirect-category-label.e2e.mjs`） | `[data-method]` 的文字為「轉址」、tooltip 為 `REDIRECT` | `[data-api-category]` 的文字仍為「轉址」、tooltip 仍為 `REDIRECT` | 方法徽章須依 `ANY` 顯示「任何方法」；「轉址」屬於分類，不應由方法徽章承載。只調整 selector，文字與 tooltip 斷言不變。其他既有斷言不變。 |
| `WP22 category groups default to APIs, retain unknown categories and count current group`（`r5-endpoints.e2e.mjs`） | 分類列可見原值 `CUSTOM` | 分類列顯示「其他」，tooltip 仍為 `CUSTOM` | WP51 要求分類代碼改為白話並保留原值在 tooltip；此斷言直接鎖定 API 分類文字，依 R15 預先授權更新，未變更分類數量或分組斷言。 |

在舊實作上執行更新後的 selector，分類元素沒有 `data-api-category`，測試因找不到該元素而逾時失敗。`CUSTOM` 新預期在舊實作顯示為原值，亦不符合「其他」預期。WP51 新測試在舊 viewer 上也失敗：API 頁可見文字仍含 `REDIRECT`，且方法徽章顯示「轉址」而非「任何方法」。

## 後果

方法與分類各自使用獨立標籤；來源代碼只存在 tooltip。單一 HTML 報表與原 API 資料保持不變。
