# ADR 0019：單檔檢視器建置、資料注入與 CSP

日期：2026-10-03；狀態：採用（WP7 A，需求方明確決定）。

## 背景與選項

舊 ReportGenerator 混合 UI 與 localhost 服務。新檢視器需 file:// 單檔、嚴格 2.2、可測試的 TypeScript，共用 review 模組供 WP8 使用。選項為無框架 TypeScript／esbuild 或 UI 框架；採前者，不引入 UI／圖形／版面執行期相依。

## 決定

TypeScript **7.0.2**（Apache-2.0）、esbuild **0.28.2**（MIT）僅建置期使用，版本與 npm lock 釘選。既有 Playwright 1.55.1 用於測試，不加入檢視器執行期。前端建置先執行 npm ci／build，Maven resources 載入產物；不提交生成 bundle。Java SingleHtmlReportGenerator 只注入 typed data／現成 template 與 bundle，不實作 UI。A–D 與舊入口並存，E 移除舊碼；新入口名稱 generate，歷史 write API 不改。

建置產物包含 script SHA-256；Java 驗證實際 bundle 相符並以同一雜湊設定 script-src。目標文字僅資料，JSON 跳脫所有 `<`、U+2028／2029；前端以 textContent／屬性 API 使用，沒有 innerHTML、eval 或 fetch。輸入使用 GraphIntegrityValidator.requireAnalysis；分析指紋為排序鍵的圖 JSON SHA-256。

依需求方修訂 C6，style-src **允許 unsafe-inline**，供 srcdoc 繼承 CSP 後顯示目標 CSS；script-src 僅建置雜湊，禁止 unsafe-inline。iframe sandbox 不含 allow-scripts；allow-same-origin 僅供父頁讀取元素與註冊工具自有點擊處理，不允許目標腳本。

## 後果與驗證

輸出 report/screentrace-report.html，不讀 localhost 或相對資源。大小以 UTF-8 實際 bytes 計算，100 MB 為 100,000,000 bytes，超過只警告。file:// E2E 使用 Java 實際生成的 fixture，Chromium 必跑，Firefox／WebKit 可用時亦跑；驗證惡意名稱／URL／JS 字串原文、無目標腳本副作用及無對外請求。
