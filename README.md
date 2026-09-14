# ScreenTrace

ScreenTrace 會分析 Web 專案的畫面、路由與可互動元件，產生可瀏覽的 Screen flow、靜態頁面、按鈕資訊與確認結果。Spring MVC/JSP 不會啟動目標專案；Playwright 只會對靜態渲染的 HTML 產生 All screens 縮圖。Spring Boot/React 會在隔離的 Vite 與 mock API 環境中渲染路由，產生不含 React script 的靜態頁面與縮圖，不會啟動 Spring Boot 後端；支援的多步驟表單會使用內建合成資料自動擷取後續流程狀態。

目前支援 Spring Boot + React，以及 annotation-based Spring MVC + JSP 專案；產生的資料與報表都寫入被分析專案的 `.screentrace/`，不會修改原始程式碼。

Spring MVC / JSP 會展開可解析的 JSP Tag、CSS 與本地資源；Spring Boot / React 會凍結隔離渲染後的 DOM、CSS 與本地資源。兩者都直接產生報表載入的靜態 HTML：

```bash
java -jar screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar analyze /path/to/project --serve
```

ScreenTrace 只擷取可靜態解析的 `GET`／`ANY` MVC endpoint；含路徑參數的 endpoint 會保留在 `.screentrace/screenshots/capture-errors.json`，不會猜測測試資料。

## 系統需求

- Java 17 以上
- Maven 3.9 以上
- Node.js 18 以上與 npm
- Chromium（Playwright 安裝時會下載）

在 macOS 可確認版本：

```bash
java -version
mvn -version
node -v
npm -v
```

## 第一次使用

在 ScreenTrace 專案根目錄執行：

```bash
mvn clean verify
cd screentrace-capture
npm install
npx playwright install chromium
cd ..
```

也可直接執行 `bin/screentrace`。若 CLI JAR 或 Playwright 尚未安裝，腳本會自動建置與安裝。

## 分析專案

```bash
./bin/screentrace analyze /絕對路徑/目標專案
```

分析完成後，結果會產生在目標專案內：

```text
/絕對路徑/目標專案/.screentrace/
```

可在分析後立刻啟動報表：

```bash
./bin/screentrace analyze /絕對路徑/目標專案 --serve
```

或指定自訂分析輸出目錄：

```bash
./bin/screentrace analyze /絕對路徑/目標專案 --output /tmp/screentrace-output
```

Spring Boot / React 專案需要目標專案的 `frontend/node_modules/vite` 已安裝；分析時會自動產生靜態預覽。

## 啟動互動報表

若專案已分析完成，可不重新掃描與截圖，直接啟動報表：

```bash
./bin/screentrace serve /絕對路徑/目標專案
```

瀏覽器開啟：

```text
http://localhost:8088
```

若顯示 `Address already in use`，代表已有 ScreenTrace server 使用 8088。可直接重新整理既有的 `http://localhost:8088`；若剛更新 CLI 功能，請先停止舊 server（終端機按 `Ctrl+C`）再重新執行 `serve`。

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
- 雙擊畫面卡片可開啟其完整長截圖。

### Page view

Page view 顯示 Playwright 擷取的完整長截圖。

- 截圖上的可見按鈕與連結會以可點擊熱區標示。
- 單擊熱區會在右欄開啟 Button Detail。
- 雙擊具備已解析目標的熱區，會直接前往目標畫面。
- 右側 Page Detail 的 To 與 Button 項目，和畫面上的熱區會同步 hover 高亮。
- Button Detail 顯示元件 ID、元件類型與文字、目標路徑，以及 Playwright 擷取的 CSS 屬性。

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

- server 可用時，寫入 `.screentrace/edit-overlay.json`。
- 瀏覽器同時保留一份本機狀態，避免暫時無法寫入 server 時遺失操作。
- 再次執行 `analyze` 時，既有的 `edit-overlay.json` 不會被覆蓋。

## 匯出確認結果

確認完成後可產生提供 AI 使用的結構化 JSON。輸出會列出所有畫面與可見互動元件，並給出 `KEEP`、`REMOVE` 或 `UNDECIDED` 決策。

### 從 UI 匯出

在最上方 `ScreenTrace — 專案名稱` 導覽列點選「匯出確認結果」。瀏覽器會下載：

```text
review-result.json
```

### 從指令匯出

不需要重新分析或截圖：

```bash
./bin/screentrace export /絕對路徑/目標專案
```

預設輸出：

```text
/絕對路徑/目標專案/.screentrace/review-result.json
```

指定輸出檔案：

```bash
./bin/screentrace export /絕對路徑/目標專案 \
  --output /絕對路徑/review-result.json
```

輸出內容包含：

- 專案名稱與分析技術
- 匯出時間
- 畫面與按鈕的保留／移除／未確認統計
- 每個畫面的 graph ID、路由、名稱、來源檔案與行號
- 每個按鈕或連結的 runtime ID、類型、文字、目標路徑、確認決策與 CSS

AI 應以 `REMOVE` 作為可移除範圍、以 `KEEP` 作為必須保留範圍；`UNDECIDED` 表示尚未取得客戶決策，不應自行移除。

## `.screentrace` 產物說明

```text
.screentrace/
├── application-graph.json       # 靜態分析出的標準 Application Graph
├── prototype-model.json         # 原型畫面與元件基準資料
├── preview-model.json           # 預覽畫面、截圖與可見元件的統一資料
├── edit-overlay.json            # 使用者確認與編輯決策
├── review-result.json           # 匯出給 AI 的確認結果
├── report/
│   └── index.html               # 互動報表
├── static-preview/
│   ├── manifest.json            # Screen ID 與靜態頁面對應
│   └── *.html                   # JSP 或 React 凍結後的靜態頁面
└── screenshots/
    ├── manifest.json            # Screen ID 與截圖檔案對應
    ├── interactions.json        # 可見按鈕／連結、位置與 CSS
    └── *.png                    # Playwright 擷取的完整長截圖
```

## 疑難排解

### 報表空白或沒有畫面

先重新執行分析，並確認終端機列出 `Captured /...`：

```bash
./bin/screentrace analyze /絕對路徑/目標專案
```

再啟動或重新整理報表。

### 只有少數截圖

ScreenTrace 只會擷取靜態路由分析可發現且 Playwright 可直接開啟的畫面。需要登入、資料前置條件或動態產生的頁面可能無法完整呈現，仍會保留靜態分析到的畫面關係。

### UI 匯出失敗

重新啟動最新 server：

```bash
./bin/screentrace serve /絕對路徑/目標專案
```

再重新開啟 `http://localhost:8088`。也可改用 `screentrace export` 指令直接產生 JSON。

### Playwright 或 Chromium 安裝失敗

在 `screentrace-capture/` 下重新安裝：

```bash
npm install
npx playwright install chromium
```

## 開發與驗證

```bash
mvn clean verify
```

分析與截圖的產物是執行結果，應維持在被分析專案的 `.screentrace/`，不應提交到 ScreenTrace 原始碼版本庫。
