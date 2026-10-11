# ADR 0046：WP22 頁面路由與 API 呈現

## 決定

只使用 ENDPOINT.attributes.category：MVC_SCREEN 為頁面路由，非空的其他分類為 API，缺值為未分類。預設 API，提供頁面路由／全部端點／未分類切換。其他分類與未分類顯示實際值；總數始終可見，狀態晶片依目前分類計算。另有 N 個頁面路由可直接切換。

操作文字依既有 behavior.type：NAVIGATE 顯示前往與 URL，SUBMIT_FORM 顯示送出表單與路由，CALL_API 顯示呼叫 API 與方法路徑。目的畫面只沿圖中既有 HANDLED_BY、RENDERS、FORWARDS_TO、REDIRECTS_TO、NAVIGATES_TO 證明；不依元件的其他導向或相似 URL 猜配。多個可證明目的全數列出。沒有證明時只顯示前往頁面與路由。

畫面 API 標籤頁只列 category 已分類 API 的端點。未分類呼叫保留在操作區，載入／未解析來源、證據与查詢入口不丟棄。既有 shared/review、usage、md 模組、共用向量與 schema 不改。

## 呈現測試入口調整

既有斷言本身沒有改動。既有 fixture 沒有 category，不補捏造分類；它們的相同資料改从新 UI 的正確入口檢查。下表逐處記錄前提變化，避免把呈現入口當成 API 狀態推導變更。

| 測試 | 舊入口／预期 | 新入口／预期 | 原因 |
|---|---|---|---|
| API page shows three derived states, all caller groups, search/filter/sort and clickable jump/highlight | 開 API 即檢查全部 3 端點與既有狀態 | 開 API 後切全部端點，仍檢查相同 3 端點與相同狀態；第二次開啟也切全部 | API 預設不含未分類 |
| unresolved event callers are not mislabeled load and edge callers retain file and line | 開 API 查 ep | 切全部端點查相同 ep | 保留來源及行號斷言 |
| API rows summarize callers, filter by method and caller text, and jump to a highlighted caller | 開 API 查全部 | 切全部端點，方法、查詢與 caller 斷言不變 | 缺值未分類 |
| API caller summary shows only three inline and expands every additional caller | 開 API 查 ep | 切全部端點查相同 ep | 保留全數 caller 斷言 |
| UI4 API master-detail keeps single-line badges, callers, contracts and all filters | 兩次開 API 直接查全部 | 兩次切全部端點；所有尺寸、契約、來源、filter 斷言不變 | 預設群組替換 |
| captured legacy element paths preserve exact visible labels, styles and caller highlights | API 頁直接查 ep | 切全部端點再查 ep | 精確標籤與 highlight 斷言不變 |
| malicious API paths and behavior expressions remain text across detail views | API 頁直接查 ep | 切全部端點再查 ep | 安全斷言完整保留；惡意 fixture 不變 |
| WP20 API callers occupy independent rows with screen and readable operation labels | API 頁直接查 api | 切全部端點查 api | 呼叫來源列與名稱斷言不變 |
| focus links, tooltip overflow, back, API/behavior detail and all-element style clicks | 兩次畫面 API tab 查未分類呼叫 | 兩次操作 tab 查同一未分類呼叫 | 載入來源、證據、樣式等斷言不變 |
| UI3 tabs preserve API, rules, evidence and brace URLs with compact direct review | 畫面 API tab 查未分類 ep | 操作 tab 查同一 ep | 4 個 tab、證據、檢核、URL、review 與匯出斷言不變 |

未修改 fixture、golden、API 狀態推導或 md 往返測試。新增兩個合成 E2E 先提交 ec26537，舊實作均失敗：應顯示 2 API 卻顯示 5；應前往乙與 /page 卻顯示呼叫 GET /page。新實作通過，包括群組計數、全部與未分類保留、表單措辭、載入 API、畫面無 API 空狀態。
