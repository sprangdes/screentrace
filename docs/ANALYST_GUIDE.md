# 分析人員操作指南

本指南供負責設定、分析、報表交付與元件庫管理的人員使用。需求方的操作說明見[報表使用指南](USER_GUIDE.md)。

## 設定專案與輸出位置

在可互動的終端機執行：

```sh
./bin/screentrace config
```

依提示設定專案根目錄與分析結果根目錄。Windows 請執行 `bin/screentrace.cmd config`。輸出根目錄需有足夠空間；原始專案保持唯讀。

設定後可列出目前 CLI 支援的指令：

```sh
./bin/screentrace --help
```

## 分析並產生報表

```sh
./bin/screentrace analyze <專案名稱>
./bin/screentrace report <專案名稱>
```

`analyze` 讀取設定的專案並產生圖與預覽資料；`report` 產生可離線開啟的單一 HTML。缺少專案設定時，請在互動式終端機執行 `config`。無互動終端機時，指令會以結束碼 2 顯示設定提示並立即結束，不會等待輸入或輸出堆疊追蹤。

## 管理元件庫

只匯入經 JSON Schema 驗證的 manifest。範例 manifest 是虛構資料，僅供格式參考。

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
6. 對照需求方的[報表使用指南](USER_GUIDE.md)，確認可找到畫面、試操作、標記及匯出審查文件。

## 疑難排解

### 缺少預覽或縮圖

確認分析輸出完整，再執行 `report` 重建 HTML。若仍缺少，檢視分析資訊中的診斷及預覽資源診斷；不要以空白預覽推斷原畫面沒有內容。

### Context path 未設定

查看圖中設定證據。若工作區設定與伺服器設定均未提供，結果應明確顯示「未設定」；先取得部署設定，再重新分析，不要從 URL 外觀猜值。

### 診斷代碼

開啟報表的「分析資訊」，先讀中文摘要，再展開診斷查看完整代碼、訊息、來源檔與行號。`UNRESOLVED`、`AMBIGUOUS`、`INFERRED` 等狀態的需求方說明見[使用指南的可信度章節](USER_GUIDE.md#10-判斷分析結果是否可信)。

### 路徑大小寫與符號連結

設定檔中的專案根目錄與輸出根目錄會在載入及儲存時解析為檔案系統提供的實際路徑；舊設定可保留大小寫變體或符號連結寫法，工具會在記憶體中正規化。執行 `config` 時若輸入與實際路徑不同，CLI 會顯示已採用路徑的中文提示。報表中的本機預覽資源會依實際輸出根目錄判定；真正位於輸出目錄外的資源仍會拒絕，並以「預覽資源位於分析輸出目錄之外，已拒絕」說明。請將該資源移入分析輸出，或修正產生預覽資料的來源；不要建立通往輸出目錄外的符號連結。

### CLI 沒有互動終端機

缺少專案設定時，CLI 會立即顯示「尚未設定專案根目錄與輸出根目錄。請先在終端機執行 `./bin/screentrace config`」並以非零結束碼停止。請先在一般終端機完成設定，再執行分析；自動化流程應準備有效設定並明確處理非零結束碼。已有設定且指定專案名稱時，`analyze` 與 `report` 可直接執行。

## 重新產生指南截圖

指南截圖由自撰合成資料產生，不取用實際專案或網路資源。完成報表介面修改後，在具備 Playwright Chromium 的環境執行：

```sh
npm --prefix screentrace-viewer run guide-shots
```

輸出固定寫入 `docs/images/user-guide/`。檢查十二張圖都非空、沒有多餘舊圖，並在相同環境連續執行兩次，以 SHA-256 確認每張 PNG 位元組一致。若字型或 Chromium 不可用，腳本應明確失敗；不得以空白截圖代替。

文件格式細節見[審查文件契約](REVIEW_MD_CONTRACT.md)、[審查狀態契約](REVIEW_STATE_CONTRACT.md)與[元件庫 Schema](schemas/component-library.schema.json)。
