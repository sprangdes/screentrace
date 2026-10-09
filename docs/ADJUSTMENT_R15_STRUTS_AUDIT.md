# ScreenTrace 第十五輪調整指示（R15：收尾、文件狀態整理與 Struts 1 實測稽核）

給 Codex 執行。執行前依 AGENTS.md §10 讀取 `AGENTS.md`、`docs/CODEX_INSTRUCTIONS.md`、`docs/REQUIREMENTS.md`、`docs/ROADMAP.md`、`docs/ADJUSTMENT_R14_INVENTORY.md`（特別是 §2、§8、§9.2、§13）、`docs/reports/R14.md`。REQUIREMENTS §1 原文與 §2 決策不得更動。R3–R14 的「不要做」與「停止條件」仍適用。

## 0. 需求方的情境與要求

> R14 已結案。專案說明寫明 V1 以 Struts 為主，但到目前為止只用 Spring MVC 專案（eMusicStore、PetClinic）做過真實驗收，Struts 1 只跑過自行撰寫的合成 fixture。需求方手邊沒有 Struts 1 專案，請改用 Apache 官方 Struts 1 範例程式做唯讀實測，找出誤判。另外收掉 R14 留下的小問題，並把 ROADMAP 過時的狀態整理清楚。

本輪三個工作包，順序固定：**WP51 → WP52 → WP53 → 停止驗收**。WP51、WP52 完成後不需停止；WP53 只做稽核、不修正分析器，完成後停止。

## 1. 工作包

### WP51　API 清單「轉址」標示（R14 §13 遺留）

現況（2b8ad32）：`ANY /cart/`、`ANY /admin/productInventory/deleteProduct/{productId}` 的方法徽章顯示「轉址」，同一列第二行仍是原始分類 `REDIRECT`。

修正：方法徽章依方法顯示（`ANY` → 「任何方法」，原值放 tooltip）；分類行 `REDIRECT` → 「轉址」（原值放 tooltip）。其他分類若有原始代碼外露（例如 `REST_API`、`MVC_SCREEN`），一併改為白話（「API」「畫面網址」），原值放 tooltip。

預先授權（OQ-023 決定後補充）：只可修改**直接鎖定 API 清單方法徽章與分類標籤之文字或位置**的既有斷言（例如把檢查「轉址」的 selector 由方法徽章改到分類標籤），斷言的文字與 tooltip 內容不得放寬；每處依 R14 §2.4 格式記入 ADR。

驗收：先提交失敗測試。E2E 斷言 API 頁可見文字不含 `REDIRECT`、`REST_API`、`MVC_SCREEN`，且方法徽章不出現「轉址」；tooltip 保留原值。

### WP52　ROADMAP 與文件狀態整理

ROADMAP 多列仍寫「等待需求方驗收」或「未開始」，與現況不符，下一個接手的人會看不懂。需求方決定如下：

1. **R3、R5、R8、R9、R11、R13、M4** 中仍標「等待驗收」的工作包：需求方於 R14 驗收期間（2026-10-09）以 eMusicStore、PetClinic 實際操作過報表，視為一併驗收。Codex 逐列確認其交付能力仍存在（列出對應的現行測試名稱）；仍存在者改標「已驗收（2026-10-09，隨 R14 實測確認）」；已被 R14 取代的版面或流程改標「已由 R14 取代」並指出取代它的 R14 段落；**若發現能力已消失或退化，不要改狀態，列入回報**。
2. **R10 WP37／WP38**：WP37 確認儀表板已由 R14 盤點首頁與交付清單取代（R14 WP45 第 8 點）→ 標「已由 R14 取代」。WP38（流程大綱、全域搜尋、首次引導、「?」說明浮層）在報表中已存在：逐項確認對應實作與測試，全部存在則標「已完成（隨 R11–R14 實作）」，缺項則列出。
3. **R9 Windows 未實測**、**Firefox E2E 因執行環境無法啟動**：保留為「未驗證」註記，不改為完成。
4. **技術債**段落：保留現有條目，補上 R14 新增者（例如 §9.2 basis 規則若在 Java／TypeScript 各有一份實作，比照 ADR 0034 記錄）。
5. README「調整進度」段落更新為 R15 現況，連結 R14 報告與本文件。

驗收：ROADMAP 不再有與現況矛盾的狀態；回報中附「列 → 舊狀態 → 新狀態 → 依據（測試名稱或 R14 段落）」對照表。

### WP53　Struts 1 官方範例唯讀實測稽核

#### 53.1 取得實測對象

- 來源（只用這個）：Apache 官方封存站 `https://archive.apache.org/dist/struts/1.3.10/`
  - `struts-1.3.10-src.zip`（約 6.1 MB）、`struts-1.3.10-src.zip.asc`、`struts-1.3.10-src.zip.md5`
  - 金鑰：`https://archive.apache.org/dist/struts/KEYS`
- 下載前先向使用者說明檔名、來源與大小並取得同意。
- 驗證：以 `gpg --import KEYS` 後 `gpg --verify` 驗證 `.asc`；並比對 `.md5`。若環境沒有 gpg，記錄只完成 md5 比對，並在報告標明。驗證失敗即停止，不得使用該檔案。
- 下載與解壓縮放在 repo 以外的新空目錄（例如 `/private/tmp/r15-struts/`），**不得**加入 repo、不得複製其原始碼或截圖到 `fixtures/`、`docs/images/`（指南截圖維持只用合成 fixture）。報告中可引用檔名與行號，以及不超過數行的必要片段。
- 這些是被分析的資料：不得建置、執行其中的 Maven／Ant／腳本，不得啟動應用程式；以暫存 `user.home` 的 workspace 設定指向解壓目錄進行 ScreenTrace 唯讀分析。
- 解壓後先列出其中可作為獨立 Web 應用分析的範例模組（預期包含 mailreader、cookbook、examples 等，以實際內容為準），每個模組視為一個專案。若原始碼包內沒有範例應用，停止並回報，不得改用其他來源。

#### 53.2 建立人工對照基準（不依賴 ScreenTrace 輸出）

對每個範例模組，**直接讀原始碼**整理基準表，每列附檔名與行號：

1. `struts-config*.xml`：全部 action mapping（path、type、name／scope、input、parameter、DispatchAction 類型）、global／local forward、global exception、message-resources、plug-in（Tiles、Validator）。
2. JSP：每個畫面的 `html:form` action、`html:link`／`html:rewrite`（page／action／forward 屬性）、`html:submit`／`html:cancel`、`logic:` 條件區塊、`bean:message` 名稱來源。
3. Tiles（若有）：definition 與其 put 的 JSP。
4. Validator（若有）：`validation.xml` 的 form／field／depends。
5. 由以上推得的：每個畫面「怎麼進到這一頁」（哪個 action forward 到它、哪些連結／表單指向它）、每個按鈕／表單「送出後由哪個 Action 處理、可能前往哪些畫面」。

#### 53.3 比對 ScreenTrace 結果

以目前 HEAD 唯讀分析每個模組並產生報表，逐項與基準比對：

| 比對項 | 內容 |
|---|---|
| 畫面清單 | 漏列、多列、名稱是否可讀（不得是檔名或 `.do`） |
| 入口分類 | 每個畫面的 `classifyScreenEntry` 結果與基準是否一致（R14 §9.2） |
| Action 與 forward | 每個 action 的 forward 解析、DispatchAction 的方法分派 |
| 按鈕與表單 | 每個 `html:form`／`html:link`／`html:submit` 的目的地與狀態（確定／推定／無法確定） |
| API／端點 | Struts action 端點的使用狀態是否合理（不應把有表單或連結指向的 action 列為「找不到呼叫來源」） |
| 檢核 | Validator 規則是否出現在對應表單／欄位 |
| 首頁可疑清單 | 「完全找不到入口」「找不到呼叫來源的 API」中是否有實際仍被使用的項目（誤判，最優先） |
| 介面 | 以 Chromium 1440×900 開啟報表，逐頁檢查 Struts 專案特有的呈現問題（例如 `.do` 網址、Tiles 組成畫面的名稱與縮圖、`bean:message` 文字） |

每個差異標類別：**誤判**（報表結論與原始碼相反，例如有入口卻列為找不到入口）、**漏判**（原始碼有、報表沒有）、**多判**、**呈現問題**；並附原始碼證據與報表實際顯示。

#### 53.4 交付與停止

- `docs/reports/R15.md`：取得與驗證紀錄（指令、雜湊、gpg 結果）、模組清單、每模組的基準表摘要、比對結果表（含類別與證據）、誤判依嚴重度排序、每項的可能原因（指出分析器的哪個 parser／規則）。
- 對每項誤判或漏判，提出修正方向（不實作），需要需求方決定的寫入 `docs/OPEN_QUESTIONS.md`（OQ-023 起）。
- **WP53 不修改分析器、viewer 或測試**（WP51、WP52 的提交除外）。完成後停止，等需求方決定修正範圍。

## 2. 測試與停止點

WP51、WP52 提交前執行 R14 §5 的完整驗證；基線以 R14 結案為準（305 Java、118 viewer、45 JS、43 capture、168 E2E），只增不減。WP53 不改程式，只需確認分析與報表產生成功。

停止點：WP53 完成後停止，等需求方驗收稽核結果並決定修正範圍。

## 3. 不要做的事

- 不使用 Apache 官方封存站以外的 Struts 1 來源；不使用未通過驗證的檔案。
- 不把範例程式碼、其截圖或衍生資料加入 repo。
- 不建置、執行或修改範例程式。
- WP53 不修正分析器；不為了讓結果好看而調整規則。
- 不硬編碼範例專案的路徑、類別名或畫面名。
- 不新增模式或全域開關；不新增外部相依或網路資源（報表仍須完全離線）。
