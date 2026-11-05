# ADR 0122：R31 移除 capture 舊的 inline CSS 封裝入口

## 背景

[ADR 0021](0021-retire-historical-viewer.md) 讓正式 CLI 改用 `packStandaloneDocuments`（樣式表以 CSS data URI 依雜湊存放一次），但保留了 C 增量的舊入口 `packDocuments`（樣式表內嵌為 `<style>`，`@import` 改寫成 `@media` 或直接展開），只給歷史 fixture 使用，並在 ROADMAP 記為「capture 相容清理」技術債。目前沒有任何正式程式呼叫 `packDocuments`；只有 `pack-preview.test.mjs` 的 3 個測試與 viewer 的 `packed.e2e.mjs` 使用它。

## 選項

1. 移除舊入口與使用它的 4 個測試：會失去符號連結、路徑穿越與主動內容移除的安全測試，不採用。
2. 移除舊入口，4 個測試改用 `packStandaloneDocuments`，斷言改為檢查 CSS 資產字典：採用。

## 決定

- R31-1：`pack-preview.mjs` 只匯出 `packStandaloneDocuments`。移除 `packDocuments` 與內嵌 `<style>`、`@import` 改寫成 `@media` 的分支；正式封裝的輸出不變。
- R31-2：`pack-preview.test.mjs` 的 3 個測試與 `packed.e2e.mjs` 改用 `packStandaloneDocuments`。原本檢查文件內嵌 CSS 的斷言改為解碼 CSS 資產後檢查：樣式表與 `@import` 各存一份、外部網址不會出現在文件或樣式表中；其餘安全斷言（移除 script、base、事件屬性、外部圖片，拒絕符號連結與路徑穿越）原文保留。
- R31-3：viewer 的 `css-assets.test.mjs` 中檢查「CLI 不使用舊入口」的測試，改為檢查模組只匯出 `packStandaloneDocuments`、原始碼不再有 `packDocuments` 或 `<style>`。
- R31-4：只改 capture 工具、測試與文件；分析、報表與 viewer 程式不變。

## 後果

ROADMAP 的「capture 相容清理」技術債結案，封裝只剩一條路徑。
