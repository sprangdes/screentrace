# ScreenTrace 第十六輪調整指示（R16：Struts 1 分析修正）

給 Codex 執行。執行前依 AGENTS.md §10 讀取 `AGENTS.md`、`docs/CODEX_INSTRUCTIONS.md`、`docs/REQUIREMENTS.md`、`docs/ROADMAP.md`、`docs/reports/R15.md`（WP53 稽核）、`docs/OPEN_QUESTIONS.md` 的 OQ-024、OQ-025、OQ-026（需求方已決定）、`docs/ADJUSTMENT_R14_INVENTORY.md` §2、§9.2。REQUIREMENTS §1 原文與 §2 決策不得更動。R3–R15 的「不要做」與「停止條件」仍適用。

## 0. 需求方的結論

R15 WP53 稽核通過（MD5 相符；環境無 gpg，簽章未驗證，接受為環境限制）。稽核證明 **Struts 1——V1 的主要目標——目前有系統性誤判**：官方 mailreader 的登入表單送出的 `/SubmitLogon.do` 被列為「找不到呼叫來源」，blank 的系統首頁被列為「完全找不到入口」。需求方若照報表刪除，會刪掉正在使用的功能。本輪修正這些問題。

審查者另於原始碼確認兩個稽核未點出的共同原因，併入本輪：

1. **forward／redirect 的 path 常寫成公開 URL**：例如 blank `WEB-INF/struts-config.xml` 的 global forward `welcome` 為 `path="/Welcome.do"`，mailreader `SubmitLogon` 的 `Success` forward 為 `path="/MainMenu.do"`。這類 path 要先依 servlet mapping 正規化回 action `/Welcome`、`/MainMenu`，再沿該 action 找到畫面；這很可能是大量 `STRUTS_FORWARD_UNRESOLVED` 的來源。
2. **`web.xml` 的 welcome-file 是系統入口**：blank `WEB-INF/web.xml` 的 `<welcome-file>index.jsp</welcome-file>`。被 welcome-file 指向的畫面是入口，不是「找不到入口」。

## 1. 實測對象與證據規則

- 實測對象：R15 已下載並通過 MD5 比對的 Apache Struts 1.3.10 原始碼包中 8 個範例模組（R15 報告列出），repo 外唯讀使用；若暫存檔已不存在，依 R15 §53.1 重新取得（下載前取得使用者同意）。
- **不得**把 Apache 範例原始碼、截圖或衍生資料加入 repo。每個修正都要有**自行撰寫**的最小合成 fixture（重現同一種模式即可，不複製範例程式碼）。
- 以 R15 報告的人工原始碼基準為驗收依據；修正後每個模組都要重新對照，數字由實際分析取得，不得調整規則去湊數。

## 2. 工作包

順序：**WP54 → WP55 → 停止驗收 → WP56 → WP57 → WP58 → WP59 → 停止驗收**。每項先提交失敗測試，再實作；提交訊息前綴 `R16:`。

### WP54　Struts URL 身分、forward 正規化與入口（OQ-024 方案 B）

1. **Servlet mapping**：讀 `web.xml` 中 ActionServlet 的 `servlet-mapping`，支援副檔名型（`*.do` 等任意副檔名）與路徑前綴型（`/do/*` 等）。多個 ActionServlet mapping 或無法證明時，不猜測，記診斷。
2. **端點別名**：action path（`/SubmitLogon`）與公開 URL（`/SubmitLogon.do`）為同一 endpoint 的別名，只產生一個端點身分，呼叫來源共用、統計只計一次。介面主要顯示公開 URL，別名列在詳細資料；URL 搜尋以兩種形式都能找到。若 graph schema 需要別名欄位，依 schema 規則處理並記 ADR。
3. **forward／redirect／exception path 正規化**：`<forward path>`、`<global-forwards>`、`<exception path>`、action 的 `forward=`／`input=` 屬性中，符合 servlet mapping 的公開 URL 先還原為 action path，再沿該 action 的 forward 解析到畫面（鏈長上限沿用 OQ-021 的 5，偵測循環）。`input` 為 forward 名稱或 Tiles definition 時依 Struts 規則解析（`controller inputForward` 設定須讀取）。
4. **Struts module**：`web.xml` 中 ActionServlet 的 `config/<module>` init-param 定義 module 前綴；module 內 JSP 的 `html:form action`、`html:link action`、`html:rewrite action` 以該 module 前綴解析；跨 module 的 `module=` 屬性與 `SwitchAction` 依 Struts 規則處理。（examples 模組有 9 份 module config，是主要驗收對象。）
5. **JSP 中的導覽 tag**：`logic:redirect`／`logic:forward`（`forward=`、`page=`、`action=`、`href=`）、`html:link`／`html:rewrite` 的 `forward=`（global forward 名稱）、`page=`、`action=` 皆建立導覽關係；常值者為 `STATIC_URL`，含 EL／scriptlet 者依 R14 §2.1 推定或維持 UNRESOLVED。
6. **welcome-file**：`web.xml` `welcome-file-list` 指向的畫面視為入口（入口來源標「系統預設首頁（web.xml welcome-file）」，basis `STATIC_URL`），在判斷依據顯示檔名與行號。welcome-file 指向 `.do` 時依第 3 點正規化。

驗收（實測，數字記入報告）：
- blank：Index 為有入口（welcome-file），Welcome 為有入口（`index.jsp` 的 `logic:redirect` → global forward `welcome` → `/Welcome` → `/pages/Welcome.jsp`）；`/Welcome` 只有一個端點且非「找不到呼叫來源」。
- mailreader：`/SubmitLogon` 與 `/SubmitLogon.do` 只出現一筆，狀態為使用中，來源為 Logon 畫面的表單；全模組不得再有成對的邏輯 path／公開 URL 端點。
- cookbook、el-example、faces-example1：R15 報告列出的 24、10、7 組成對路徑全部合併。
- examples：`/exercise/html-multibox-submit`、`/dispatch/dispatch-submit` 各為單一端點且有呼叫來源；報告列出 examples「找不到呼叫來源」端點修正前後的數字，並逐一說明剩下的每一筆為何仍找不到（例如確實沒有 JSP 指向，或屬 JSF）。
- 各模組 `STRUTS_FORWARD_UNRESOLVED` 修正前後數字；剩下的每一筆列出原始 forward 與原因。
- 合成 fixture 測試：副檔名型與路徑前綴型 mapping、forward 寫成 `.do`、多 module、`logic:redirect forward=`、welcome-file、mapping 無法證明時不猜測。

### WP55　Tiles 畫面界線（OQ-025 方案 A）

依 OQ-025 決定實作。驗收：
- faces-example2 的畫面數等於「被 forward 指向的 page definition 與直接 forward 的 JSP」數（報告逐一列出，並與 R15 人工基準對照）；`.base`、`.loggedoff`、`.loggedon`、`layout` 不再是畫面。
- 片段 JSP 的按鈕歸入所屬畫面的片段群組，不遺失。
- `TILES_REFERENCE_UNRESOLVED` 修正前後數字與剩下各筆原因。
- 合成 fixture：extends 鏈、put 為 JSP 與 put 為字串、被 forward 與未被 forward 的 page definition。

**WP54、WP55 完成後停止**，以 8 個模組重新產生報表，報告附「R15 人工基準 → 修正前 → 修正後」對照表，等需求方驗收。

### WP56　Validator 規則落到表單、DispatchAction 分派

1. **Validator**：依 Struts 規則把 `validation.xml` 的 `<form name>` 對到 form-bean 名稱（ValidatorForm／DynaValidatorForm）或 action path（ValidatorActionForm／DynaValidatorActionForm），再對到使用該 action 的 `html:form`，`<field property>` 對到表單內同名欄位；`depends` 與 `msg`／`arg` 的訊息 key 依 WP57 解析。對不到時記診斷並保留規則。驗收：mailreader LogonForm 的 username required、password required／minlength／maxlength 出現在 Logon 畫面對應欄位；各模組 `VALIDATION_RULE_UNRESOLVED` 修正前後數字與剩下各筆原因。
2. **DispatchAction／LookupDispatchAction／MappingDispatchAction／EventDispatchAction**：依 action 的 `parameter` 找到表單中同名欄位（hidden、select、submit 的 `property`）之常值，建立「分派到 `<方法名>`」的行為；LookupDispatchAction 以訊息 key 對照。非常值者 UNRESOLVED。驗收：examples `dispatch.jsp` 的 4 個送出各自顯示分派的方法名。

### WP57　訊息資源與名稱

1. 讀 `message-resources`（含 module 與 `key=` 指定的多組 bundle）對應的 `.properties`（預設 locale 檔；有多個 locale 時只用無 locale 後綴者，其餘列為候選不擇一）。
2. `bean:message key=`（含 `bundle=`）在**畫面名稱、按鈕名稱、靜態預覽文字**中以 bundle 值取代；key 找不到時顯示「（訊息 key：<key>）」，不得顯示 `<bean:message ...>` 原始 tag。含 EL／`arg` 的動態訊息以範例值填入並沿用既有「示意畫面」說明。
3. 畫面名稱規則沿用 R12 WP42，`bean:message` 解析值視同可見文字。
4. API 頁：Struts action 端點若有任一 forward 解析到畫面，分類為「畫面網址」；否則顯示「Struts 動作」（原值放 tooltip），不得顯示「其他」。

驗收：mailreader 首頁與逐頁確認的畫面名稱、按鈕名稱為 `ApplicationResources.properties` 的值；8 個模組的報表可見文字中沒有 `<bean:message`、`<s:message`、`<h:` 原始 tag 字串（JSF 依 WP58 另行標示，不顯示原始 tag）。

### WP58　JSF 混合模組標示（OQ-026 方案 B）

依 OQ-026 決定實作：診斷、首頁提醒、逐頁確認提醒、md §8 列出，JSF 元件不計為已解析。卡片與縮圖不得出現 JSF 原始 tag 字串（以「（JSF 元件，未分析）」之類固定文字表示）。驗收：faces-example1／2 首頁出現提醒，數字為實際含 JSF 元件的畫面數；非 JSF 模組不出現。

### WP59　重新稽核與文件

1. 以 8 個模組重新執行 R15 §53.3 的全部比對項，報告附「R15 人工基準 → R15 實測 → R16 實測」三欄對照表，以及首頁「可能已經沒在用」中每一項的原始碼判讀（是否確實沒在用）。
2. 以 Chromium 1440×900 實際開啟 mailreader、examples、faces-example2 的首頁、逐頁確認、API 頁，記錄觀察（截圖留在 repo 外）。
3. 更新 `docs/PRODUCT_SPEC.md` 的 Struts 支援描述、`docs/ARCHITECTURE.md`（若 schema 或 adapter 有變）、`docs/USER_GUIDE.md`（JSF 提醒、別名顯示）、ROADMAP、`docs/reports/R16.md`、ADR（編號接續）。

**WP59 完成後停止**，等需求方最終驗收。

## 3. 測試與停止點

每次提交前執行 R14 §5 完整驗證（E2E 預設並行）；基線以 R15 結束時為準（305 Java、118 viewer、45 JS、43 capture、169 E2E），只增不減。eMusicStore、PetClinic 的 API 狀態與入口分類不得因本輪改變（Spring 專案不受 Struts 規則影響）；在報告附兩者修正前後對照以證明。

預先授權（同 R14 §2.4 格式）：只可修改因本輪新增的別名合併、forward 正規化、Tiles 畫面界線而改變的 Struts fixture **數量型期望值**（畫面數、端點數、API 狀態分布、診斷數），每處在 ADR 逐處記錄並證明新期望在舊實作上失敗。其他斷言衝突依 §0.3 停止並寫入 OPEN_QUESTIONS（OQ-027 起）。

## 4. 不要做的事

- 不解析 JSF 元件（OQ-026）；不支援 Struts 2（偵測到仍以 `UNSUPPORTED_FRAMEWORK` 拒絕）。
- 不猜測 servlet mapping、context path 或訊息 bundle；無法證明者維持 UNRESOLVED 並記診斷。
- 不把 INFERRED 升級為 CONFIRMED；不以文字相似度或 LLM 對應。
- 不把 Apache 範例原始碼或衍生資料加入 repo；不建置、執行或修改範例程式。
- 不硬編碼範例專案的路徑、類別名、action 名或畫面名。
- 不新增模式或全域開關；報表仍須完全離線。
