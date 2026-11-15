# ADR 0153：R70 review md 的附錄區塊之後允許空行

## 背景

[CODE_REVIEW_20261114](../CODE_REVIEW_20261114.md) 的 RV-610：匯入 review md 時，附錄 A 的結束圍欄之後只允許單一檔案結尾換行（[REVIEW_MD_CONTRACT](../REVIEW_MD_CONTRACT.md)、[ADR 0023](0023-review-md-machine-state.md)「必須文件末尾」）。編輯器常在存檔時多加一個換行，使用者打開 md 看一眼、存檔後，檔案就無法再匯入。

## 決定

- R70-1：結束圍欄之後的行只要全是空行（不含任何字元，`\r\n` 換行一併處理）就接受；任何其他內容，包括只有空白字元的行，仍拒絕並回報「review state 必須為文件最後區塊」。
- R70-2：匯出格式不變，仍以單一換行結尾。

## 後果

- 「附錄區塊必須是文件最後的內容」的規則不變，只放寬對檔尾空行的判斷；ADR 0023 的「必須文件末尾」依此解讀。
- 只有一個實作（`screentrace-viewer/src/shared/review-md.ts`），瀏覽器與 Node 模組共用，不需同步其他語言。
