# ADR 0175：R100 外部登入導回路徑的其他網址組法

## 背景

R88（[ADR 0166](0166-r88-login-return-through-helpers-and-configuration.md)）只認 Spring 的 `UriComponentsBuilder`，其他組網址寫法仍標「無法確定」。

## 決定（`SpringExternalLoginFlow` 讀值器）

- `String.format("模板", 參數…)`：依序以參數的值取代 `%s`／`%d` 等（`%%` 保留），參數無法讀取時以 `{n}` 佔位並標記無法確定。
- `URI.create(x)`、`new URI(x)`：取 `x`；`toString()`、`toASCIIString()` 取其來源。
- `a.concat(b)`、`new StringBuilder(a).append(b)…`：串接。
- `UriComponentsBuilder…path(p)`／`pathSegment(p)` 接在路徑後；`ServletUriComponentsBuilder.fromCurrentContextPath()` 視為空字串起點（context path）。
- `RedirectStrategy.sendRedirect(request, response, url)`：取最後一個參數。
- 沒有自訂 successHandler 時，`oauth2Login(o -> o.defaultSuccessUrl("…"))` 的字面值作為導回路徑，並建立 `FORWARDS_TO`。

## 測試

- Java `R88ExternalLoginReturnTest` 新增 2 個（R100）。既有測試不需修改。

## 後果

- reservio 結果不變。以設定檔外的執行期值（資料庫、請求參數）組成的網址仍無法確定。
