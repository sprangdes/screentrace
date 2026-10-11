# ADR 0009：JavaScript 公開 API 語意表與未解析來源

## 背景

成熟 AST 提供語法結構，但第三方壓縮實作不應被當作應用行為來源。載入與選擇器綁定失敗的呼叫也不能遺失。

## 選項

解析所有第三方內部；或識別檔名／檔頭並以公開 API 表解析應用呼叫。

## 決定

採 api-table.json，對照 jQuery、Bootstrap、jQuery UI、jquery.validate、select2、日期選擇器。檔头僅接受開頭註解，不以字串內容辨識。已知函式庫跳過內部，應用中的呼叫依 AST receiver 與方法辨識；未知函式庫呼叫 UNKNOWN／UNKNOWN_CALL，保留原文與行號。Native Bootstrap 實例與 XHR 由來源宣告／open／send 關係識別，不建構實例。

導頁、表單、API、彈窗、CLIENT 規則、UI 狀態與欄位連動輸出獨立 JSON 貢獻；JSON 包含 HTTP 方法、URL／未知值、欄位名、guard、觸發來源與解析狀態。HTTP method 只有真正缺值才可缺省 GET；明示但未知的 method 保持 UNRESOLVED。普通程式呼叫不因名稱相似而聲稱已知語意。

ready／load／頂層呼叫以 screen ID 觸發。無法匹配事件元件時，以已知所屬畫面保留該事件的呼叫，事件名稱及 selector 原文不變，來源狀態 UNRESOLVED；不捏造已匹配元件。回呼與跨函式追蹤在下一增量實作，未解析 API URL 保留而不建立虛構 URL。

## 後果

第三方表與所有行為種類均有測試；eval、computed access、使用者輸入 URL 不求值。JSON 與 Java canonical graph 整合在增量四完成，後端 URL 比對仍屬 WP5，不於此處推導後端 handler。
