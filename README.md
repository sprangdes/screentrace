# ScreenTrace

ScreenTrace 會分析伺服端渲染 JSP 專案的畫面、路由與可互動元件，產生可瀏覽的 Screen flow、靜態頁面、按鈕資訊與確認結果；不會啟動或修改目標專案。

目前支援 Struts 1、Struts + Spring、Spring MVC JSP、Spring Boot JSP 專案；產生的資料與報表都寫入被分析專案的 `.screentrace/`，不會修改原始程式碼。

ScreenTrace 會展開可解析的 JSP Tag、CSS 與本地資源，產生報表載入的靜態 HTML。

## 初次執行

在 macOS 的終端機進入 ScreenTrace 專案根目錄後，直接執行分析指令：

```bash
./bin/screentrace analyze /絕對路徑/目標專案
```

腳本會自動檢查 Java 17+、Maven 3.9+ 與 Node.js 18+；缺少或版本不足時，會透過 Homebrew 安裝。若尚未安裝 Homebrew，腳本也會先依 Homebrew 官方安裝程序完成安裝。初次執行需要網路連線，且 Homebrew 可能要求輸入 macOS 管理者密碼。

## CLI 指令

所有分析資料與確認結果固定寫入目標專案的 `.screentrace/`。CLI 不提供自訂輸出位置。

### 分析專案並開啟報表

```bash
./bin/screentrace analyze /絕對路徑/目標專案
```

分析完成後，結果會產生在目標專案內：

```text
/絕對路徑/目標專案/.screentrace/
```

分析完成後會自動開啟 `http://localhost:8088`。JSP 專案會同時產生靜態預覽。

### 開啟報表

若專案已分析完成，可不重新掃描，直接啟動報表：

```bash
./bin/screentrace open /絕對路徑/目標專案
```

瀏覽器開啟：

```text
http://localhost:8088
```

若顯示 `Address already in use`，代表已有 ScreenTrace server 使用 8088。可直接重新整理既有的 `http://localhost:8088`；若剛更新 CLI 功能，請先停止舊 server（終端機按 `Ctrl+C`）再重新執行 `open`。

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

Page view 顯示由 JSP 原始碼轉換的靜態 HTML。

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

### 下載確認功能結果

不需要重新分析：

```bash
./bin/screentrace export /絕對路徑/目標專案
```

預設輸出：

```text
/絕對路徑/目標專案/.screentrace/review-result.json
```

輸出內容包含：

- 專案名稱與分析技術
- 匯出時間
- 畫面與按鈕的保留／移除／未確認統計
- 每個畫面的 graph ID、路由、名稱、來源檔案與行號
- 每個按鈕或連結的 graph ID、類型、文字、目標路徑與確認決策

AI 應以 `REMOVE` 作為可移除範圍、以 `KEEP` 作為必須保留範圍；`UNDECIDED` 表示尚未取得客戶決策，不應自行移除。

## `.screentrace` 產物說明

```text
.screentrace/
├── application-graph.json       # 靜態分析出的標準 Application Graph
├── prototype-model.json         # 原型畫面與元件基準資料
├── preview-model.json           # 預覽畫面與可見元件的統一資料
├── edit-overlay.json            # 使用者確認與編輯決策
├── review-result.json           # 匯出給 AI 的確認結果
├── report/
│   └── index.html               # 互動報表
├── static-preview/
│   ├── manifest.json            # Screen ID 與靜態頁面對應
│   └── *.html                   # JSP 轉換後的靜態頁面
```

## 疑難排解

### 報表空白或沒有畫面

先重新執行分析：

```bash
./bin/screentrace analyze /絕對路徑/目標專案
```

再啟動或重新整理報表。

### UI 匯出失敗

重新啟動最新 server：

```bash
./bin/screentrace open /絕對路徑/目標專案
```

再重新開啟 `http://localhost:8088`。也可改用 `screentrace export` 指令直接產生 JSON。

## 開發與驗證

```bash
mvn clean verify
```

分析產物是執行結果，應維持在被分析專案的 `.screentrace/`，不應提交到 ScreenTrace 原始碼版本庫。
