# ScreenTrace

ScreenTrace 會分析 JSP 伺服端渲染與 React 前端專案的畫面、路由與可互動元件，產生可瀏覽的 Screen flow、靜態頁面、按鈕資訊與確認結果；不會啟動或修改目標專案。

目前支援 Struts 1、Struts + Spring、Spring MVC JSP、Spring Boot JSP 專案，以及 Spring Boot 後端搭配 React（react-router）前端的專案；偵測到 Struts 2 會以 `UNSUPPORTED_FRAMEWORK` 拒絕分析；產生的資料與報表都寫入設定的分析結果根目錄，不會修改原始程式碼。

ScreenTrace 會展開可解析的 JSP Tag、CSS 與本地資源，並以 Playwright Chromium 渲染靜態 HTML，產生畫面截圖與可見元件位置。JSP 的動態清單、明細與欄位會填入合成示範資料；不會啟動目標專案或連線其資料庫。

報表的主要流程：在畫布上看畫面、點按鈕試操作、標記保留／移除、進度自動存成 md 交給 AI。需求方操作請看[報表使用指南](docs/USER_GUIDE.md)；CLI 與疑難排解請看[分析人員指南](docs/ANALYST_GUIDE.md)。

## 初次執行

### macOS

在終端機進入 ScreenTrace 專案根目錄後執行：

```bash
./bin/screentrace setup
```

腳本會檢查並安裝 Java 17+、Maven 3.9+、Node.js 18+、Playwright 與 Chromium。缺少 Java、Maven 或 Node.js 時會透過 Homebrew 安裝；首次執行需要網路連線，Homebrew 可能要求輸入 macOS 管理者密碼。

### Windows

在 PowerShell 或命令提示字元進入 ScreenTrace 專案根目錄後執行：

```powershell
.\bin\screentrace.cmd setup
```

缺少 Java、Maven 或 Node.js 時會透過 `winget` 安裝。需使用 Windows 10／11，且已安裝 App Installer（提供 `winget`）。

## 分析專案

一個指令完成分析並開啟報表：

```bash
./bin/screentrace /path/to/your-project
```

Windows：

```powershell
.\bin\screentrace.cmd C:\path\to\your-project
```

可使用相對路徑或 `~/`。不需要先做任何設定；結果寫入 `<ScreenTrace 根目錄>/analyze/<專案資料夾名稱>/`，完成後自動以瀏覽器開啟報表。若已用 `config` 設定分析結果根目錄，則寫入該目錄。

不帶參數執行 `./bin/screentrace` 會開啟選單，以 ↑ / ↓ 選擇、Enter 確認：

```text
❯ 分析專案
  開啟報表
  設定
  結束 ScreenTrace
```

從選單分析完成並顯示摘要後，會詢問是否開啟報表：Enter 開啟、Esc 回到選單；不論選哪個都回到選單。選單的「開啟報表」則直接開啟。

「設定」可選「專案根目錄」或「預設瀏覽器」。「分析專案」在沒有設定專案根目錄時直接請你輸入專案路徑；設定後會列出根目錄下的子資料夾，清單最後的「輸入其他路徑…」可分析根目錄以外的專案。「預設瀏覽器」只列出這台電腦偵測到的瀏覽器（macOS 檢查 `/Applications` 與 `~/Applications`，Windows 檢查 App Paths 登錄與常見安裝路徑）以及「系統預設」，存在 `~/.screentrace/config.json` 的 `browser`。沒有設定時依序使用 Chrome、Edge，都找不到才用系統預設瀏覽器；報表的自動存檔只支援 Chrome／Edge，用其他瀏覽器開啟時會提示改用「下載 md」保存。開啟失敗時改用系統預設瀏覽器，再不行就請直接開啟印出的 HTML 路徑。

腳本化用法維持相容：

```bash
./bin/screentrace analyze 專案名稱
./bin/screentrace report 專案名稱
./bin/screentrace config
```

`analyze` 只分析、印出報表路徑，不開啟瀏覽器；`report` 以既有分析結果重新產生並開啟報表，不重新掃描。`config` 開啟同一個「設定」選單。報表為單一 HTML，可搬移後直接開啟，不依賴分析資料夾、網路或本機服務。

## 報表操作

報表只有兩頁：

- **畫面**：畫布呈現所有畫面與關聯線；畫面較多時依網址第一段分區。觸控板兩指滑動移動畫布，捏合或 ⌘／Ctrl＋滾輪縮放。點一下畫面標出它的關聯線，點兩下在同一張畫布放大成完整預覽，四周留下進出的關聯線，滑過線顯示目的畫面縮圖，點線前往。在預覽中點按鈕會模擬前往的畫面（不做資料檢核）；按 `f` 或預覽右上角按鈕可切換全螢幕預覽。右側欄標記保留／移除，並列出按鈕、呼叫的 API 與來源畫面；左右側欄都可收合。左側搜尋框可用實際網址比對路由樣板。
- **API**：左側依 Controller（或網址）分組列出後端 API，只標示需要注意的「未被使用」「可移除」；右側是選中 API 的詳情：狀態原因、處理程式與原始檔位置、依畫面分組的呼叫來源，以及預設收合的 Request／Response。

## 確認進度與 md

在 Chrome／Edge 中，第一次標記時會請你選擇一個 md 進度檔，之後每次標記自動寫入；重新開啟報表可「繼續上次進度」。這個 md 就是交給 AI 的檔案，也可隨時「下載 md」。不支援自動存檔的瀏覽器會把標記暫存在瀏覽器，請用「下載 md」保存、「開啟 md」接續。

md 一律為 format_version 1，舊版 v2／v3 檔仍可開啟。格式、排序、安全與容量見 [REVIEW_MD_CONTRACT](docs/REVIEW_MD_CONTRACT.md)；狀態契約見 [REVIEW_STATE_CONTRACT](docs/REVIEW_STATE_CONTRACT.md)。

## 分析產物說明

```text
<分析結果根目錄>/<專案名稱>/
├── application-graph.json       # 靜態分析出的標準 Application Graph
├── prototype-model.json         # 原型畫面與元件基準資料
├── preview-model.json           # 預覽畫面、全部元素與去重樣式的統一資料
├── report/
│   └── screentrace-report.html  # 單檔離線報表
├── static-preview/
│   ├── manifest.json            # Screen ID 與靜態頁面對應
│   └── *.html                   # JSP 轉換後的靜態頁面
└── screenshots/
    ├── manifest.json            # Screen ID 與渲染截圖對應
    ├── interactions.json        # 可見元件的實際位置與 CSS
    └── *.png                    # Chromium 渲染截圖
```

分析器仍會產出元素樣式資料；報表與 md 不顯示樣式與元件庫內容。

## 疑難排解

### 報表空白或沒有畫面

重新分析專案後再開啟報表：

```bash
./bin/screentrace /path/to/your-project
```

### 自動存檔沒有出現

請改用 Chrome 或 Edge 開啟報表。其他瀏覽器會顯示「未自動存檔」，請用「下載 md」保存。

## 開發與驗證

```bash
npm --prefix screentrace-js ci --ignore-scripts
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

### JavaScript 與 React 靜態分析

分析 inline／外部 script、module 的本地相對 import、事件屬性與 javascript: URL，使用釘選 Acorn AST，不執行目標程式。setup／啟動腳本準備 screentrace-js 相依；直接跑 Maven 前先 `npm --prefix screentrace-js ci --ignore-scripts`。事件／呼叫／CLIENT 檢核進入 Application Graph，未知選擇器與動態值保留 UNRESOLVED。追蹤深度預設 10，Java 可用 `-Dscreentrace.js.maxDepth=5` 設定；Node JSON 以 maxDepth 設定。React 專案的路由（react-router）、渲染元件與事件處理效果以 Babel AST 分析，同樣不執行目標程式。

JS API request 節點保存來源方法、URL、資料欄位；只有在後端 URL 配對成立時才連到 handler，無法證明的配對保留 UNRESOLVED 或歧義。script src context 前綴例外見 ADR 0008，不套用到 API URL。

WAR context path 可在 `~/.screentrace/config.json` 加入 `contextPaths`，鍵為專案絕對路徑，值為明確候選陣列，例如 `"contextPaths": {"/workspace/shop": ["/shop"]}`。未設定不推測部署路徑；多個不同候選保留歧義。Spring Boot properties／YAML 的 `server.servlet.context-path` 亦保留來源證據。

### Graph schema 與 context

新分析的 Struts／Spring／混合圖一律 schema 2.2，嚴格驗證來源證據。URL 配對與明確 context 候選保留全部歧義；API 契約與 SERVER 規則附來源。core 舊版 API 僅歷史相容；舊報表與 JSON 匯出已退場，決定見 [ADR 0015](docs/adr/0015-schema-two-production-and-historical-compatibility.md)、[ADR 0016](docs/adr/0016-historical-report-entries-and-schema-retirement.md)。

### 靜態重建預覽

正式 CLI 使用 schema 2.2 的完整預覽模式；獨立執行：

```bash
node screentrace-capture/capture-static-jsp.mjs <target-project> <analysis-directory> --preview-v2
```

每畫面的警告上限可用 `--style-element-limit=50000`、`--style-byte-limit=16777216` 調整；超量產生診斷，完整元素／樣式保留。安全路徑、來源檔大小與截圖硬限制仍生效，失敗明確標記。預設舊 capture 入口保留為歷史工具；正式 CLI 使用完整模式並執行 pack-preview 靜態封裝；不執行目標 JSP、Java 或 JavaScript。契約與限制見 [ADR 0018](docs/adr/0018-complete-reconstructed-preview.md)。

### 單檔檢視器建置

```bash
npm --prefix screentrace-viewer ci --ignore-scripts
npm --prefix screentrace-viewer run build
mvn clean verify
npm --prefix screentrace-viewer test
node --test screentrace-viewer/test/*.e2e.mjs
```

新入口 `SingleHtmlReportGenerator.generate` 只接受嚴格 schema 2.2，注入圖、預覽、內嵌文件與 manifest，產出 `report/screentrace-report.html` 及實際 bytes 的 `report-size.json`；超過 100 MB 只警告。單檔以 `file://` 開啟，沒有執行期 npm 相依。CLI 透過 SingleHtmlAnalysisWriter 產生報表，不啟動 localhost 服務。設定 `ST_BROWSERS=chromium,firefox,webkit` 可執行三引擎測試，須先安裝對應 Playwright 瀏覽器。

標記自動暫存在應用名稱＋分析指紋的 localStorage，並可自動寫入使用者選擇的 md 進度檔；拒絕存取時只警告。複合鍵契約見 [REVIEW_STATE_CONTRACT](docs/REVIEW_STATE_CONTRACT.md)。md 匯出／匯入共用模組見 [REVIEW_MD_CONTRACT](docs/REVIEW_MD_CONTRACT.md)；決策可用單一 md 跨瀏覽器還原。

### 元件庫 manifest

報表與 md 目前不顯示元件庫建議與覆寫；以下 CLI 仍可管理 manifest，供日後使用。

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

### 合成專案整合驗證

[五類自行撰寫的 fixture](fixtures/wp10/README.md) 與 [語法涵蓋清單](fixtures/wp10/coverage.json) 不建置、不啟動目標服務。Java 的 SyntheticProjectIntegrationTest 在隔離工作區執行四類 fixture 的真實 analyze／capture／pack／report 兩次，逐 bytes 比對圖、同環境預覽與單一 HTML；Struts 2 只驗證拒絕。Node 共用 md 與三引擎 E2E 讀取這些實際產物，涵蓋標記、下載、清除暫存及匯入還原。

```bash
npm --prefix screentrace-viewer run build
mvn verify
ST_BROWSERS=chromium,firefox,webkit node --test screentrace-viewer/test/*.e2e.mjs
```

E2E 依賴前一步 Java 生成的 `screentrace-cli/target/wp10-fixtures`；預覽決定性只在同一次測試的相同瀏覽器／字型環境比較，不把跨作業系統截圖混為同一基線。CI 依此順序執行。
