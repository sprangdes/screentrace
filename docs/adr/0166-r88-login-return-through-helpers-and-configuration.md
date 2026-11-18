# ADR 0166：R88 外部登入導回路徑：有參數的輔助方法、UriComponentsBuilder 與設定類別

## 背景

[reservio 評估（2026-11-18）](../RESERVIO_EVALUATION_20261118.md) P8：LINE 登入完成後的導回路徑報表顯示「無法確定」（`EXTERNAL_LOGIN_RETURN_UNRESOLVED`）。reservio 的 successHandler 寫成 `sendRedirect(buildSuccessRedirect(role))`，`buildSuccessRedirect` 以 `redirectBuilder(properties.successRedirectPath()).queryParam(…).build().toUriString()` 組成，`redirectBuilder` 依條件用 `fromUriString` 或 `fromPath`，而路徑取自 `@ConfigurationProperties(prefix = "app.auth")` 的 record。原本的讀值器（ADR 0102 的外部登入流程）遇到有參數的方法即停止。

## 決定（`SpringExternalLoginFlow` 的讀值器）

- **有參數的同類別方法**：參數個數相符時，先在呼叫端讀出各引數的值，再代入被呼叫方法的參數讀其 return。
- **條件運算式**：兩個分支的值都列入。
- **UriComponentsBuilder**：`fromPath`／`fromUriString`／`fromHttpUrl` 取參數的值，絕對網址只留路徑（前端路由只能比對路徑）；`build`、`toUriString`、`encode` 等原樣傳遞；`queryParam("k", "v")` 字面值時加上 `k=v`，值不是字面值時寫 `k={k}`。鏈的起點可以是工廠方法或本類別的輔助方法。
- **設定類別**：`欄位.存取子()` 的欄位型別是 `@ConfigurationProperties(prefix = p)` 類別時，鍵為 `p.` 加存取子的 kebab-case（去掉 `get`），值取自所有 `application*.properties／.yml`（沿用 ADR 0159 的設定讀取；`${ENV:預設}` 取預設值），每個設定位置都成為證據。沒有任何檔案設定該鍵時仍標「無法確定」，但其他分支已證明的路徑保留。
- 讀到的路徑沿用既有規則：以路徑比對畫面路由建立 `FORWARDS_TO`，並寫入 `externalLoginReturns`。

## 測試

- Java `R88ExternalLoginReturnTest`（2）。既有測試不需修改。

## 後果

- reservio 兩個 LINE 登入端點的導回路徑解析為 `/login?lineLogin=success&role={role}` 與 `/login?lineLogin=failed&reason=missing_userId`，診斷消失。
- 只認 Spring 的 `UriComponentsBuilder` 系列；其他 URL 組法（字串格式化、`URI.create`）仍標無法確定。
