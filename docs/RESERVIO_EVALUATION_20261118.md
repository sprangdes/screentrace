# reservio 分析結果評估（2026-11-18）

目的：以 [sprangdes/reservio](https://github.com/sprangdes/reservio)（Spring Boot 後端＋React 前端）測試 ScreenTrace，比對分析結果是否足以讓非軟體工程師背景的人了解 reservio 的功能。

## 1. 測試方式

- 以 `java -jar screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar analyze <reservio 路徑>` 分析（約 38 秒）：43 個畫面、66 支 API、1837 個元件。
- 另於 `~/.screentrace/config.json` 設定三個角色（訪客／顧客／商家）重跑，檢視「角色」頁。
- 對照 reservio 原始碼建立基準：`frontend/src/App.tsx` 34 條路由、66 支 Controller API、6 個 `@Scheduled` 排程、`line/conversation` LINE 對話流程、`ReservationStatus` 狀態。

## 2. 結論

報表能讓非工程師「看到」reservio 長什麼樣子，但不足以「理解」reservio 的完整功能。以原始碼整理出的 23 項功能中：

| 判定 | 數量 |
|---|---|
| 完整呈現 | 10 |
| 有呈現但會誤導或不完整 | 7 |
| 完全沒有呈現 | 6 |

缺口集中在三類：沒有畫面的背景作業與 LINE 聊天預約管道、業務規則（狀態流程）、以及呈現層的工程用語與示例資料失真。

## 3. 功能覆蓋對照

| # | 對象 | 功能 | 判定 | 說明 |
|---|---|---|---|---|
| 1 | 訪客 | 首頁介紹 | ⚠️ | CTA 按鈕顯示「示例值」，訪客版導覽列出現「登出」（見 P3） |
| 2 | 訪客 | 註冊顧客／商家帳號 | ✅ | |
| 3 | 訪客 | 登入（帳密＋LINE 登入） | ⚠️ | LINE 登入導回路徑標為無法確定（見 P8） |
| 4 | 訪客 | 忘記密碼（Email 驗證碼） | ✅ | |
| 5 | 顧客 | 概覽 | ⚠️ | 畫面名稱為英文元件名「Customer Dashboard Page」（見 P5） |
| 6 | 顧客 | 建立預約（三步驟） | ⚠️ | 步驟有拆開，但預覽同時疊出載入中／錯誤／空白／資料（見 P4） |
| 7 | 顧客 | 我的預約、取消預約 | ⚠️ | 取消 API 已串接；「取消需商家確認」規則看不出來（見 P2） |
| 8 | 顧客 | 想預約店家 | ✅ | |
| 9 | 顧客 | 通知中心、通知設定（含 Email 驗證） | ✅ | |
| 10 | 顧客 | LINE 帳號綁定 | ✅ | 並正確指出顧客介面沒有連結可到 `/settings/line-accounts` |
| 11 | 顧客 | 個人資料 | ✅ | |
| 12 | 商家 | 首次商家設定 | ✅ | |
| 13 | 商家 | 營運概覽 | ✅ | |
| 14 | 商家 | 預約中心（今天／待處理／全部／行事曆） | ⚠️ | 畫面與按鈕完整；預約狀態流程缺（見 P2） |
| 15 | 商家 | 服務管理（新增、編輯、上下架、刪除） | ✅ | |
| 16 | 商家 | 商家設定 7 頁 | ⚠️ | 選項值遺失，例如預約間隔 15／30／45／60 分鐘只剩「分鐘」（見 P3） |
| 17 | 商家 | LINE 官方帳號整合 | ✅ | 憑證、Webhook 金鑰輪替、測試連線、圖文選單、停用均有串接 |
| 18 | 系統 | LINE 聊天機器人預約 | ❌ | 見 P1 |
| 19 | 系統 | 預約結束自動標記完成 | ❌ | 見 P1 |
| 20 | 系統 | 預約前 2 小時提醒 | ❌ | 見 P1 |
| 21 | 系統 | 通知寄送佇列與清理 | ❌ | 見 P1 |
| 22 | 系統 | LINE 資料保留期限清理 | ❌ | 見 P1 |
| 23 | 系統 | 預約狀態與轉換規則 | ❌ | 見 P2 |

## 4. 分析正確的部分

| 項目 | 結果 |
|---|---|
| 前端路由 | 34／34，依角色、條件拆成 43 個畫面變體 |
| 後端 API | 66／66 |
| API 呼叫來源 | 61 支有畫面呼叫來源；4 支未被使用（`GET /api/dashboard`、`/api/reservations/today`、`/week`、`/month`）經查前端僅定義於 `frontend/src/api.ts:171,203-205` 而從未呼叫，判定正確 |
| LINE webhook | 正確標為「外部呼叫（Webhook）」，不授權移除 |
| 角色可見範圍 | 訪客／顧客／商家可進入的畫面與 reservio 的 `RequireCustomer`／`RequireBusiness` 守衛一致 |
| 按鈕／連結名稱 | 1028 個中約 88% 為可讀中文名稱 |

## 5. 問題清單

### P1　沒有畫面的功能完全不呈現（高）

非工程師看報表不會知道下列功能存在：

| 功能 | reservio 來源 |
|---|---|
| LINE 聊天機器人預約：選服務 → 日期 → 時段 → 姓名 → 電話 → 確認；查詢我的預約；取消（需填原因） | `line/conversation/LineReservationConversation.java:165-172, 201-212` |
| 預約結束自動標記「已完成」（每 5 分鐘） | `service/ReservationService.java:342` |
| 預約前 2 小時提醒顧客與商家（每 5 分鐘） | `service/ReservationNotificationService.java:45` |
| 通知寄送佇列（每分鐘）與每日清理 | `service/NotificationWorker.java:27, 52` |
| LINE webhook 事件背景處理 | `line/service/LineWebhookWorker.java:54` |
| LINE 資料保留期限清理（事件 30 天、對話 14 天） | `line/service/LineDataRetentionService.java:60` |

報表只把 LINE 管道呈現為一支 `POST /api/integrations/line/webhook/{webhookKey}`。`ReservationSource` 也顯示預約有 WEB 與 LINE 兩個來源。

建議：Spring adapter 擷取 `@Scheduled`（cron 轉白話頻率）與 webhook handler 的下游呼叫，以 INTEGRATION 節點表示；報表新增「系統自動作業」區塊。

### P2　業務規則與狀態流程缺漏（高）

`ReservationStatus` 有 PENDING、CONFIRMED、CANCEL_REQUESTED、CANCELLED、COMPLETED 五種狀態（`enums/ReservationStatus.java:3`）。顧客取消要經商家確認或駁回、結束後自動完成、提醒時機等規則，在報表中只能從零散按鈕名稱（「駁回取消申請」「確認取消」）推測。

建議：從 enum 定義與 `setStatus(...)` 呼叫點推導狀態轉換，產出狀態流程圖並連到觸發的按鈕／排程。

### P3　按鈕文字與選項顯示成「示例值」或遺失（中）

| 畫面 | 原始碼 | 報表呈現 |
|---|---|---|
| 首頁（訪客） | `PublicHero.tsx:15-16`：`primary.label` 為「開始預約」、`secondary.label` 為「建立商家帳號」 | 兩顆按鈕都顯示「示例值」 |
| 首頁（訪客）導覽列 | `publicNavigation.ts:16-19`：我要預約／我是商家／登入／建立帳號 | 顯示「示例值／登出」 |
| 預約與時段設定 | `Phase4Editors.tsx:4`：`[15,30,45,60].map(...)` 產生 4 個選項 | 只剩一個「分鐘」 |

約 70 個按鈕／連結名稱為 `<Link>`、`<button>`，來自條件式物件屬性或陣列 map。

建議：解析「三元運算的兩個物件字面值取屬性」與「字面值陣列 `.map` 產生的選項」；角色條件已知時（訪客 `me` 為否）取對應分支。

### P4　預覽同時疊出互斥狀態（中）

例如「建立預約（step = 1）」同時出現載入骨架、「暫時無法載入預約資訊」、「目前沒有可用的預約店家」與正常清單；「我的預約」同時出現「目前還沒有預約」與預約列表；「預約與時段」顯示「無法完成載入」。非工程師會以為畫面壞掉。

建議：預覽預設只呈現「資料已載入」的代表狀態，載入中／錯誤／空白改為可切換的狀態頁籤。

### P5　畫面名稱夾帶程式用語（中）

| 報表名稱 | 問題 |
|---|---|
| 登入 Reservio（?lineLogin=failed\|success） | 查詢參數；登入、註冊、商家註冊、忘記密碼、輸入驗證碼各出現兩個看似重複的畫面 |
| 建立預約（step = 1） | 程式條件，宜為「步驟 1」 |
| 通知中心（Merchant Notifications Page） | 英文元件名，宜為「商家版」 |
| 通知設定（Settings Scaffold Page）／（Customer Notification Settings Content） | 英文元件名，宜為「商家版／顧客版」 |
| Customer Dashboard Page | 頁面沒有 h1 時退回元件名 |

建議：查詢參數變體以白話標示（如「LINE 登入回來」）或併入同一畫面；`step = n` 轉為「步驟 n」；角色變體以角色命名；無標題時優先用導覽連結的文字（如「概覽」）。

### P6　功能地圖的分組與說明不適合 React 專案（中）

- 依網址第一段分組，顧客功能（`/dashboard`、`/my/reservations`、`/preferred-businesses`、`/profile`）多落在「其他」。
- 分組內畫面以箭頭串成「流程 1」，看起來像操作順序，實際不一定是。
- 說明文字對 React 專案仍寫「Struts module、處理程式類別、Tiles 定義名稱」（`screentrace-viewer/src/feature-map.ts:45`、`screentrace-viewer/src/shared/review-md.ts:988`）。

建議：說明文字依專案技術調整；React 專案可依角色或導覽選單（側欄、底部導覽）分組。

### P7　API 只有技術路徑，沒有白話說明（低）

例如 `POST /api/reservations/{id}/cancel` 對應 `ReservationApiController.cancelReservation()`，報表沒有「顧客取消預約」這類說明。

建議：以觸發按鈕文字（「取消預約」）與處理方法名稱合成一句白話用途。

### P8　LINE 登入導回路徑無法確定（低）

診斷 `EXTERNAL_LOGIN_RETURN_UNRESOLVED`（`src/main/java/com/reservio/config/SecurityConfig.java:104`）。`GET /api/auth/line/user`、`/line/business` 報表顯示「完成後的導回路徑無法確定」。

### P9　角色需要手動設定（低）

reservio 的權限守衛（`RequireCustomer`、`RequireBusiness`、`RequireBusinessSetup`）已清楚區分角色，但角色頁必須手動在 `config.json` 寫條件才會出現，且只在以專案名稱分析時生效。另有 `REACT_AUDIENCE_TOO_MANY`（身分組合超過 16）與 `PERSONA_DIMENSIONS_TRUNCATED`（維度超過 64）診斷。

建議：由路由守衛自動建議角色（訪客、顧客、商家、尚未設定店家的商家），分析人員確認即可。

### P10　啟動腳本 Java 版本判斷錯誤（低）

`bin/screentrace:25` 只讀 `java -version` 輸出的第一行。環境設有 `JAVA_TOOL_OPTIONS` 時第一行是「Picked up JAVA_TOOL_OPTIONS…」，`doctor` 會誤報「Missing Java 17+」，`analyze` 也無法執行。這次測試改用 `java -jar` 直接執行。

建議：改為搜尋包含 `version "` 的那一行。

## 6. 建議處理順序

1. P1、P2：背景作業、LINE 對話管道與狀態流程，補上 7 項完全沒呈現或缺規則的功能。
2. P3、P4：消除「示例值」與疊加狀態，讓預覽可信。
3. P5、P6、P7：去除工程用語，依角色或導覽分組。
4. P8、P9、P10。

## 7. 處理狀態（2026-11-18）

| 問題 | 輪次 | 處理結果 |
|---|---|---|
| P1 沒有畫面的功能 | R81（[ADR 0159](adr/0159-r81-background-jobs.md)） | API 頁「系統自動作業」列出 6 個排程與白話執行時機、後端呼叫；md §12 |
| P2 狀態流程 | R82（[ADR 0160](adr/0160-r82-state-changes.md)） | API 頁「資料狀態」列出各狀態由哪個 API／作業設定，前端一致時並列中文；LINE 對話 9 個步驟可見；md §13 |
| P3 示例值 | R83、R91（[ADR 0161](adr/0161-r83-literal-alternatives-and-wrapped-labels.md)、[0168](adr/0168-r91-screen-facts-through-props.md)） | 訪客首頁導覽列與按鈕與實際畫面一致（「我要預約…」「開始預約」），預約間隔顯示 15／30／45／60 分鐘 |
| P4 疊加狀態 | R84（[ADR 0162](adr/0162-r84-page-states-in-preview.md)） | 截圖與預覽預設只顯示有資料狀態，可切換載入中／錯誤／沒有資料 |
| P5 畫面名稱 | R85（[ADR 0163](adr/0163-r85-plain-screen-names.md)） | 「網址帶 lineLogin=…」「step 為 1」「通知中心（商家）」「概覽」 |
| P6 功能地圖 | R86、R93（[ADR 0164](adr/0164-r86-menu-features.md)） | 依選單分組，變體與同元件畫面併入同一功能；「其他」由 14 個降為 8 個；說明只列實際用到的依據 |
| P7 API 用途 | R87（[ADR 0165](adr/0165-r87-api-purpose.md)） | API 詳情與清單顯示由觸發按鈕組成的用途 |
| P8 LINE 登入導回 | R88（[ADR 0166](adr/0166-r88-login-return-through-helpers-and-configuration.md)） | 解析為 `/login`，診斷消失 |
| P9 角色 | R89、R92（[ADR 0167](adr/0167-r89-suggested-personas.md)） | 沒有設定時自動建議未登入、BUSINESS、USER，結果與手動設定相同 |
| P10 啟動腳本 | R90 | `doctor` 在設有 `JAVA_TOOL_OPTIONS` 的環境正確判斷 Java 版本 |

### 後續處理（R94～R102）

| 項目 | 輪次 | 結果 |
|---|---|---|
| 狀態的原狀態（需求方改為推論） | R94、R101 | 「待確認 → 已取消」「取消申請中 → 已確認」等以推測標示；LINE 對話步驟以狀態轉換清單呈現 |
| 前端多種寫法（需求方改為全部列出） | R95 | 「待確認／等待店家確認」，附每種寫法的來源 |
| 背景作業範圍 | R96 | 另認 XML 排程、程式排程、Quartz、`@Async`，Struts 專案也套用 |
| 文字狀態與深度 | R97 | 狀態欄位的字串／數字寫入列為狀態；狀態寫入追到 8 層 |
| 畫面條件 | R98 | 改名解構的 props、Context 值與回傳條件的 hook 也能依畫面身分判斷 |
| 疊加狀態 | R99 | JSP 的空清單／錯誤區塊也預設隱藏；React 狀態命名擴充 |
| 登入導回 | R100 | 另認 `String.format`、`URI`、`StringBuilder`、`RedirectStrategy`、`defaultSuccessUrl` 等 |
| 呈現瑕疵 | R102 | 「Settings Scaffold Page」消失；「其他」降為 6 個；處理中按鈕的用途；角色可採前端中文（reservio 沒有對照，仍為 BUSINESS、USER） |
| 剩餘三項 | R103 | 自動建議的角色依建立帳號的畫面命名為「商家」「客戶」；LINE `selectTime`／`confirm` 的原狀態列出並註明另有推不出的進入方式；「其他」降為 3 個（萬用轉址、強制改密碼、LINE 帳號連結，皆無共用依據） |

