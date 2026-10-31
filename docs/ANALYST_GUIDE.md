# 分析人員操作指南

本指南供負責設定、分析、報表交付與元件庫管理的人員使用。需求方的操作說明見[報表使用指南](USER_GUIDE.md)。

## 分析一個專案

```sh
./bin/screentrace <專案路徑>
```

不需要事先設定。可使用絕對路徑、相對路徑或 `~/`；結果寫入 `<ScreenTrace 根目錄>/analyze/<專案資料夾名稱>/`（已設定分析結果根目錄時改寫入該目錄），完成後自動開啟報表。路徑不存在時以結束碼 2 顯示「找不到專案資料夾」。若該輸出資料夾已存放另一個來源資料夾的分析結果，會以結束碼 2 停止分析，不覆寫既有結果；請先移除或改名該資料夾。原始專案保持唯讀。Windows 請執行 `bin\screentrace.cmd <專案路徑>`。

不帶參數執行 `./bin/screentrace` 時，從選單「分析專案」（未設定專案根目錄時直接輸入路徑，設定後從根目錄的子資料夾挑選，或選「輸入其他路徑…」）分析完成並顯示摘要後，會詢問是否開啟報表：Enter 開啟、Esc 回到選單；兩者都會回到選單。選單的「開啟報表」直接開啟。

## 設定（選用）

在可互動的終端機執行下列指令，或從選單選「設定」，再選「專案根目錄」或「預設瀏覽器」：

```sh
./bin/screentrace config
```

### 專案根目錄

需要經常從同一個資料夾挑選專案時，依提示設定專案根目錄與分析結果根目錄。設定後，不帶參數執行 `./bin/screentrace` 選單的「分析專案」會列出根目錄下的子資料夾，並可使用：

```sh
./bin/screentrace analyze <專案名稱>
./bin/screentrace report <專案名稱>
```

`analyze` 讀取設定的專案並產生圖與預覽資料，只印出報表路徑、不開啟瀏覽器，適合腳本使用；`report` 以既有分析重新產生可離線開啟的單一 HTML。未設定時使用這兩個指令，會以結束碼 2 提示改用 `<專案路徑>` 或執行 `config`，不會等待輸入或輸出堆疊追蹤。

### 預設瀏覽器

清單只列出這台電腦偵測到的瀏覽器與「系統預設」：macOS 檢查 `/Applications` 與 `~/Applications` 的 Google Chrome、Microsoft Edge、Firefox、Safari；Windows 檢查 App Paths 登錄或常見安裝路徑的 `chrome.exe`、`msedge.exe`、`firefox.exe`。選擇存在 `~/.screentrace/config.json` 的 `browser` 欄位；舊設定檔沒有這個欄位仍可讀取。

開啟報表時使用設定的瀏覽器；沒有設定（或設定的瀏覽器已不存在）時依序使用 Chrome、Edge，都找不到才用系統預設瀏覽器。報表的自動存檔只支援 Chrome／Edge，用其他瀏覽器開啟時 CLI 會提示「不支援自動存檔，請用『下載 md』保存」。指定瀏覽器開啟失敗時改用系統預設瀏覽器，再失敗則請直接開啟 CLI 印出的 HTML 路徑。

## 管理元件庫

R17 起報表與 md 不顯示元件庫建議與覆寫；以下指令仍可驗證與保存 manifest，供日後使用。只匯入經 JSON Schema 驗證的 manifest。範例 manifest 是虛構資料，僅供格式參考。

```sh
./bin/screentrace library validate <manifest.json>
./bin/screentrace library import <manifest.json>
./bin/screentrace library list
```

不帶 `--project` 的匯入只會驗證並儲存，不會選用。指定專案才會綁定：

```sh
./bin/screentrace library import <manifest.json> --project <專案名稱>
```

同一專案只能綁定一份元件庫；再次綁定會更換。解除綁定：

```sh
./bin/screentrace library unbind --project <專案名稱>
```

相同名稱與版本但內容不同時，預設拒絕覆蓋。先比較 manifest，再明確使用 `--replace`；更換內容後，受影響專案需重新產生報表。`library list` 顯示已儲存項目的名稱、版本與內容摘要前 12 碼，以及各專案目前的綁定。

## 交付前檢查

1. 確認圖、預覽與單一 HTML 均來自同一次分析。
2. 在同一環境重跑分析與報表，確認決定性輸出一致；時間戳等契約明定欄位除外。
3. 檢查報表大小；超過 100 MB 會警告，仍需確認傳遞方式與使用者設備可正常開啟。
4. 搜尋 HTML 與 md 輸出，確認沒有專案根目錄、分析輸出目錄、使用者家目錄或其他本機絕對路徑。
5. 確認 context path 的值與來源已呈現在證據中；未設定時不可自行猜測。
6. 對照需求方的[報表使用指南](USER_GUIDE.md)，確認可找到畫面、試操作、標記，並在 Chrome 中設定進度檔與下載 md。

## 疑難排解

### 缺少預覽或縮圖

確認分析輸出完整，再重新分析或執行 `report` 重建 HTML。若仍缺少，檢視 `application-graph.json` 與 `preview-model.json` 中的診斷；不要以空白預覽推斷原畫面沒有內容。

### React 預覽沒有套用樣式

React 畫面的預覽由原始碼靜態重建，會連結專案 import 的 CSS。來自套件的樣式（例如 `import 'bootstrap/dist/css/bootstrap.min.css'`）只有在專案已安裝 `node_modules` 時才找得到；找不到時寫入 `static-preview/diagnostics.json`，預覽仍會產生但沒有該樣式。ScreenTrace 不會替目標專案執行 `npm install`，請自行在目標專案安裝後重新分析。

若看到 `STYLESHEET_PACKAGE_MISSING`，代表 React 原始碼匯入了 CSS 套件，但前端目錄的 `node_modules` 找不到該套件；分析仍會完成，畫面詳情會列出缺少套件。可先在分析對象的前端目錄執行套件安裝（例如 `npm ci`），再重新分析。

React 預覽中無法靜態證明的文字顯示為「示例值」；只在特定條件出現的對話框預設關閉；`if (loading) return …` 這類分支在預覽中顯示一般狀態，但兩邊的按鈕都會列在右側欄。

### Context path 未設定

查看圖中設定證據。若工作區設定與伺服器設定均未提供，結果應明確顯示「未設定」；先取得部署設定，再重新分析，不要從 URL 外觀猜值。

### 診斷代碼

R17 起報表不再顯示診斷與信心狀態。診斷的完整代碼、訊息、來源檔與行號保留在 `application-graph.json`；交給 AI 的 md 第 7 節「分析限制」列出 `UNRESOLVED`、`AMBIGUOUS` 項目與來源。報表只在受影響畫面顯示 JSF 未分析等提示，在 API 頁顯示 context path 提示。

### 路徑大小寫與符號連結

設定檔中的專案根目錄與輸出根目錄會在載入及儲存時解析為檔案系統提供的實際路徑；舊設定可保留大小寫變體或符號連結寫法，工具會在記憶體中正規化。執行 `config` 時若輸入與實際路徑不同，CLI 會顯示已採用路徑的中文提示。報表中的本機預覽資源會依實際輸出根目錄判定；真正位於輸出目錄外的資源仍會拒絕，並以「預覽資源位於分析輸出目錄之外，已拒絕」說明。請將該資源移入分析輸出，或修正產生預覽資料的來源；不要建立通往輸出目錄外的符號連結。

### CLI 沒有互動終端機

自動化流程建議直接使用 `./bin/screentrace <專案路徑>`，不需要設定或互動終端機。未設定時執行 `analyze`／`report` 會立即顯示「尚未設定專案根目錄。可直接執行 `./bin/screentrace <專案路徑>` 分析單一專案，或在終端機執行 `./bin/screentrace config` 設定專案根目錄」並以非零結束碼停止。

## 重新產生指南截圖

指南截圖由自撰合成資料產生，不取用實際專案或網路資源。完成報表介面修改後，在具備 Playwright Chromium 的環境執行：

```sh
npm --prefix screentrace-viewer run guide-shots
```

輸出固定寫入 `docs/images/user-guide/`。檢查十張圖都非空、沒有多餘舊圖，並在相同環境連續執行兩次，以 SHA-256 確認每張 PNG 位元組一致。若字型或 Chromium 不可用，腳本應明確失敗；不得以空白截圖代替。

文件格式細節見[審查文件契約](REVIEW_MD_CONTRACT.md)、[審查狀態契約](REVIEW_STATE_CONTRACT.md)與[元件庫 Schema](schemas/component-library.schema.json)。
