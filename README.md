# ScreenTrace

ScreenTrace 會分析 JSP 伺服端渲染與 React 前端專案的畫面、路由與可互動元件，產生可瀏覽的 Screen flow、靜態頁面、按鈕資訊與確認結果；不會啟動或修改目標專案。

目前支援 Struts 1、Struts + Spring、Spring MVC JSP、Spring Boot JSP 專案，以及 Spring Boot 後端搭配 React（react-router）前端的專案（同一專案內並存的 JSP、Thymeleaf 畫面與 React 畫面會一起分析）；偵測到 Struts 2 會以 `UNSUPPORTED_FRAMEWORK` 拒絕分析；產生的資料與報表都寫入設定的分析結果根目錄，不會修改原始程式碼。

ScreenTrace 會展開可解析的 JSP Tag、CSS 與本地資源，並以 Playwright Chromium 渲染靜態 HTML，產生畫面截圖與可見元件位置。JSP 的動態清單、明細與欄位會填入合成示範資料；不會啟動目標專案或連線其資料庫。

Spring MVC／JSP 專案另會依原始碼推論：同一 JSP 依狀態欄位或請求模式（例如新投保／續保）分成的畫面、handler 的正常流程，以及由 servlet 過濾器的存取規則（路徑前綴＋工作階段屬性＋導向登入頁）推得的角色（例如「一般用戶」與登入後的「後台管理員」）。這些推論都保留來源證據；無法證明的部分標為「可能」或保留選擇，不會猜測。

報表的主要流程：在畫布上看畫面、點按鈕試操作、標記保留／移除、進度自動存成 md 交給 AI。需求方操作請看[報表使用指南](docs/USER_GUIDE.md)；CLI 與疑難排解請看[分析人員指南](docs/ANALYST_GUIDE.md)。

## 初次執行

### macOS

在終端機進入 ScreenTrace 專案根目錄後執行：

```bash
./bin/screentrace setup
```

腳本會檢查並安裝 Java 17+、Maven 3.9+、Node.js 22+、Playwright 與 Chromium。缺少 Java、Maven 或 Node.js 時會透過 Homebrew 安裝；首次執行需要網路連線，Homebrew 可能要求輸入 macOS 管理者密碼。

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

可使用相對路徑或 `~/`。不需要先做任何設定；結果寫入 `<ScreenTrace 根目錄>/analyze/<專案資料夾名稱>/`，完成後自動以瀏覽器開啟報表。若已用 `config` 設定分析結果根目錄，則寫入該目錄。若該輸出資料夾已存放另一個來源資料夾的分析結果，會以結束碼 2 停止分析，不覆寫既有結果；請先移除或改名該資料夾。

不帶參數執行 `./bin/screentrace` 會開啟選單，以 ↑ / ↓ 選擇、Enter 確認：

```text
❯ 分析專案
  開啟報表          （已有分析結果時才出現）
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
./bin/screentrace analyze /path/to/your-project
./bin/screentrace doctor
```

`analyze` 只分析、印出報表路徑，不開啟瀏覽器；參數含 `/`、`\` 或以 `~`、`.` 開頭時視為資料夾路徑，不需先設定。`doctor` 檢查 Java、Maven、Node、Playwright Chromium 與 JS parser 是否就緒，缺項時結束碼 1。`report` 以既有分析結果重新產生並開啟報表，不重新掃描。`config` 開啟同一個「設定」選單。報表為單一 HTML，可搬移後直接開啟，不依賴分析資料夾、網路或本機服務。

## 報表操作

報表有「畫面」「API」兩頁；有角色時另有「角色」頁。角色可由分析人員在設定中定義（`personas`，目前只支援 React 畫面），或在沒有設定時自動建議：React 依路由守衛，Spring MVC／JSP 依 servlet 過濾器的存取規則。每個角色在整份報表使用同一個淡底色（第 1 個藍、第 2 個琥珀，依序類推；多個角色共用的畫面為淡青，角色流程都走不到的畫面維持中性灰）。

### 畫面

- **畫布**：呈現所有畫面與關聯線。有角色時依角色分區（每區帶該角色底色），沒有角色時依網址第一段分區。觸控板兩指滑動移動畫布，捏合或 ⌘／Ctrl＋滾輪縮放。點一下畫面標出它的關聯線，點兩下放大成完整預覽，四周留下進出的關聯線，滑過線顯示目的畫面縮圖，點線前往。畫布上方的角色切換鈕可只看單一角色的逐步流程（只顯示該角色會走到或可能走到的畫面）。已確認的畫面在卡片右上角以 ✓（保留）或 ✕（移除）標示。
- **左側欄**：搜尋框可用實際網址比對路由樣板；右側的漏斗按鈕展開「全部／未確認／保留／移除」篩選，篩選中按鈕顯示目前條件。清單有三種檢視：
  - 「清單」：有角色時依角色分段。
  - 「檔案結構」：依畫面所在的 JSP 頁身（Tiles 版型以滑過提示顯示）列出，同一檔案的各狀態畫面依流程順序排列。
  - 「功能」：依角色分段，再依功能分組，可摺疊。
  - 選「功能」且未開啟畫面時，主畫面顯示「功能地圖」：應用程式 → 角色 → 功能 → 依該角色流程步驟排列的畫面。
- **預覽與模擬**：在預覽中點按鈕或送出表單會模擬前往的畫面，工具列顯示主要網址與畫面所屬角色，`f` 或右上角按鈕切換全螢幕。
  - 同一 JSP 的不同狀態（例如待核保／核保中／核保通過）與請求模式（新投保／續保）是各自的畫面，可用工具列的「流程狀態」切換。
  - 請求有多個結果時，直接前往 handler 的正常流程，狀態列列出其他可能結果。無法判斷時才請使用者選擇，選項以原始碼條件標示。
  - 必填核取方塊未勾選時，不會送出，會捲動到該處並提示「請勾選此方塊」。
  - 表單中輸入的資料會依真實伺服器的方式帶到後續畫面，例如確認頁、明細、繳費頁，以及返回修改時的表單。查詢類表單維持空白。工具列的上一頁／下一頁會還原該畫面當時的輸入。
- **右側欄**：標記保留／移除與備註，列出按鈕、呼叫的 API 與來源畫面。左右側欄都可收合，清單與畫布之間的分隔線可拖曳調整寬度。

### API

- **左側**：上方是狀態比例條，搜尋框與漏斗篩選（全部／需要注意／使用中）與畫面頁相同，可依 Controller 或網址分組。清單只列方法與路徑，並標示需要注意的「未被使用」「可移除」。由系統設定進入（welcome-file、繼承樣板、自動轉址）的 API 視為使用中。
- **右側詳情**：
  - 標題列右側是保留／移除／未確認與「備註」，備註以浮動面板開啟。標題下方一句話說明這支 API 的用途。
  - 呼叫鏈（畫面 → API → 處理程式）中，畫面帶角色底色。
  - 下方是處理程式與原始檔位置，以及固定展開的 Request／Response。
  - 「呼叫來源」以畫面卡片列出，點卡片標題開啟該畫面。卡片下的「觸發元件」標示元件種類（按鈕、表單、連結、載入），點一下開啟畫面並定位到該元件。寫在共用版型的按鈕合併成一組，展開後以「出現在」列出它所在的畫面。
- 列表與詳情之間的分隔線可拖曳。

### 角色

- 上方為角色卡片。下方為所選角色的名稱與摘要：走到的畫面（會走到／可能走到與比例條）、判定條件、起點。
- 再下方是依步數排列的流程看板，帶角色底色。卡片右上角顯示確認狀態，虛線卡片表示可能走到。角色頁只呈現角色會走到或可能走到的畫面。
- 「全部角色對照」從右側滑入，列出每個畫面有哪些角色會走到，不取代目前的角色流程；再按一次收合。

## 確認進度與 md

在 Chrome／Edge 中，第一次標記時會請你選擇一個 md 進度檔，之後每次標記自動寫入；重新開啟報表可「繼續上次進度」。這個 md 就是交給 AI 的檔案，也可隨時「下載 md」。不支援自動存檔的瀏覽器會把標記暫存在瀏覽器，請用「下載 md」保存、「開啟 md」接續。

md 一律為 format_version 1，舊版 v2／v3 檔仍可開啟。格式、排序、安全與容量見 [REVIEW_MD_CONTRACT](docs/REVIEW_MD_CONTRACT.md)；狀態契約見 [REVIEW_STATE_CONTRACT](docs/REVIEW_STATE_CONTRACT.md)。

## 分析產物說明

```text
<分析結果根目錄>/<專案名稱>/
├── application-graph.json       # 靜態分析出的標準 Application Graph
├── prototype-model.json         # 原型畫面與元件基準資料
├── preview-model.json           # 預覽畫面、全部元素與去重樣式的統一資料
├── viewer-documents.json        # 封裝後的離線預覽文件與資產
├── report-size.json             # 單一 HTML 實際大小與 100 MB 警告
├── report/
│   └── screentrace-report.html  # 單檔離線報表
├── static-preview/
│   ├── manifest.json            # Screen ID 與靜態頁面對應
│   ├── reconstruction.json      # 重建預覽的元素資料
│   ├── element-styles.json      # 元素樣式
│   ├── diagnostics.json         # 擷取診斷
│   ├── react-preview.json       # React 畫面的靜態預覽（React 專案）
│   └── *.html                   # JSP／模板轉換後的靜態頁面
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

開發與 CI 用 Maven Wrapper 固定 Maven 3.9.11（`./mvnw`，Windows 用 `mvnw.cmd`），第一次執行會下載並驗證 Maven；Node.js 需要 22 以上。

```bash
npm --prefix screentrace-js ci --ignore-scripts
npm --prefix screentrace-viewer ci --ignore-scripts
npm --prefix screentrace-viewer run build
./mvnw clean verify
```

CI 使用 google-java-format 檢查 Java 原始碼。修改 Java 後可執行下列指令重新排版。

```bash
./mvnw com.diffplug.spotless:spotless-maven-plugin:apply
```

`screentrace-js`、`screentrace-capture`、`screentrace-viewer` 的 TypeScript／JavaScript 以 Prettier 排版，CI 也會檢查；修改後執行（需先在 `screentrace-viewer` 執行過 `npm ci`）：

```bash
npm --prefix screentrace-viewer run format
```

JavaScript 另以 ESLint 的建議規則檢查，TypeScript 由 viewer 建置時的 `tsc` 檢查（含沒用到的變數與參數），CI 都會執行（[ADR 0140](docs/adr/0140-r49-lint-rules.md)）：

```bash
npm --prefix screentrace-viewer run lint
```

分析產物是執行結果，應維持在設定的分析結果根目錄，不應提交到 ScreenTrace 原始碼版本庫。

### 依賴安全檢查

GitHub Actions 的 `Security checks` 在 push、PR 與每週排程執行。分成四個獨立 job，其中一項失敗不會跳過其他項。

- Linux：建置 viewer 與 Java 模組，執行排版與 lint 檢查。
- Windows：建置 viewer 與 Java 模組。
- Java 依賴掃描：打包後以 Dependency-Check 12.2.2 掃描，CVSS ≥ 7 或掃描錯誤會使檢查失敗。
- Node 依賴掃描：依三個套件的 lockfile 安裝並執行 `npm audit --audit-level=high`。
- NVD 資料使用官方公開 JSON 2.0 檔案，不需要 API Key；漏洞資料庫使用每日快取，並依掃描器版本隔離；升級掃描器時也要更新 workflow 的快取版本。
- Java 掃描報告以 `java-dependency-audit` artifact 保存，掃描失敗時也會嘗試上傳。

本機可重跑：

```bash
./mvnw clean verify
./mvnw org.owasp:dependency-check-maven:aggregate -DdataDirectory=/tmp/screentrace-dependency-check-12.2.2
npm --prefix screentrace-js ci --ignore-scripts
npm --prefix screentrace-js audit --audit-level=high
npm --prefix screentrace-capture ci
npm --prefix screentrace-capture audit --audit-level=high
npm --prefix screentrace-viewer ci --ignore-scripts
npm --prefix screentrace-viewer audit --audit-level=high
```

掃描設定集中在根目錄 `pom.xml`，不會自動附加到一般 `mvn verify`。新版掃描器不可沿用不相容的舊資料庫；上例使用獨立資料目錄，避免改動已有快取。

首次下載完整 NVD 資料仍可能較慢，後續會使用快取並更新變更資料。Sonatype OSS Index 需要另行認證；未提供認證時，新版工具會略過該額外資料來源，NVD 掃描仍執行。

### JavaScript 與 React 靜態分析

分析 inline／外部 script、module 的本地相對 import、事件屬性與 javascript: URL，使用釘選 Acorn AST，不執行目標程式。setup／啟動腳本準備 screentrace-js 相依；直接跑 Maven 前先 `npm --prefix screentrace-js ci --ignore-scripts`。事件／呼叫／CLIENT 檢核進入 Application Graph，未知選擇器與動態值保留 UNRESOLVED。追蹤深度預設 10，Java 可用 `-Dscreentrace.js.maxDepth=5` 設定；Node JSON 以 maxDepth 設定。React 專案的路由（react-router）、渲染元件與事件處理效果以 Babel AST 分析，同樣不執行目標程式。

JS API request 節點保存來源方法、URL、資料欄位；只有在後端 URL 配對成立時才連到 handler，無法證明的配對保留 UNRESOLVED 或歧義。script src context 前綴例外見 ADR 0008，不套用到 API URL。

WAR context path 可在 `~/.screentrace/config.json` 加入 `contextPaths`，鍵為專案絕對路徑，值為明確候選陣列，例如 `"contextPaths": {"/workspace/shop": ["/shop"]}`。需在已用 `config` 設定專案根目錄（且該資料夾存在）的 config.json 中才會生效；設定格式錯誤時整份設定會被略過。`config` 選單不提供此項，請直接編輯檔案。未設定不推測部署路徑；多個不同候選保留歧義。Spring Boot properties／YAML 的 `server.servlet.context-path` 亦保留來源證據。

### Graph schema 與 context

新分析的 Struts／Spring／混合圖為 schema 2.2；含 React 身分條件時為 2.3，有角色時（分析人員設定，或 React／Spring MVC JSP 自動建議）為 2.4；三者都嚴格驗證來源證據。URL 配對與明確 context 候選保留全部歧義；API 契約與 SERVER 規則附來源。core 舊版 API 僅歷史相容；舊報表與 JSON 匯出已退場，決定見 [ADR 0015](docs/adr/0015-schema-two-production-and-historical-compatibility.md)、[ADR 0016](docs/adr/0016-historical-report-entries-and-schema-retirement.md)。

### 靜態重建預覽

正式 CLI 使用完整預覽模式（接受 schema 2.2／2.3／2.4，需先有同一輸出目錄的分析圖）；獨立執行：

```bash
node screentrace-capture/capture-static-jsp.mjs <target-project> <analysis-directory> --preview-v2
```

每畫面的警告上限可用 `--style-element-limit=50000`、`--style-byte-limit=16777216` 調整；同時擷取的頁數可用 `--capture-concurrency=4`（1～32）調整，結果依畫面順序合併，與逐一擷取相同（[ADR 0138](docs/adr/0138-r47-concurrent-preview-capture.md)）；超量產生診斷，完整元素／樣式保留。安全路徑、來源檔大小與截圖硬限制仍生效，失敗明確標記。預設舊 capture 入口保留為歷史工具；正式 CLI 使用完整模式並執行 pack-preview 靜態封裝；不執行目標 JSP、Java 或 JavaScript。契約與限制見 [ADR 0018](docs/adr/0018-complete-reconstructed-preview.md)。

### 單檔檢視器建置

```bash
npm --prefix screentrace-viewer ci --ignore-scripts
npm --prefix screentrace-viewer run build
./mvnw clean verify
```

新入口 `SingleHtmlReportGenerator.generate` 只接受嚴格 schema 2.2／2.3／2.4，注入圖、預覽、內嵌文件與 manifest，產出 `report/screentrace-report.html`，並在分析目錄根層寫入實際 bytes 的 `report-size.json`；超過 100 MB 只警告。單檔以 `file://` 開啟，沒有執行期 npm 相依。CLI 透過 SingleHtmlAnalysisWriter 產生報表，不啟動 localhost 服務。

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
