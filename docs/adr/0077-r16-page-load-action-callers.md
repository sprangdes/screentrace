# ADR 0077：R16 Struts 頁面載入 action 呼叫來源

## 狀態

已採用，依 OQ-033 方案 A。

## 背景

R16 逐筆核對發現靜態 JSP tag 與 JSP server-side navigation 可以直接請求 Struts action，但圖中沒有 caller。另一方面，`scripting-mailreader` 的 `/Delete*` 只有文件範例中的字串，實際刪除流程使用 `/EditSubscription?task=Delete` 與 `/SaveSubscription.do`；把任務值改寫成 `/Delete*` caller 會捏造一個未發出的 URL。

## 決定

- 將產生 action URL 的 Struts image/rewrite tag（`html:img`、`html:image`、`html:rewrite` 及 EL 對應 tag）與指向 action 的 `jsp:forward page`、`jsp:include page` 視為畫面載入時的請求。只有靜態、唯一解析的目標才形成 `SCREEN → ENDPOINT` 的 `CALLS` 關係；靜態來源 evidence 標為 `basis=STATIC_URL`，保留原始檔與行號。
- `jsp:include` 指向 JSP、HTML、樣式、腳本、圖片或其他靜態資源時維持 view/resource include；即使存在 catch-all wildcard，也不得因此當作 action caller。只有 path 能解析到 Struts action 時，才建立 action 呼叫來源。
- escaped HTML 文字及 `<pre>`／`<code>` 中的範例不是可執行標記，不參與 tag/action caller 擷取。此規則與來源標記解析共用，不以內容相似度推測。
- `scripting-mailreader /Delete*` 維持沒有呼叫來源。報表說明刪除操作由 `/EditSubscription?task=Delete`（匹配 `/Edit*`）與 `/SaveSubscription.do` 承載；`mailreader /Delete*` 的使用中狀態不變。
- 只調整 Struts 分析。沒有更新既有斷言或 fixture；Struts 數量從只讀分析 graph 計算。eMusicStore 與 PetClinic 的 graph SHA-256 維持不變。

## 測試先行與實測

新測試在各實作提交前先提交，沒有修改既有斷言：

| 測試 | 失敗測試提交 | 實作提交 | 覆蓋內容 |
|---|---|---|---|
| `generatedActionUrlsAndJspForwardIncludeAreScreenLoadCallersWithStaticEvidence` | `cc7ecba` | `7973998` | 合成 `html:img`、`html:image`、`html:rewrite`、`jsp:forward` 與 `jsp:include`；驗證 caller 來源與 `STATIC_URL` evidence。 |
| `escapedAndPreformattedMarkupExamplesDoNotCreateCallSources` | `cc7ecba` | `7973998` | escaped angle-bracket 文字及 `<pre>`／`<code>` 內的 action 範例不建立關係。 |
| `jspIncludeOfAViewIsNotAnActionCallerEvenWhenCatchAllWildcardExists` | `ec5b770` | `4ba40dc` | 一般 JSP view include 在 catch-all wildcard 存在時仍不會連到 action endpoint。 |

`StrutsR16ScreenLoadCallersTest` 與 `StrutsR16RoutingTest` 共 23 項通過；`mvn -B verify` 共 352 項 Java 測試（351 通過、1 跳過），其餘完整驗證數字見 `docs/reports/R16.md`。測試對應的實際模組結果為：

- `examples` 的 `ANY /exercise/html-img-action.do` 由 `exercise/html-img.jsp:48` 呼叫，confidence `CONFIRMED`，evidence 為 `basis=STATIC_URL；載入時來源=html:img`。
- `faces-example2` 的 `ANY /welcome.do` 由 `index.jsp:23` 的 `<jsp:forward page="welcome.do"/>` 呼叫，confidence `CONFIRMED`，evidence 為 `basis=STATIC_URL；載入時來源=jsp:forward`。
- `mailreader /Delete*.do` 使用中；matched path 為 `/DeleteSubscription`。
- `scripting-mailreader /Delete*.do` 仍找不到呼叫來源；`/DeleteSubscription` 在 escaped tour 範例中的文字沒有成為 caller。

## 後果

畫面載入觸發的 Struts 資源與 server-side navigation request 可出現在 API 使用狀態與 caller 詳情；靜態資源 include 和文件範例不會製造 action 關係。WP54 已完成本次補正，仍依 R16 停止點等待需求方驗收。
