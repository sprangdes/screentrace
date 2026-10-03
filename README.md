# ScreenTrace

ScreenTrace 會分析伺服端渲染 JSP 專案的畫面、路由與可互動元件，產生可瀏覽的 Screen flow、靜態頁面、按鈕資訊與確認結果；不會啟動或修改目標專案。

目前支援 Struts 1、Struts + Spring、Spring MVC JSP、Spring Boot JSP 專案；偵測到 Struts 2 會以 `UNSUPPORTED_FRAMEWORK` 拒絕分析；產生的資料與報表都寫入設定的分析結果根目錄，不會修改原始程式碼。

ScreenTrace 會展開可解析的 JSP Tag、CSS 與本地資源，並以 Playwright Chromium 渲染靜態 HTML，產生畫面截圖與可見元件位置。JSP 的動態清單、明細與欄位會填入合成示範資料；不會啟動目標專案或連線其資料庫。

## 調整進度

新需求與已確認決策見 [REQUIREMENTS.md](docs/REQUIREMENTS.md)，工作包與驗收順序見 [ROADMAP.md](docs/ROADMAP.md)。WP7 已改為單一離線 HTML（Screen Map、API 頁、review 暫存）。md 匯出／匯入與 JSON 匯出退場屬 WP8；元件庫匯入屬 WP9，尚未開始。

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
  匯出確認結果
  結束 ScreenTrace
```

「分析專案」列出專案根目錄下所有直接子資料夾；「開啟報表」與「匯出確認結果」只列出已有完整分析結果的專案。
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
./bin/screentrace export 專案名稱
./bin/screentrace config
```

Windows：

```powershell
.\bin\screentrace.cmd analyze 專案名稱
.\bin\screentrace.cmd report 專案名稱
.\bin\screentrace.cmd export 專案名稱
.\bin\screentrace.cmd config
```

## 報表操作

### All screens

首次開啟顯示 All screens，目的是快速找到畫面，而非呈現流程關係。

- 左欄是依 URL 路徑建立的專案樹；資料夾可展開或收合。
- 左右兩欄可各自上下捲動。
- 右欄上半部是資料夾、下半部是畫面卡片。
- 資料夾與畫面區塊右上角的 `− / N 欄 / +` 可各自設定每列卡片數。
- 單擊畫面卡片或左側畫面項目，進入該畫面的 Screen flow。
- 雙擊畫面卡片或左側畫面項目，開啟 Page view。

### Screen flow

單擊畫面後，ScreenTrace 顯示該畫面與可前往的下一層畫面。

- 被選取畫面會在畫布上方左右置中。
- 下方 `To` 區域顯示可前往的畫面。
- 滑鼠移到畫面、右側 To 項目或關聯按鈕時，對應畫面與關聯線會同步高亮。
- 單擊畫布空白處可回到 All screens。
- 右下角可調整畫布縮放；可拖曳畫布瀏覽關聯。
- 雙擊畫面卡片可開啟其靜態 Page view。

### Page view

Page view 顯示由 JSP 原始碼轉換的靜態 HTML；Screen Explorer 與 Screen flow 顯示該 HTML 經 Chromium 渲染後的截圖。

- 單擊可解析按鈕或連結會在右欄開啟 Button Detail。
- 雙擊具備已解析目標的元件，會直接前往目標畫面。
- Button Detail 顯示元件 ID、元件類型、文字與目標路徑。

## 確認模式

確認模式用於與客戶確認哪些畫面和按鈕應保留或移除。

### 開啟與套用狀態

在 `Screen flow — /...` 或 Page view 的標題列點選「確認功能」。接著選擇狀態，再點選目標：

| 工具 | 意義 | 視覺效果 |
| --- | --- | --- |
| `✓ 保留` | 確認應保留 | 半透明綠色圖層與 ✓ |
| `× 移除` | 確認應移除 | 半透明紅色圖層與 × |
| `○ 未確認` | 清除確認決策 | 回復原始外觀 |

- 在 Screen flow 中，狀態套用到畫面卡片。
- 在 Page view 中，狀態只套用到按鈕／連結熱區，不會覆蓋整張畫面。
- 右欄 Page Detail 或 Button Detail 的「確認狀態」卡片也可直接變更目前畫面或按鈕的狀態。
- 已選取的確認狀態會被凸顯，其他兩個狀態會淡化。

### 確認狀態保存位置

確認決策屬於使用者資料，不會改寫 Application Graph 或被分析專案的原始碼。

- server 可用時，寫入分析結果目錄的 `edit-overlay.json`。
- 瀏覽器同時保留一份本機狀態，避免暫時無法寫入 server 時遺失操作。
- 再次執行 `analyze` 時，既有的 `edit-overlay.json` 不會被覆蓋。

## 匯出確認結果

確認完成後可產生提供 AI 使用的 version-2 結構化 JSON。輸出會列出所有畫面與可見互動元件，並給出 `KEEP`、`REMOVE` 或 `UNDECIDED` 決策。

### 從 UI 匯出

在最上方 `ScreenTrace — 專案名稱` 導覽列點選「匯出確認結果」。瀏覽器會下載：

```text
review-result.json
```

### 下載確認功能結果

不需要重新分析：

macOS：

```bash
./bin/screentrace
```

Windows：

```powershell
.\bin\screentrace.cmd
```

預設輸出：

```text
/project/ocp/analyze/專案名稱/review-result.json
```

輸出內容包含：

- 專案名稱與分析技術
- 匯出時間
- 畫面與按鈕的保留／移除／未確認統計
- 每個畫面的 graph ID、路由、名稱、來源檔案與行號
- 每個按鈕或連結的 graph ID、類型、文字、目標路徑與確認決策
- 圖中既有的 API 契約、呼叫來源、直接導覽與預覽 metadata；目前不推導 API 移除狀態

完整欄位、缺值與相容性規則見 [REVIEW_RESULT_CONTRACT.md](docs/REVIEW_RESULT_CONTRACT.md)。

AI 應以 `REMOVE` 作為可移除範圍、以 `KEEP` 作為必須保留範圍；`UNDECIDED` 表示尚未取得客戶決策，不應自行移除。

## 分析產物說明

```text
<分析結果根目錄>/<專案名稱>/
├── application-graph.json       # 靜態分析出的標準 Application Graph
├── prototype-model.json         # 原型畫面與元件基準資料
├── preview-model.json           # 預覽畫面、全部元素與去重樣式的統一資料
├── edit-overlay.json            # 使用者確認與編輯決策
├── review-result.json           # 匯出給 AI 的確認結果
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

再選擇「開啟報表」。也可選擇「匯出確認結果」直接產生 JSON。

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

新分析的 Struts／Spring／混合圖一律 schema 2.2，嚴格驗證來源證據。URL 配對與明確 context 候選保留全部歧義；API 契約與 SERVER 規則附來源。core 舊版 API 與舊報表／JSON 匯出僅歷史相容，列出證據限制；移除義務見 [ADR 0015](docs/adr/0015-schema-two-production-and-historical-compatibility.md)、[ADR 0016](docs/adr/0016-historical-report-entries-and-schema-retirement.md)。WP5 完整測試與 CI 見 [回報](docs/reports/WP5.md)。

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

確認模式的決策自動暫存在應用名稱＋分析指紋的 localStorage；拒絕存取時只警告。複合鍵契約見 [REVIEW_STATE_CONTRACT](docs/REVIEW_STATE_CONTRACT.md)。既有 CLI JSON export 仍為歷史入口至 WP8，不讀取新檢視器的 localStorage；新 review 決策目前以同一瀏覽器暫存保存。
