# ADR 0135：R44 拆分 react/analyzer.mjs

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-001 的最後一個大型檔案是 `screentrace-js/react/analyzer.mjs`：R40 排版後有 3,878 行、64 個頂層宣告，包括 1,867 行的 `ScreenRenderer` 類別與 424 行的 `EffectRunner` 類別。`StrutsProjectAnalyzer` 已在 R41（[ADR 0132](0132-r41-split-struts-project-analyzer.md)）拆分。

## 決定

- R44-1：只搬移，不改邏輯。64 個頂層宣告（含前置註解）依功能分到 `screentrace-js/react/` 的 9 個模組，宣告文字逐字不變；各模組只匯入實際用到的名稱，並在檔案結尾以 `export { … }` 匯出其他模組需要的名稱。
- R44-2：分組如下：

  | 模組 | 內容 |
  |---|---|
  | `analyzer.mjs` | 公開入口 `analyzeReact`，並轉出 `PARSER` |
  | `routes.mjs` | 路由宣告、根 render、路由比對、查詢參數入口 |
  | `jsx.mjs` | JSX 出現位置與屬性讀取 |
  | `screen-renderer.mjs` | `ScreenRenderer`：每個路由畫面的元件樹與互動元件 |
  | `effects.mjs` | `EffectRunner`：effect hook 與載入時的請求 |
  | `branches.mjs` | 條件分支、guard 合併、提早 return |
  | `text.mjs` | 標籤、可見文字、元件種類 |
  | `urls.mjs` | 位置判斷、相對 URL、導向目的地 |
  | `dialogs.mjs` | 條件式對話框的初始關閉狀態 |

- R44-3：只被一個模組使用的常數放在該模組；`ROUTER`、`REACT`、`ROUTER_FACTORIES` 放在 `routes.mjs`。模組之間有循環匯入，但都只在函式執行時取用，不在模組載入時取用。
- R44-4：`analyzeReact` 與 `PARSER` 的匯入路徑不變（`react/analyzer.mjs`），呼叫端與測試不需修改。
- R44-5：`ScreenRenderer` 仍是 1,867 行的單一類別；拆它的方法需要改寫 `this` 的用法，不屬於只搬移，留待之後修改相關功能時再做。

## 後果

- `analyzer.mjs` 從 3,878 行降為 366 行；最大的模組是 `screen-renderer.mjs`（1,908 行），其次是 `routes.mjs`（474 行）。
- 驗證：
  - 以 acorn 解析拆分前後：64 個頂層宣告逐字相同，沒有重複或多出的宣告；以 token 檢查每個模組，沒有用到卻未匯入的原頂層名稱。
  - JS 測試 180 個、capture 87 個全部通過；Maven 584 個測試 579 通過、5 個依作業系統條件略過；格式檢查通過。
  - 以拆分前後的 `screentrace-js` 分析 React 測試專案（`screentrace-adapter-spring/src/test/resources/r19`），27 個產物檔案完全相同。
