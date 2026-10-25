# ScreenTrace 第十八輪調整指示（R18：React 身分畫面與流程對齊原始設計）

給 Codex 執行。執行前依 AGENTS.md §10 讀取 `AGENTS.md`、`docs/CODEX_INSTRUCTIONS.md`、`docs/REQUIREMENTS.md`、`docs/ROADMAP.md`、`docs/ARCHITECTURE.md` §4、`docs/REVIEW_STATE_CONTRACT.md`、`docs/REVIEW_MD_CONTRACT.md`、`docs/ADJUSTMENT_R17_FLOW.md`、`docs/reports/REAL_PROJECTS_BATCH7_20261022.md`。REQUIREMENTS §1 原文與 §2 決策不得更動。R3–R17 的「不要做」與「停止條件」仍適用；R17 的兩頁報表與主要流程維持不變，本輪只修正分析結果與預覽內容，不新增報表頁面。

## 0. 需求方的結論

以 `sprangdes/reservio`（Spring Boot 後端＋React／react-router 前端）實測，並逐項對照原始碼與該專案自己的 `docs/screen-api-map.md`。

**已做對的部分（本輪不得退步）**：32 個路由與 `*` 全部成為畫面；66 個 endpoint 全部發現；各畫面呼叫的 API 大致與原始設計一致；「未被使用」的 `/api/dashboard`、`/api/reservations/today|week|month` 與原專案文件一致；另有三處比原專案文件更正確（`GET /api/reservations/business/{id}`、商家註冊成功回 `/login?registered=1`、商家初始設定完成到 `/business/info`）；商家設定頁以 `page` prop 區分的各頁 API 正確。

**主要問題**：reservio 的核心設計是「依身分決定畫面」——訪客、顧客（`ROLE_USER`）、已設定商家（`ROLE_BUSINESS` 且有 `business`）、未設定商家、`mustChangePassword`。ScreenTrace 已把每個元件的條件精確記在 `guard`（例如 `!me`、`me?.role === 'ROLE_BUSINESS'`），但沒有用來拆分畫面、過濾共用外框或決定預覽內容，導致：同一網址的不同身分畫面被合成一張、商家專用頁出現訪客與顧客的導覽、登入後去哪裡完全沒有解析。需求方若照報表標記，會對錯誤的畫面內容作決定。

### 0.1 問題清單

路徑相對於 reservio repository 根目錄；實測 commit 見 §1。

| 編號 | 優先 | 問題 | 原始碼證據 | 目前分析結果 |
|---|---|---|---|---|
| RV-01 | P1 | 同一網址依身分渲染不同畫面，被合成一張 | `frontend/src/App.tsx` `BusinessAwareHome`：`!me` → `PublicHomePage`；`ROLE_BUSINESS` → `OperationsOverviewPage`；其他 → `Navigate`。`RoleAwareNotificationsRoute`、`RoleAwareNotificationSettingsRoute` 同型 | `/` 含 `PublicHero`、`PublicHeader` 等訪客元件與商家總覽元件共 78 個；預覽只顯示商家版，訪客首頁在原型中看不到，其「註冊」「商家註冊」連結卻成為商家總覽的出口。`/notifications`、`/notifications/settings` 同樣混合 |
| RV-02 | P1 | 共用外框的身分分支沒有依該路由的身分過濾 | `frontend/src/components/Navbar.tsx` 以 `me ?` 與 `me.role === 'ROLE_BUSINESS'` 分支；`Navbar` 匯入 `PreferredBusinessesPanel`（僅顧客分支使用） | `/business/setup`（僅未設定商家可進）預覽顯示訪客的「登入／註冊」與顧客的「立即預約／我的預約」；`GET`／`POST /api/preferred-businesses` 被歸到 `/business/setup`、`/line/account-link` |
| RV-03 | P1 | 畫面沒有「誰能進入」的資訊 | `App.tsx` 的 `RequireAuth`、`RequireCustomer`、`RequireBusiness`、`RequireBusinessSetup`、`AuthRouteRedirect`、`ForceChangeRouteGuard`、`PasswordResetGuard`、`BusinessSetupGuard` | 無法回答「顧客登入後能看到哪些畫面」；全站 Guard 條件被重複串在每個元件的 `guard` 前綴（`!(loading) && !(me?.mustChangePassword && …) && …`） |
| RV-04 | P1 | 登入後導向未解析 | `frontend/src/pages/LoginPage.tsx:37-38`、`ForceChangePasswordPage.tsx:44`：`navigate(resolvePostAuthDestination(user).path)`；`features/auth/authDestination.ts` 各分支回傳常值路徑 | 行為為 UNRESOLVED；流程中沒有「登入 → `/dashboard`／`/`／`/business/setup`／`/force-change-password`」 |
| RV-05 | P2 | LINE OAuth 往返沒有成為流程 | `LoginPage` 以整頁導向開啟 `GET /api/auth/line/user`；後端 `LineOAuth2AuthenticationSuccessHandler.buildSuccessRedirect` 回到 `successRedirectPath?lineLogin=success&role=…` | 只記為一般 API 呼叫，看不到回到 `/login?lineLogin=success` 再依身分導向 |
| RV-06 | P2 | 分派表呼叫沒有展開 | `features/business-settings/hooks/useSettingsOverview.ts`：`const calls = { slots: api.getDefaultSlots, …, lineStatus: api.lineIntegrationStatus }; … calls[key]()`，`key` 來自 `Object.keys(calls)` | `/business/settings` 少了 5 個載入 API（`GET /api/businesses/slot/default`、`/api/businesses/{businessId}/services`、`/api/notifications/preferences`、`/api/integrations/line/settings`、`/api/integrations/line/status`） |
| RV-07 | P2 | 事件處理器內以已知 prop 決定的分支沒有修剪 | `App.tsx` 以 `editing={false}`／`editing` 渲染 `ServiceEditorScaffold`；`features/service-management/ServiceEditorPage.tsx` 的 `save` 內 `if (editing) { modifyServiceItem … } else { addServiceItem … }` | `/service/new` 多出 `POST /api/businesses/services/{id}/modify` 與 `GET /api/businesses/{businessId}/services`；`/service/:id/edit` 多出 `POST /api/businesses/services`。渲染層已依 prop 值修剪，處理器沒有 |
| RV-08 | P2 | 字面路徑與樣板路徑同時符合時標 AMBIGUOUS | 前端呼叫 `GET /api/businesses/category`；後端同時有 `/api/businesses/category` 與 `/api/businesses/{category}` | `/business/settings/profile`、`/register-business`、`/business/setup` 多出 `GET /api/businesses/{category}`（AMBIGUOUS）。Spring 以路徑樣式特定性決定，字面路徑優先 |
| RV-09 | P2 | 由外部系統呼叫的端點被列為「未被使用」 | `POST /api/integrations/line/webhook/{webhookKey}`；`config/SecurityConfig.java` 對此路徑 `permitAll` 且 CSRF 例外 | 與確實沒在用的 4 個 API 並列「未被使用」，需求方可能據此標記移除 |
| RV-10 | P3 | 預覽同時顯示互斥狀態 | 各頁以 `loading && …`、`error && …`、`items.length === 0 && …` 分別渲染 | `/login` 同時有「帳號已建立」提示與錯誤訊息；`/notifications` 同時有錯誤、「載入通知中」、資料列與「目前沒有通知」；`/` 有兩個錯誤橫幅 |
| RV-11 | P3 | 畫面名稱只有網址，畫面元件為外層包裝 | 頁面有明確標題（`<h1>營運概覽</h1>`、`通知中心`、`登入 Reservio`）；`ReservationCenterRoute preset="today|all|pending"` | `prototype-model.json` 畫面名稱為 `business/settings` 等；`view` 為 `SettingsRoute`、`BusinessAwareHome`、`RoleAwareNotificationsRoute`、`ReservationCenterRoute`；預約中心三頁無法區分 （2026-10-25 更正：報表實際已用預覽的 `<h1>` 命名多數畫面；真正的缺口是 `view` 指向外層包裝元件，導致同網址的變體同名，以及 JSX spread props 未解析，見 WP83 第 2 點。）|
| RV-12 | P3 | Spring Boot 未設定 context path 仍逐筆報診斷 | `src/main/resources/application*.yml` 有 `server.servlet` 區段但沒有 `context-path` | 59 則 `CONTEXT_PATH_UNSPECIFIED`，全部是雜訊 |
| RV-13 | P3 | 樣式表來自未安裝的套件時沒有診斷 | `frontend/src/main.tsx`：`import 'bootstrap/dist/css/bootstrap.min.css'`；分析對象沒有 `node_modules` | `/business/setup` 的 Navbar 預覽無樣式，報表沒有任何提示 |

### 0.2 需由需求方決定的事項（WP79、WP82 開工前回覆）

| 編號 | 問題 | 審查者建議 |
|---|---|---|
| R18-A | 同一網址拆成多個身分畫面後，既有 md／暫存中以舊 `screenId` 記錄的決策如何處理？ | 舊 `screenId` 改為網址層級（EntryPoint）ID，不再是可標記的畫面；匯入時列為 orphan 並提示「此網址已依身分拆分，請重新標記」，**不得靜默套用到任一變體**。只有一個身分變體的網址，畫面沿用原 `screenId`，決策不受影響 |
| R18-B | D5「沒有任何畫面呼叫的 API 標示未被使用」是否適用於由外部系統呼叫的端點（RV-09）？ | 新增 API 頁附註「外部呼叫（Webhook）」，仍不計入可移除（D4 不變）；D5 文字不改，以附註呈現判斷依據。若需求方要求嚴格依 D5，則只加附註、狀態維持「未被使用」 |
| R18-C | 身分在報表上的顯示名稱 | 預設顯示條件摘要（例如 `未登入（!me）`、`me.role = ROLE_BUSINESS，me.business 有值`）；不從字串猜中文名稱。需求方若要自訂名稱，另開 OQ |

未回覆前，WP78 與 WP80–WP81 可先進行；WP79 與 WP82 的相關部分停止並寫入 OPEN_QUESTIONS（OQ-035 起）。

## 1. 實測對象與證據規則

- 實測對象：`https://github.com/sprangdes/reservio`，固定 commit `8d9eccb`（2026-10-24 取得）。repo 外唯讀使用，不建置、不執行、不安裝其相依套件。
- 對照基準：reservio 原始碼為唯一依據。`docs/screen-api-map.md` 只作為索引；它與原始碼不一致之處（§0「比原專案文件更正確」三項、`/business/info` 是連結入口頁而非商家資料頁、顧客首頁沒有直接連到 `/notifications/settings`）以原始碼為準，不得為了符合該文件而修改分析規則。
- **不得**把 reservio 原始碼、截圖或衍生資料加入 repo。每項修正都要有**自行撰寫**的最小合成 fixture，重現同一種寫法即可（例如自寫的 `RequireCustomer` Guard、自寫的分派表 hook），不複製 reservio 程式碼。
- 修正前先以 R18 開始時的 `main`（`dbacc54`）分析 reservio，保存 graph 摘要（repo 外），作為「修正前」數字；每個工作包完成後重新分析並對照。

## 2. 硬性原則

1. 身分只能由原始碼中的條件推導：路由外層 Guard 的導向／`return null` 條件、畫面元件中的提前 `return`、條件式渲染。**不得**依變數名稱、字串內容或角色名稱猜測身分，不得硬編碼 `me`、`role`、`ROLE_*`、`useAuth` 等名稱。
2. 無法判定真假的條件維持自由變數；只有可證明矛盾時才修剪。被修剪的元件與行為不刪除，改歸到其他身分變體或標示為「此身分下不顯示」，evidence 記錄矛盾的兩個條件與來源行號。
3. 推定結果維持 INFERRED，不升級為 CONFIRMED；不以 LLM 或文字相似度判斷。
4. Struts、Spring MVC JSP、Spring Boot JSP 專案的分析結果不得因本輪改變（見 §4 回歸要求）。

## 3. 工作包

順序：**WP78 → WP79 → WP80 → 停止驗收 → WP81 → WP82 → 停止驗收 → WP83 → WP84 → WP85 → 停止驗收**。每項先提交失敗測試，再實作；提交訊息前綴 `R18:`。

### WP78　身分事實推導與畫面適用身分（RV-03）

1. **Guard 包裝元件**：元件以 `if (<cond>) return <Navigate …/>`、`if (<cond>) return null` 或回傳 `<Navigate>` 的三元運算保護 `children` 時，`children` 只在所有這類條件為假時渲染。把這些條件的否定合取為該層的「渲染事實」。巢狀 Guard（`RequireAuth` → `RequireCustomer`）依序合取；包在 `<Routes>` 外的全站 Guard（`PasswordResetGuard`、`BusinessSetupGuard`）同樣適用於每個路由。
2. **條件原子**：把事實拆成原子條件，正規化 optional chaining 與否定（`me?.role === 'X'` 與 `me.role === 'X'` 為同一原子；`!(a && b)` 依德摩根展開，無法展開的保留整句為一個原子）。
3. **矛盾規則**（只用以下規則，其餘一律視為獨立）：
   - 同一原子的真與假矛盾。
   - 同一左值與不同常值的嚴格相等（`x === 'A'` 與 `x === 'B'`）不能同時為真。
   - 物件為假（`!me`）時，以 optional chaining 取其屬性與非 `undefined` 常值比較（`me?.role === 'A'`）必為假；以 `me.x` 直接存取的條件在 `!me` 下不得出現（記為矛盾）。
4. **畫面屬性**：每個 SCREEN 新增 `audience`（渲染事實的原子集合，含原子文字、真假、來源檔案與行號）。元件的 `guard` 移除與畫面渲染事實重複的前綴，只保留元件自身的條件（RV-03 的重複前綴）。依 ARCHITECTURE §4.1 提升 schema minor 版本並寫 ADR；舊版 graph 仍可讀取。
5. **身分組合**：以所有路由渲染事實中出現的原子，列出至少讓一個畫面可渲染的真假組合，作為報表的身分清單；組合數超過 16 時不再細分，記診斷 `REACT_AUDIENCE_TOO_MANY` 並只輸出各畫面自己的 `audience`。

合成 fixture（`screentrace-js/test`）：
- 兩層 Guard（登入檢查＋角色檢查）包住頁面；全站 Guard 包住 `<Routes>`。
- Guard 以 `return null` 與以三元運算回傳 `<Navigate>` 兩種寫法。
- `!user` 與 `user?.kind === 'admin'` 的矛盾；`user.kind === 'a'` 與 `user.kind === 'b'` 的矛盾。
- 無法判定的條件（例如 `featureFlag`）不得造成修剪。
- Guard 名稱與身分欄位名稱使用與 reservio 不同的名稱，證明沒有硬編碼。

驗收（reservio 實測，數字記入報告）：
- 每個畫面的 `audience` 與 `App.tsx` 的 Guard 一致：`/dashboard`、`/my/reservations`、`/reservation/new`、`/preferred-businesses`、`/profile`、`/settings/line-accounts` 為顧客；`/reservation/*manage`、`/service/*`、`/business/settings*`、`/business/info` 為已設定商家；`/business/setup` 為未設定商家；`/login`、`/register`、`/register-business`、`/forgot-password*` 為未登入（`lineLogin` callback 例外依原始碼列出）；`/line/account-link` 無身分限制。
- 元件 `guard` 不再含全站 Guard 前綴；報告列出修正前後平均 `guard` 長度。

### WP79　依身分拆分畫面、過濾共用外框、預覽依身分（RV-01、RV-02）

前提：R18-A 已回覆。

1. **同網址多身分**：路由元素（或其直接呼叫的畫面元件）在頂層以提前 `return` 或三元運算依條件回傳**不同的畫面元件**時，依條件拆成多個 SCREEN 變體，共用同一個網址層級節點（AGENTS §5 的 EntryPoint）。只回傳 `<Navigate>` 的分支不是畫面，記為該網址在此身分下的導向行為。同一元件在不同分支內的局部差異（例如按鈕顯示與否）**不**拆分，留給第 3 點過濾。
2. **變體 ID 與名稱**：變體 ID 由網址與該分支的條件原子決定（決定性，排序後雜湊）；名稱依 WP83 規則，並附上身分條件摘要（R18-C）。
3. **共用外框過濾**：畫面內每個元件與行為的 `guard`，與該畫面（或變體）的 `audience` 依 WP78 第 3 點可證明矛盾時，該元件在此畫面中標為「此身分下不顯示」：不列入畫面的元件清單、行為、API 呼叫與出口線，evidence 保留。只有一個身分可見的共用元件，其 API 也只歸到該身分的畫面。
4. **預覽依身分**：靜態預覽在 `either` 分支選擇時，先用畫面的 `audience` 判定條件真假；可判定者只畫成立的分支；無法判定者沿用既有規則（保留 fall-through）。
5. **報表**：畫布上同網址的變體並排並標示身分條件；左側搜尋以網址比對時列出全部變體。API 頁的呼叫來源依變體分組。不新增頁面或模式（R17-1）。

合成 fixture：
- 根路由依「未登入／管理者／其他」回傳 `PublicPage`、`AdminPage`、`<Navigate>`；驗證拆成 2 個畫面＋1 個導向。
- 共用 `Header` 依登入與角色顯示不同連結，掛在只允許一般使用者的路由下；驗證管理者連結與其 API 不出現在該畫面。
- 共用元件內的面板只在一般使用者分支呼叫 API；掛在只允許管理者的路由下時該 API 不歸屬該畫面。
- 單一身分的網址拆分前後 `screenId` 不變。

驗收（reservio 實測）：
- `/` 拆為「訪客」（`PublicHomePage`）與「已設定商家」（`OperationsOverviewPage`）兩個畫面，顧客分支為導向 `/dashboard`；訪客畫面的預覽為公開首頁，出口含 `/login`、`/register`、`/register-business`；商家畫面不再有這三條出口。
- `/notifications` 拆為顧客（`NotificationsPage`）與商家（`MerchantNotificationsPage`，商家工作區外框）；`/notifications/settings` 拆為顧客（`NotificationSettingsPage`）與商家（商家設定外框的通知設定）。
- `/business/setup` 預覽的 Navbar 為已登入商家狀態，不含「登入」「註冊」「立即預約」「我的預約」；該畫面的 API 不含 `/api/preferred-businesses`。
- `/settings/line-accounts` 不含 Navbar 的商家連結（`/business/info`、`/business/settings/integrations/line`）。
- 畫面總數＝修正前 33＋拆分新增數；報告逐一列出每個網址的變體與身分條件，並說明與預期（36）不同時的原因。

### WP80　登入後導向與外部登入往返（RV-04、RV-05）

1. **回傳路徑的函式**：`navigate(f(...).path)`、`navigate(f(...))`、`<Navigate to={f(...).path}>` 中，`f` 為專案內可解析的函式，且其每個 `return` 都是常值字串或以常值字串為 `path` 屬性的物件字面值時，目的地為所有常值的聯集（INFERRED）；每個目的地附上該 `return` 所在分支的條件（同 WP78 原子化）。有任一 `return` 無法解析（例如回傳外部傳入的 `returnTo`）時，該分支記為 UNRESOLVED 候選並在 evidence 說明，其餘常值照常列出。遞迴深度沿用分析器既有上限。
2. **依身分過濾目的地**：目的地條件與來源畫面或 Guard 的 `audience` 可證明矛盾者移除；其餘保留為多目的地，模擬操作時依 R17-5 讓使用者選擇。
3. **外部登入往返**：整頁導向（`window.location` 指派或 `<a href>`）到後端端點，且該端點的處理程式以 `sendRedirect`／`redirect:` 指向第三方登入，並由 Spring Security `successHandler` 導回前端路由時，建立「外部登入」流程：來源畫面 → 端點 → 回到的前端路由（含常值查詢參數）。後端導回路徑來自設定屬性且無法解析時，維持 UNRESOLVED 並記診斷，不猜測。

合成 fixture：
- `resolveDestination(user)` 依角色回傳三個常值路徑物件、另一分支回傳參數；登入頁 `navigate(resolveDestination(u).path)`。
- Guard 以同一函式導向；驗證導向目的地依該 Guard 的身分事實過濾。
- 整頁導向到 `/api/auth/sso` 的 Spring Boot fixture，`successHandler` 導回 `/login?sso=success`。

驗收（reservio 實測）：
- `/login` 的登入送出行為目的地為 `/force-change-password`、`/dashboard`、`/`（已設定商家變體）、`/business/setup`，`returnTo` 分支列為 UNRESOLVED 候選；`/force-change-password` 送出後的目的地依處理器自身條件（`!(!user || user.mustChangePassword)`）過濾，不含 `/force-change-password`。
- 「LINE 登入」按鈕顯示外部登入流程；`lineLogin` 回到 `/login` 的路徑若來自 `LineOAuth2Properties` 而無法解析，報告列出該診斷。
- 原本 UNRESOLVED 的 `navigate(destination.path …)` 行為數修正前後對照。

**WP78、WP79、WP80 完成後停止**，以 reservio 與 batch7 的 okta React 專案重新產生報表，報告附「原始碼基準 → 修正前 → 修正後」對照表與身分變體清單，等需求方驗收。

### WP81　分派表呼叫與處理器內的已知 prop（RV-06、RV-07）

1. **分派表**：呼叫 `obj[key] (...)`，`obj` 解析為物件字面值且 `key` 無法解析為常值時，視為呼叫該物件所有屬性值（INFERRED），evidence 記錄「分派表，key 未定」；`key` 可證明為常值或來自 `Object.keys(obj)`／`for…in obj` 迭代時，前者只呼叫該屬性、後者為全部屬性且可為 CONFIRMED（依迭代證明全部被呼叫）。屬性超過 20 個時不展開，記診斷 `REACT_DISPATCH_TABLE_TOO_LARGE`。
2. **處理器內的已知值**：事件處理器與載入效果的 `if`／三元運算／`&&`，其條件在呼叫端已證明為常值（路由傳入的字面 prop、`useState` 初始值不得視為常值）時，只走成立的分支，與渲染層規則一致。

合成 fixture：
- `const calls = {a: api.a, b: api.b}; Object.keys(calls).map(k => calls[k]())`；以及 `calls[selected]()` 中 `selected` 未定。
- 路由以 `editing={false}`／`editing` 渲染同一編輯頁，`save` 內 `if (editing)` 分別呼叫修改／新增 API。
- `useState(false)` 的狀態不得被當成常值修剪。

驗收（reservio 實測）：
- `/business/settings` 新增 RV-06 所列 5 個載入 API，且其他設定頁不因此新增 API。
- `/service/new` 只有 `POST /api/businesses/services`；`/service/:id/edit` 有 `GET /api/businesses/{businessId}/services` 與 `POST /api/businesses/services/{id}/modify`，沒有新增服務 API。

### WP82　端點比對與外部呼叫（RV-08、RV-09、RV-12）

前提：R18-B 已回覆（第 2 點）。

1. **字面路徑優先**：URL 為完全常值且與某個端點的字面路徑完全相符時，依 Spring `PathPattern` 特定性規則只對應該端點（CONFIRMED）；樣板端點不再列為候選。URL 含未定片段時維持既有 AMBIGUOUS 規則。evidence 記錄被排除的樣板與規則。
2. **外部呼叫端點**：Spring Security 設定中對某路徑 `permitAll` 且同時列於 CSRF `ignoringRequestMatchers`（或 XML 等價設定），而且分析範圍內沒有任何畫面呼叫時，該端點在 API 頁顯示 R18-B 決定的呈現；判斷依據列出兩處設定的檔案與行號。只有其中一項成立時不套用。不依路徑中是否含 `webhook` 等字樣判斷。
3. **Spring Boot 預設 context path**：Spring Boot 專案的設定檔（`application*.yml|yaml|properties`）存在且**全部**沒有 `server.servlet.context-path` 時，採用空字串，evidence 標「Spring Boot 預設值」，不再對每個 URL 產生 `CONTEXT_PATH_UNSPECIFIED`。非 Spring Boot 專案（傳統 WAR）規則不變。

合成 fixture：字面路徑與 `{var}` 樣板並存；`permitAll`＋CSRF 例外的端點與只有 `permitAll` 的端點；有／無 context-path 的 Boot 設定與傳統 web.xml 專案。

驗收（reservio 實測）：
- `GET /api/businesses/{category}` 只由 `/preferred-businesses`（及 WP79 後顧客可見的 Navbar 面板）呼叫；`/business/settings/profile`、`/register-business`、`/business/setup` 只呼叫 `GET /api/businesses/category`。
- LINE webhook 依 R18-B 呈現；`/api/dashboard`、`/api/reservations/today|week|month` 仍為「未被使用」。
- `CONTEXT_PATH_UNSPECIFIED` 由 59 降為 0。

**WP81、WP82 完成後停止**，等需求方驗收。

### WP83　預覽狀態、畫面元件與名稱（RV-10、RV-11）

1. **載入成功後的預覽狀態**（只影響靜態預覽，不影響 graph）：
   - 對畫面中每個被渲染的元件，收集其 `useState` 宣告的 `[值, setter]`。
   - 「載入函式」是指掛載時執行的 `useEffect` 回呼，以及它直接或間接呼叫的專案內函式（含 `useCallback` 定義者），深度沿用分析器既有上限。
   - 每個載入函式依原始碼順序模擬一次「成功路徑」：`try` 區塊執行到結束；`catch` 區塊略過；`finally` 在 `try` 之後執行。分析器已辨識為 API 請求的 `await` 呼叫，回傳示範回應：其任何屬性存取都是示範值，示範陣列的 `length` 為 1，`a || b` 取 `a`，`a?.b` 取示範值。條件無法求值的 `if (…) return` 或其他提前離開，視為沒有離開，繼續往下執行；條件無法求值、而且兩個分支都不會離開的 `if`／`else`，兩個分支內的 setter 都不套用。
   - `setX(運算式)` 把 X 設為該運算式的值（常值或示範值）；以函式形式更新的 `setX(prev => …)` 把 X 設為未知。
   - 模擬結束後：有被設定的狀態取最後一次設定的值；其餘狀態取 `useState` 的初始常值；初始值不是常值時為未知。
   - 預覽渲染時，以這些狀態值與畫面 audience 求值條件。可求值者只畫成立的分支；無法求值者沿用既有規則（三元運算保留 fall-through；`&&` 照畫）。
   - 不依變數或函式名稱判斷。
   - preview-model 每個 React 畫面新增 `previewState`：列出參與求值的每個狀態變數、模擬後的值，以及設定該值的來源（檔案:行號）。本輪不做狀態切換介面。
   - JSP、Struts、Spring MVC 畫面的預覽不變。
2. **畫面元件與名稱**：
   - React SCREEN 的 `view`、`viewSource` 改為「頁面元件」：從路由元素開始（變體則從該變體分支回傳的元素開始），依序略過以下三種元件：Guard（WP78 定義）、外框（輸出中把 `children` prop 或 `<Outlet/>` 原樣放入的元件）、純組合（輸出中沒有任何小寫 HTML 元素，而且略過 Guard 與外框後只剩唯一一個元件的元件）。第一個不屬於這三種的元件就是頁面元件。被略過的元件仍列在 `viewSources`。略過 Guard 或外框時，下一個要檢查的是傳給它的 children（JSX 子元素，或 children prop 的值；以 `<Outlet/>` 放入時為對應的子路由元素）；外框或 Guard 自己輸出的其他元件，一律不列入頁面元件候選。
   - JSX spread 屬性 `{...expr}`：`expr` 可求值為物件字面值時，其屬性視為 props；寫在 spread 之前的同名屬性被覆蓋，寫在之後的會覆蓋 spread 的值。
   - 畫面顯示名稱沿用 viewer 既有的 `screenNames` 規則，不修改；同名時由既有的消歧規則，依新的 `view` 加註區分。
   - SCREEN 節點的 ID 與 `name` 不得改變。
3. 合成 fixture 與驗收條件，見本階段的執行指令。

### WP84　樣式缺件診斷（RV-13）

1. 前端原始碼 `import` 的 `.css` 或樣式表連結指向套件路徑，而分析對象沒有對應的 `node_modules` 檔案時，記診斷 `STYLESHEET_PACKAGE_MISSING`（列出套件名稱與 import 位置，每個套件一則），並在報表畫面詳情顯示「此畫面的部分樣式來自未安裝的套件：<套件>」。
2. 不自動安裝、不下載套件、不連網（D6 與零網路請求維持）。ANALYST_GUIDE 說明可先在分析對象執行套件安裝再重新分析。

合成 fixture：import 套件 CSS 但沒有 `node_modules`；有 `node_modules` 時不出現診斷。

驗收：reservio 出現 `bootstrap`、`bootstrap-icons`、`flatpickr` 三則診斷；batch7 已有 `node_modules` 的專案不出現。

### WP85　重新實測與文件

1. 以 reservio 重新執行 §0.1 全部比對項，報告 `docs/reports/R18.md` 附「原始碼基準 → 修正前 → 修正後」三欄對照表，以及每個網址的身分變體、出口、API 清單。
2. 以 Chromium 1440×900 實際開啟 reservio 報表，檢查 `/` 兩個變體、`/notifications`、`/business/setup`、`/login`、`/business/settings`，記錄觀察（截圖留在 repo 外）。
3. 回歸：batch7 的 okta React 專案（含 `.jsx` 變體）、eMusicStore、PetClinic、Struts 8 個模組重新分析；JSP／Struts 專案 graph SHA-256 不變；okta 的變化逐項說明。
4. 更新 `docs/ARCHITECTURE.md` §4（`audience`、網址層級節點與畫面變體）、`docs/PRODUCT_SPEC.md` 的 React 支援描述、`docs/USER_GUIDE.md`（身分變體與預覽狀態切換）、`docs/ANALYST_GUIDE.md`（WP84）、`docs/REVIEW_STATE_CONTRACT.md` 與 `docs/REVIEW_MD_CONTRACT.md`（R18-A 的舊決策處理）、ROADMAP、ADR（編號接續 0095）。

**WP85 完成後停止**，等需求方最終驗收。

## 4. 測試與停止點

每次提交前執行 R14 §5 完整驗證（E2E 預設並行）：

```bash
mvn -B verify
npm --prefix screentrace-viewer run build
npm --prefix screentrace-viewer test
npm --prefix screentrace-js test
node --test screentrace-capture/*.test.mjs
node --test screentrace-viewer/test/*.e2e.mjs
```

基線以 R18 開始時的 `main`（`dbacc54`）實際數字為準，開工時記入報告；只增不減。`performance.e2e.mjs` 首次渲染不得退步超過 10%。

fixture 要求總表（每項至少一個正向與一個反向案例）：

| 工作包 | 正向 | 反向（不得誤判） |
|---|---|---|
| WP78 | 兩層 Guard、全站 Guard、`return null`／三元 `Navigate` 兩種寫法、三種矛盾規則 | 無法判定的條件不修剪；改用不同名稱的 Guard 與身分欄位結果相同 |
| WP79 | 同網址三分支拆分、共用外框連結與 API 過濾、預覽依身分 | 單一身分網址 `screenId` 不變；分支內局部差異不拆分 |
| WP80 | 常值路徑函式聯集、Guard 導向依身分過濾、外部登入往返 | 回傳參數的分支維持 UNRESOLVED；導回路徑來自未解析設定時不猜測 |
| WP81 | `Object.keys` 迭代分派表、key 未定分派表、字面 prop 修剪處理器分支 | `useState` 初始值不修剪；超過上限的分派表不展開 |
| WP82 | 字面路徑優先、`permitAll`＋CSRF 例外、Boot 預設 context path | 只有其中一項安全設定不套用；傳統 WAR 專案仍報 context path 診斷 |
| WP83 | 四態頁只畫一態、`<h1>` 命名、同元件不同 prop 命名 | 條件可同時成立的兄弟區塊全部保留；JSP 畫面名稱不變 |
| WP84 | 缺 `node_modules` 的套件 CSS 診斷 | 有 `node_modules` 時不出現 |

預先授權（同 R16 §3 格式）：
1. 因 WP78 移除重複 guard 前綴、WP79 拆分畫面、WP82 字面優先而改變的 **React fixture 數量型期望值**（畫面數、元件數、API 呼叫數、guard 字串、AMBIGUOUS 數、診斷數）可以修改；每處在 ADR 逐處記錄，並證明新期望在舊實作上失敗。
2. JSP／Struts／Spring MVC 的任何斷言、資料正確性、證據、安全隔離、決策保存鍵、md v1 位元組、API 狀態推導（D4／D5，R18-B 決定的附註除外）、決定性、零網路請求的斷言**一律不得修改**。
3. 無法歸入以上兩類者，寫入 OPEN_QUESTIONS（OQ-035 起）並停止該項。

停止點：WP80 後、WP82 後、WP85 後各停止一次，等需求方驗收；未經授權不得進入下一段。

## 5. 不要做的事

- 不依變數名稱、函式名稱、角色字串或路徑字樣推論身分、狀態或外部呼叫；只用條件結構與設定證據。
- 不執行 reservio 或任何目標專案的程式碼，不安裝其相依套件，不啟動瀏覽器爬取作為主要分析手段。
- 不把 INFERRED 升級為 CONFIRMED；不以 LLM 或文字相似度對應。
- 不把 reservio 原始碼、截圖或衍生資料加入 repo；不硬編碼 reservio 的路徑、元件名稱、Guard 名稱或角色值。
- 不新增報表頁面、模式或全域開關（R17-1）；報表仍須完全離線。
- 不分析 LINE 聊天機器人的對話流程（非網頁畫面）；`LineRichMenuService` 指向前端路由的連結列入 OPEN_QUESTIONS 作為後續候選，本輪不做。
