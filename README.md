# ScreenTrace

ScreenTrace 會分析伺服端渲染 JSP 專案的畫面、路由與可互動元件，產生可瀏覽的 Screen flow、靜態頁面、按鈕資訊與確認結果；不會啟動或修改目標專案。

目前支援 Struts 1、Struts + Spring、Spring MVC JSP、Spring Boot JSP 專案；偵測到 Struts 2 會以 `UNSUPPORTED_FRAMEWORK` 拒絕分析；產生的資料與報表都寫入設定的分析結果根目錄，不會修改原始程式碼。

ScreenTrace 會展開可解析的 JSP Tag、CSS 與本地資源，並以 Playwright Chromium 渲染靜態 HTML，產生畫面截圖與可見元件位置。JSP 的動態清單、明細與欄位會填入合成示範資料；不會啟動目標專案或連線其資料庫。

## 調整進度

新需求與已確認決策見 [REQUIREMENTS.md](docs/REQUIREMENTS.md)，工作包與驗收順序見 [ROADMAP.md](docs/ROADMAP.md)。WP7 單一離線 HTML 提供 Screen Map、API 與 review；WP8 提供 md 匯出／匯入，JSON 匯出已退場。元件庫匯入屬 WP9，尚未開始。

## 初次執行

### macOS

在終端機進入 ScreenTrace 專案根目錄後執行：

```bash
./bin/screentrace
```

腳本會自動檢查 Java 17+、Maven 3.9+、Node.js 18+、Playwright 與 Chromium。缺少 Java、Maven 或 Node.js 時，會透過 Homebrew 安裝。首次執行需要網路連線，Homebrew 可能要求輸入 macOS 管理者密碼。

### Windows

在 PowerShell 或命令提示字元進入 ScreenTrace 專案根目錄後執行：

```powershell
.\bin\screentrace.cmd
```

腳本會自動檢查 Java 17+、Maven 3.9+、Node.js 18+、Playwright 與 Chromium。缺少 Java、Maven 或 Node.js 時，會透過 `winget` 安裝。首次執行需要網路連線，安裝時可能出現 Windows 權限確認。需使用 Windows 10／11，且已安裝 App Installer（提供 `winget`）。

首次啟動時會要求設定所有專案的根目錄與分析結果根目錄，預設結果位置是 `<專案根目錄>/analyze/`。設定檔位置如下：

| 系統 | 設定檔 |
| --- | --- |
| macOS | `~/.screentrace/config.json` |
| Windows | `%USERPROFILE%\.screentrace\config.json` |

## CLI 指令

直接執行 macOS 的 `./bin/screentrace` 或 Windows 的 `.\bin\screentrace.cmd` 後，以 ↑ / ↓ 選擇、Enter 確認：

```text
❯ 分析專案
  開啟報表
  結束 ScreenTrace
```

「分析專案」列出專案根目錄下所有直接子資料夾；「開啟報表」只列出已有完整分析結果的專案。
可選擇「結束 ScreenTrace」，或按 `q`／Esc 正常結束 CLI。專案選單可選擇「← 返回功能選單」，或按 `b`／Esc 返回功能選單。

### 分析專案並開啟報表

macOS：

```bash
./bin/screentrace
```

Windows：

```powershell
.\bin\screentrace.cmd
```

分析完成後，結果會產生在分析結果根目錄內：

```text
/project/ocp/analyze/專案名稱/
```

分析完成後會自動以 file:// 開啟 report/screentrace-report.html。JSP／HTML 畫面會同時產生重建預覽、渲染截圖、所有元素位置與去重 computed style，保留條件原文、動態運算式及最多 320px 的內嵌縮圖。預覽會標示「示意畫面:動態資料為範例值」及超量診斷。在 CLI 按 Esc 返回功能選單；已開啟的 HTML 仍可使用，不啟動 localhost 伺服器。

### 開啟報表

若專案已分析完成，可不重新掃描，直接啟動報表：

macOS：

```bash
./bin/screentrace
```

Windows：

```powershell
.\bin\screentrace.cmd
```

在選單中選擇「開啟報表」與目標專案。報表為單一 HTML，可搬移後直接開啟，不依賴分析資料夾、網路或本機服務。

也可用於自動化：

macOS：

```bash
./bin/screentrace analyze 專案名稱
./bin/screentrace report 專案名稱
./bin/screentrace config
```

Windows：

```powershell
.\bin\screentrace.cmd analyze 專案名稱
.\bin\screentrace.cmd report 專案名稱
.\bin\screentrace.cmd config
```

## 報表操作

單檔以 file:// 開啟。畫面總覽顯示全部畫面與關聯，可拖曳／鍵盤平移和縮放；檔案結構列出全部來源路徑。URL 搜尋支援實際 URL 對路由樣板、星號與副檔名映射，結果同時高亮。

點選畫面聚焦，hover 關聯顯示 URL、縮圖與觸發元件；點擊可前往目標並返回。右側顯示 API、所有行為、來源／信心／檢核；點選預覽任意元素查看樣式與條件。API 頁可搜尋／排序／依狀態篩選，呼叫來源能跳轉並高亮元件。

## 確認與 md 匯出／匯入

勾選「確認模式」，畫面與有行為的元件可標未確認／保留／移除。同一元件在不同畫面有各自決策；移除畫面不改子決策，只顯示有效隨畫面移除。提供統計、篩選與衝突警告，不自動修正。

決策暫存於含應用名稱＋分析指紋的 localStorage，失敗仍可操作。完整契約見 [REVIEW_STATE_CONTRACT](docs/REVIEW_STATE_CONTRACT.md)。不改 Application Graph 或被分析的原始碼。

按「匯出 md」下載單一 screentrace-review.md，超過 5 MB 警告而仍完整下載。KEEP／UNDECIDED 含完整元件／行為，REMOVE 畫面只留 ID／路由／來源；API 狀態共用複合鍵決策推導。所有來源資料以 code span 或嚴格機器字串隔離，固定文字指明資料不是 AI 指示。

使用「匯入 md」選取本機檔案，還原末尾附錄的完整決策。指紋不同／未知 ID 提示「分析結果已變更」並列 orphan，未知複合鍵完整保留。格式／損毀／截斷／上限錯誤不改目前決策；SHA-256 僅檢查損毀，不防惡意重算摘要。匯入不讀取網路資源。

格式、排序、安全與容量見 [REVIEW_MD_CONTRACT](docs/REVIEW_MD_CONTRACT.md)。元件庫尚未匯入，WP9 未開始。

## 分析產物說明

```text
<分析結果根目錄>/<專案名稱>/
├── application-graph.json       # 靜態分析出的標準 Application Graph
├── prototype-model.json         # 原型畫面與元件基準資料
├── preview-model.json           # 預覽畫面、全部元素與去重樣式的統一資料
├── report/
│   └── screentrace-report.html  # 單檔離線檢視器
├── static-preview/
│   ├── manifest.json            # Screen ID 與靜態頁面對應
│   └── *.html                   # JSP 轉換後的靜態頁面
└── screenshots/
    ├── manifest.json            # Screen ID 與渲染截圖對應
    ├── interactions.json        # 可見元件的實際位置與 CSS
    └── *.png                    # Chromium 渲染截圖
```

## 疑難排解

### 報表空白或沒有畫面

先重新執行分析：

macOS：

```bash
./bin/screentrace
```

Windows：

```powershell
.\bin\screentrace.cmd
```

再啟動或重新整理報表。

### UI 匯出失敗

重新啟動最新 server：

macOS：

```bash
./bin/screentrace
```

Windows：

```powershell
.\bin\screentrace.cmd
```

直接開啟單一 HTML，按「匯出 md」。若失敗，檢視頁面錯誤訊息與 schema 2.2 證據完整性。

## 開發與驗證

```bash
npm --prefix screentrace-viewer ci --ignore-scripts
npm --prefix screentrace-viewer run build
mvn clean verify
```

分析產物是執行結果，應維持在設定的分析結果根目錄，不應提交到 ScreenTrace 原始碼版本庫。

### 依賴安全檢查

GitHub Actions 的 `Security checks` 在 push、PR 與每週排程執行。Java 與 Node 使用獨立 job，因此其中一項失敗不會跳過另一項。

- Java：先建置與測試，再使用 Dependency-Check 12.2.2 掃描；CVSS ≥ 7 或掃描錯誤仍會使檢查失敗。
- Node：依 lockfile 安裝依賴，再執行 `npm audit --audit-level=high`。
- NVD 資料使用官方公開 JSON 2.0 檔案，不需要 API Key；漏洞資料庫使用每日快取，並依掃描器版本隔離；升級掃描器時也要更新 workflow 的快取版本。
- Java 掃描報告以 `java-dependency-audit` artifact 保存，掃描失敗時也會嘗試上傳。

本機可重跑：

```bash
mvn clean verify
mvn org.owasp:dependency-check-maven:aggregate -DdataDirectory=/tmp/screentrace-dependency-check-12.2.2
npm --prefix screentrace-js ci --ignore-scripts
npm --prefix screentrace-js test
npm --prefix screentrace-js audit --audit-level=high
npm --prefix screentrace-capture ci
npm --prefix screentrace-capture audit --audit-level=high
```

掃描設定集中在根目錄 `pom.xml`，不會自動附加到一般 `mvn verify`。新版掃描器不可沿用不相容的舊資料庫；上例使用獨立資料目錄，避免改動已有快取。

首次下載完整 NVD 資料仍可能較慢，後續會使用快取並更新變更資料。Sonatype OSS Index 需要另行認證；未提供認證時，新版工具會略過該額外資料來源，NVD 掃描仍執行。

### JavaScript 靜態分析（WP4）

分析 inline／外部 script、module 的本地相對 import、事件屬性與 javascript: URL，使用釘選 Acorn AST，不執行目標程式。setup／啟動腳本準備 screentrace-js 相依；直接跑 Maven 前先 `npm --prefix screentrace-js ci --ignore-scripts`。事件／呼叫／CLIENT 檢核進入 Application Graph，未知選擇器與動態值保留 UNRESOLVED。追蹤深度預設 10，Java 可用 `-Dscreentrace.js.maxDepth=5` 設定；Node JSON 以 maxDepth 設定。

JS API request 節點保存來源方法、URL、資料欄位，backendStatus 為 UNRESOLVED；後端 URL／context path 配對是尚未開始的 WP5，不能把 WP4 的 request 節點當成已證明的後端 handler。script src context 前綴例外見 v1.3 與 ADR 0008，不套用到 API URL。

WP5 的 WAR context path 可在 `~/.screentrace/config.json` 加入 `contextPaths`，鍵為專案絕對路徑，值為明確候選陣列，例如 `"contextPaths": {"/workspace/shop": ["/shop"]}`。未設定不推測部署路徑；多個不同候選保留歧義。Spring Boot properties／YAML 的 `server.servlet.context-path` 亦保留來源證據。

### WP5 schema 與 context

新分析的 Struts／Spring／混合圖一律 schema 2.2，嚴格驗證來源證據。URL 配對與明確 context 候選保留全部歧義；API 契約與 SERVER 規則附來源。core 舊版 API 僅歷史相容；舊報表與 JSON 匯出已退場，決定見 [ADR 0015](docs/adr/0015-schema-two-production-and-historical-compatibility.md)、[ADR 0016](docs/adr/0016-historical-report-entries-and-schema-retirement.md)。WP5 完整測試與 CI 見 [回報](docs/reports/WP5.md)。

### WP6 靜態重建預覽

正式 CLI 使用 schema 2.2 的完整預覽模式；獨立執行：

```bash
node screentrace-capture/capture-static-jsp.mjs <target-project> <analysis-directory> --preview-v2
```

每畫面的警告上限可用 `--style-element-limit=50000`、`--style-byte-limit=16777216` 調整；超量產生診斷，完整元素／樣式保留。安全路徑、來源檔大小與截圖硬限制仍生效，失敗明確標記。預設舊 capture 入口保留為歷史工具；正式 CLI 使用完整模式並執行 pack-preview 靜態封裝；不執行目標 JSP、Java 或 JavaScript。契約與限制見 [ADR 0018](docs/adr/0018-complete-reconstructed-preview.md)。

### 單檔檢視器建置（WP7）

```bash
npm --prefix screentrace-viewer ci --ignore-scripts
npm --prefix screentrace-viewer run build
mvn clean verify
npm --prefix screentrace-viewer test
node --test screentrace-viewer/test/*.e2e.mjs
```

新入口 `SingleHtmlReportGenerator.generate` 只接受嚴格 schema 2.2，注入圖、預覽、內嵌文件與 manifest，產出 `report/screentrace-report.html` 及實際 bytes 的 `report-size.json`；超過 100 MB 只警告。單檔以 `file://` 開啟，沒有執行期 npm 相依。CLI 已切換 SingleHtmlAnalysisWriter；舊 ReportGenerator、localhost 與 POST 端點已移除。設定 `ST_BROWSERS=chromium,firefox,webkit` 可執行三引擎測試，須先安裝對應 Playwright 瀏覽器。

確認模式的決策自動暫存在應用名稱＋分析指紋的 localStorage；拒絕存取時只警告。複合鍵契約見 [REVIEW_STATE_CONTRACT](docs/REVIEW_STATE_CONTRACT.md)。md 匯出／匯入共用模組見 [REVIEW_MD_CONTRACT](docs/REVIEW_MD_CONTRACT.md)；決策可用單一 md 跨瀏覽器還原。

### 元件庫 manifest（WP9）

使用 [虛構 sample manifest](docs/examples/component-library.sample.json) 與 [JSON Schema](docs/schemas/component-library.schema.json)；不解析真實 Angular 套件／Storybook。

```text
screentrace library validate component-library.sample.json
screentrace library import component-library.sample.json
screentrace library import component-library.sample.json --project example-project
screentrace library list
screentrace library import component-library.sample.json --project example-project --replace
screentrace library unbind --project example-project
```

manifest 的 library.name／version、元件 id／name／selector／category 最多 200 個 Unicode 字元；description（含輸入／輸出／slot）與 usage 最多 4,000 個字元。每個元件 inputs／outputs／slots／matches 各最多 200 筆；超限拒絕並指出欄位路徑與上限。

未指定 project 只儲存、不選用。相同名稱@版本異內容需明確 --replace，已綁定專案更換後重新執行 report；解除後顯示「未匯入元件庫」。list 列摘要與綁定，不列工作區路徑。

元件詳情顯示自動候選／屬性與事件對照；確認模式下 KEEP 畫面的元件可手動覆寫，共用元件按畫面獨立保存。md 帶入選用庫名稱@版本與摘要，舊庫覆寫隔離為 orphan，換回原庫恢復。決策與覆寫透過單一 md 還原，詳細欄位與隔離規則見 [Review md 契約](docs/REVIEW_MD_CONTRACT.md)。
