# ADR 0026：Review md 隱形字元隔離與 code span 忠實度

- 日期：2026-10-03
- 狀態：採用（使用者於 WP8 驗收後明確授權）

## 決定

正文 visible 與機器區 machineJson 擴充 U+200B–200F、U+2060–2064、U+FEFF、U+FE00–FE0F、U+E0100–E01EF、U+E0000–E007F。兩者使用 Unicode u 正規表示式，以完整 code point 比對。正文新增字元採可見的 \u{XXXXX}；機器區採 JSON 合法 UTF-16 \uXXXX，非 BMP 完整輸出代理對。既有跳脫字面序列的詞元辨識與既有控制字元表示不變，機器區保留原始值與完整 ID，摘要仍對原始正規化狀態計算。

正文 code span 不再將 &、<、> 轉換為實體。code span 內容不會被解讀為 HTML；實體化會把 count < max && total > min 改成不同文字，降低條件忠實度。仍以長於內容的反引號圍欄隔離，保留表格管線跳脫、單行可見控制字元、300 字元截斷與來源標記。禁止完整 HTML／程式／自由 detail 的原有邊界不變。YAML／附錄仍跳脫 <、>、&，不受正文修訂影響。

選取檔案硬上限改為 64 MiB（67,108,864 bytes），超過時在讀取前拒絕，明確顯示上限且不改決策。附錄 JSON 32 MiB 上限及匯出超過 5 MB 警告不變。未新增相依。

## 授權修改與驗證

- md.test.mjs 的惡意 code span 測試：僅移除禁止角括號的子條件，保留原換行／雙向禁止斷言，新增原樣 <script>、既有圍欄隔離檢查；這是使用者授權的實體規則修訂。其餘既有斷言不變。
- mdFixture 的 guard 改為 count < max && total > min；review.md 與 malicious-review.md 兩份 golden 僅更新受影響條件／惡意文字的實體顯示。
- 新增所有範圍每個 code point 的正文／JSON 跳脫及 JSON 解碼測試；標籤、條件、應用名稱與 ID fixture 驗證無原始隱形字元，完整機器區往返位元組相同。
- 新增超過 64 MiB 的實際選取檔案測試，以 File.text 副作用計數證明拒絕前未讀取，決策保持 KEEP；等於 64 MiB 的檔案可到達讀取入口，讀取失敗仍不改決策。

文件指示更新至 v1.8；WP9 不在本補強範圍。
