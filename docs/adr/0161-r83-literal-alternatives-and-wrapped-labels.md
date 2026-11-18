# ADR 0161：R83 物件字面值的屬性文字、含 spread 的字面陣列、以 `<label>` 命名欄位

## 背景

[reservio 評估（2026-11-18）](../RESERVIO_EVALUATION_20261118.md) P3：React 畫面的按鈕文字與選項由程式組出來時，報表顯示「示例值」或遺失：

- 首頁 `const primary = isCustomer ? { label: '前往預約', … } : { label: '開始預約', … }`，`{primary.label}` 顯示「示例值」。
- 預約間隔 `[15, 30, 45, 60, ...(自訂 ? [值] : [])].map(n => <label><input type="radio"/><span>{n} 分鐘</span></label>)` 只剩一個「分鐘」，radio 沒有名稱。

## 決定

- **屬性讀取**：`evaluator.strings` 新增 `MemberExpression`：物件是物件字面值、條件運算式的兩個分支（條件無法確定時兩者都取）或常數變數的初始值時，讀各物件的同名屬性，結果為文字選項的聯集。任一物件含 spread、計算屬性或缺少該屬性時，整個讀取視為無法確定（不混合已證明與未證明的值）。按鈕名稱沿用既有「A / B」寫法（同 `登出中… / 登出`）；預覽文字在所有選項都是字面值時也寫成「A / B」，否則仍為「示例值」。
- **字面陣列的 spread**：`.map` 的對象是陣列字面值時，非 spread 項目逐一展開；spread 的對象是陣列字面值、或條件已知的條件運算式時加入其項目；條件無法確定的選用項目（`...(x ? [v] : [])`）不加入。項目總數仍受 `MAX_UNROLLED` 限制，超過或有空洞時維持一個重複元件。
- **以 `<label>` 命名**：沒有可見文字或名稱屬性的輸入類元件（RADIO、CHECKBOX、TEXT_INPUT、TEXTAREA、SELECT、MULTI_SELECT、DATE_PICKER、FILE_INPUT）在 `<label>` 內時，以該 label 的可見文字命名，`labelSource` 為 `label`。

## 測試

- JS `r83-literal-alternatives.test`（2）。既有 JS（201）、Maven 全部測試不需修改。

## 後果

- 展開後的選項各自成為元件，元件 ID 以 `[索引]` 區分；原本的單一重複元件 ID 消失，舊進度檔中對它的標記會列為 orphan。
- 畫面變體的身分事實（例如「未登入」）不會傳進以 props 傳遞的推導值（`isCustomer = me?.role === …`）。reservio 訪客首頁仍顯示兩種身分的文字（「前往預約 / 開始預約」），導覽列由函式回傳兩組陣列（`publicNavigationItems(isCustomer)`），條件無法確定，仍為一個顯示「示例值」的重複連結。
