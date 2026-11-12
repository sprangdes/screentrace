# ADR 0140：R49 JavaScript 以 ESLint、TypeScript 以 tsc 檢查

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-001 的最後一段：三個 Node 套件已經以 Prettier 排版（R40，ADR 0131），但還沒有 lint 規則。試跑 ESLint 10 的建議規則與 typescript-eslint 的 recommended，246 個檔案共 66 筆，沒有找到實際的 bug：

- 30 筆沒用到的變數
- 15 個空的區塊
- 6 筆 `any`
- 6 筆 `no-undef`，都是 e2e 測試以 `addScriptTag` 注入的全域變數
- 4 筆用不到的指定
- 5 筆其他

實作時發現 typescript-eslint 8.72.2 要求 TypeScript `>=4.8.4 <6.1.0`，與 viewer 使用的 TypeScript 7.0.2 不相容。

## 決定

- R49-1：`screentrace-viewer` 的 devDependencies 加入 ESLint 10.14.0、`@eslint/js` 10.0.1、`globals` 17.14.0，固定版本，與 Prettier 放在一起。設定檔是 `screentrace-viewer/eslint.config.mjs`，涵蓋三個套件的 `.js`／`.mjs`：
  - 規則使用 `js.configs.recommended`。
  - 唯一的調整是 `no-unused-vars` 開啟 `ignoreRestSiblings`，因為 `({ omitted, ...rest }) => rest` 是刻意捨棄屬性的寫法。
  - 多餘的 `eslint-disable` 註解也視為錯誤。
  - `npm --prefix screentrace-viewer run lint` 從根目錄執行（ESLint 10 以設定檔所在目錄或工作目錄為範圍）。CI 在格式檢查之後加上「Lint JavaScript」。
- R49-2：TypeScript 不用 typescript-eslint，改在 `tsconfig.json` 開啟 `noUnusedLocals` 與 `noUnusedParameters`。viewer 建置原本就先執行 `tsc --noEmit`，所以 CI 會擋下沒用到的變數與參數。
  - `strict` 已經禁止隱含的 `any`；明確寫出的 `any` 沒有規則可擋，等 typescript-eslint 支援 TypeScript 7 後再評估。
  - 參數因為介面需要而保留時，以 `_` 開頭命名。
- R49-3：修正全部的結果，沒有改變行為：
  - 刪除沒用到的 import、函式與變數。結果沒被使用的純計算一併刪除，例如 `screen-renderer.mjs` 的 `callee` 與 `canvas.ts` 的 `known`、`incoming`。測試裡會在找不到元素時失敗的呼叫（`layerBox`）保留，只拿掉沒用到的變數。
  - 用不到的初始值與指定改掉（`let ast;`、`let chosen;`、`start` 移進使用它的區塊、刪除 `left = right;`）。
  - 15 個空的 `catch` 各加一行註解，說明為什麼可以忽略，行為不變。錯誤處理的策略留在 HC-002 一起處理。
  - 兩個多餘的 regex 跳脫字元改掉，比對結果相同。`readAnalysisGraph` 重新拋出錯誤時附上原始錯誤（`cause`），訊息不變。
  - e2e 測試以 `/* global … */` 宣告注入的全域變數。
- R49-4：Java 不在這一輪。`javac -Xlint:all` 有 79 個警告：
  - 40 個泛型 varargs
  - 15 個呼叫 deprecated 的 `ApplicationGraph` 相容建構子
  - 15 個 Jackson 的 deprecated API
  - 其餘是 serialVersionUID 與多餘的轉型

  大多是雜訊。是否導入 Error Prone 這類工具，記在 HEALTH_CHECK 待辦。

## 後果

- `npm audit` 對 ESLint 10 回報 4 個 moderate：同一個 minimatch 的 ReDoS（GHSA-g3hv-75wg-m249）。修正版是 minimatch 11，但 ESLint 10 要求 `^10`，強制覆寫要跨大版本，所以這一輪不做。它只是開發工具，只比對本專案自己的檔案路徑；CI 的 audit 門檻是 high，不受影響。等 ESLint 更新相依後再升級。
- 驗證：
  - 未壓縮建置的 `viewer.js` 修改前後只差在刪除的死碼與改名的參數。壓縮後的 `viewer.js` 因為名稱重新編號而不同。
  - 15 個 fixtures 中，14 份報表把內嵌的 `viewer.js` 與其 SHA-256 換成新版後，與修改前逐位元組相同；`report-size.json` 每份小 131 bytes；其他產物逐位元組相同。`r7/coverage` 的報表同樣通過；`struts2-rejected` 依設計不產生報表。
  - 測試結果：

    | 項目 | 結果 |
    |---|---|
    | JS 測試 | 180 個全部通過 |
    | capture 測試 | 93 個通過。第一次執行有 1 個失敗，之後連續 6 次（包含與 JS 測試同時執行）都無法重現 |
    | viewer 單元測試 | 148 個全部通過 |
    | 受影響的 4 個 e2e 測試檔 | 15 個全部通過 |
    | Maven | 598 個（593 通過、5 略過） |
