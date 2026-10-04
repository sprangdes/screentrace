# ADR 0045：WP21 靜態可見元件名稱

## 決定

沿用 JSP 標記 tokenizer 與 WP17 tag 展開後的來源，對既有元件加上通用 attributes.visibleText、displayName、labelSource；不新增 schema 欄位，不在 core 放框架判斷。名稱依可證明文字、aria-label、title、name、id、中文類型與序號順序選取，合併空白並限制 40 個 Unicode code point。visibleText 保存正規化前文字，title 等原始屬性保留。

只讀取自己的展開來源與子元素文字；不依預覽 DOM 順序或相似度配對。字面 EL 常數、完整 fn:escapeXml(字面常數)、無 code 的 spring:message text 可解析；未知函式、動態值、條件標記、訊息 bundle code 無法證明時退回。腳本、樣式與明確隱藏子元素不算可見文字。沿用呼叫處及 tag 定義的既有證據。

原先的 MarkupAnalysis.parse 與 stable ID 計算保留；標籤補充只在專案 JSP 分析層套用，元件 ID、行為、關聯與證據不變。viewer 優先採圖中證明的文字，避免示範預覽的替代文字覆蓋它。

## 測試與斷言

新增失敗測試先提交 564ceb3：8 個 Java 測試有 7 個失敗、1 個 viewer 測試失敗。追加的格式不完整 escapeXml 反例在修正前亦失敗（誤取 broken）；實作要求完整語法後通過。新測試自身的 40 字預期修正為實際前 40 code point，並把字面 EL 的 ampersand fixture 改為原始 &，避免混淆 HTML entity 和字串常數。

沒有修改任何原有測試斷言、fixture、golden；沒有 graph golden 變更。完整驗證：250 Java、40 JS、55 viewer、33 capture、65 Chromium E2E。既有 md、API 共用向量、安全、決定性測試保留並通過。
