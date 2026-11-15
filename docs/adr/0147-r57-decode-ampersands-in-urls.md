# ADR 0147：R57 URL 中的 `&amp;` 在使用處解碼一次

## 背景

[CODE_REVIEW_20261114](../CODE_REVIEW_20261114.md) 的 RV-313、RV-424、RV-521、RV-522：`MarkupTag` 讀屬性時不解碼 HTML 實體，所以 XHTML 正確寫法的 `a.do?x=1&amp;y=2`，以及 Thymeleaf／struts-menu 投影後經過 escape 的 URL，在 graph 中都保留 `&amp;`，Struts 依 `&` 切 query string 時取不到 dispatch 參數。capture 端則有另外兩個編碼問題。

## 決定

- R57-1：不在 `MarkupTag.attribute` 全面解碼。`StaticComponentNames` 會再解碼顯示文字、`JspTagFileExpander` 會先 escape 再代入，全面解碼會造成重複解碼。
- R57-2：新增 `MarkupTag.decodeAmpersands`，只把 `&amp;`、`&#38;`、`&#x26;` 換回 `&`（ampersand 是唯一會改變 query string 切法的實體）。用在兩處：
  - JSP parser 建立 interaction target 時（涵蓋 Thymeleaf 與 struts-menu 投影出來的 URL）。
  - Struts 依 `&` 切 query string 的 4 個位置（dispatch 參數、請求參數、SwitchAction）。
  - 元件節點上的原始屬性（`href` 等）保持原樣，維持可追溯。
- R57-3（RV-521）：`pack-preview` 對已在前面解碼並重寫過的 `style`、`src`、`poster`，輸出時不再解碼第二次。
- R57-4（RV-522）：capture 把相對資源 URL 對應到磁碟檔案前，先 `decodeURIComponent` 路徑，含空白或中文的檔名才找得到；解碼失敗時保留原標記。

## 後果

- XHTML 寫法的 Struts 連結可以解析出 dispatch 方法；Thymeleaf `@{/orders(page=1,size=10)}` 的 target 為 `/orders?page=1&size=10`。
- 驗證：RV-313、RV-424、RV-521 各新增測試並確認修改前失敗；RV-522 位於擷取腳本內部的函式，沒有可單獨呼叫的入口，未加自動測試。JS 181、capture 97、Maven 全數通過。
