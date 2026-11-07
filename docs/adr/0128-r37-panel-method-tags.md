# ADR 0128：R37 畫面側欄的 API 清單使用與 API 頁相同的方法標籤

## 背景

API 頁從 R32（ADR 0123）起用依方法上色的標籤（`.method-badge`，GET 藍、POST 紫、PUT／PATCH 青、DELETE 紅）標出每個 API 的請求方法。打開畫面時，右側欄「呼叫的 API」仍以純文字列出（例如 `GET /api/csrf`），同一個 API 在兩處看起來不一樣。需求方要求兩處一致。

## 決定

- R37-1：右側欄「呼叫的 API」的每一列改為 API 頁的 `methodBadge` 標籤加上 `pathCode` 路徑（路徑參數同樣標出），標籤放在固定寬度的一欄，路徑對齊；方法為 `ANY` 時標籤寫「任何」，與 API 頁相同。
- R37-2：`methodBadge` 由 `api-page.ts` 匯出，兩處共用同一個元件與樣式，不另寫一份。
- R37-3：按鈕的 `aria-label` 保留原本的文字（例如「GET /api/csrf」、「任何方法 /path」），點了仍前往 API 頁；路徑維持連結色。排序與 `data-api` 不變。只改 viewer 的程式、樣式、測試與文件；分析與 graph JSON 不變。

## 後果

同一個 API 在畫面側欄與 API 頁有相同的方法標籤，一眼就能對上。
