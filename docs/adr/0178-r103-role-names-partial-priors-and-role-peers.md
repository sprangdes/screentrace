# ADR 0178：R103 建議角色依建立帳號的畫面命名、部分可推的原狀態、落單畫面依角色歸組

## 背景

R102 之後 reservio 還有三處：自動建議的角色仍是程式值（BUSINESS、USER），前端沒有對照；LINE 對話的 `selectTime` 推不出原狀態，因為它另有一個不經狀態 `switch` 的呼叫端；功能地圖「其他」仍有 6 個畫面。

## 決定

- **列舉的 `.name()`**（`BackendCallChains`）：`Role.ROLE_USER.name()` 與靜態匯入的 `ROLE_ADMIN.name()` 寫入的就是該常數的名稱，視同寫入該列舉值；`.name()` 的對象不是常數時仍不列。
- **建議角色的名稱**（viewer `shared/persona-names.ts`）：只處理描述以「自動建議：依路由條件 」開頭的角色。取其唯一的 `X === "值"` 事實，找出「新建立」（`fromCreated`）且寫入該值的後端處理程式，再找呼叫這些 API 的畫面；每個畫面的 h1 都符合「建立／註冊／申請／新增／開設 ＋ 名稱 ＋ 帳號／帳戶／會員」且名稱只有一個、未被其他角色使用時，以該名稱命名，描述補上「名稱取自建立此角色帳號的畫面「…」」。有畫面標題不符、名稱不只一個或重複時維持原名。分析人員設定的角色不改名。報表內的畫面、功能分組與匯出 md 使用同一份命名結果；分析結果（graph）本身不變。
- **部分可推的原狀態**（`BackendCallChains.prior`）：私有方法沒有自身條件時，原本要求同類別內每個呼叫端都說得出狀態；改為有任一呼叫端說得出就列出這些狀態，並在有呼叫端說不出時加上 `fromPartial: true`。viewer 寫成「SELECTING_TIME，或其他推不出的狀態」，狀態轉換清單在該項加註「另有推不出原狀態的進入方式」。
- **落單畫面依角色歸組**（`features.ts`）：所有既有依據與 R93 兄弟畫面規則之後仍落單、且只有一個角色會用到的畫面，加入「同一角色的其他畫面」最多所在的功能（同票數依 key 排序）。只用角色而不用選單／網址前綴，避免訪客首頁併入商家側欄這類跨角色的歸組。曾考慮「最高依據落單時改用下一個依據」，但會把 `/reservation/pending/manage` 從同元件的「預約管理」拉到 `/reservation`，故不採用。

## 測試

- Java `R94PriorStateTest` 新增 2 個（`.name()` 寫入、所有呼叫端都說不出時不列）。
- viewer 新增 `r103-names-and-partial-priors.test`（3 個），`r86-menu-features.test` 新增 1 個。
- 修改的既有斷言：`R94PriorStateTest.r101APrivateStepDispatchedByAStateSwitchTakesTheCaseItRunsIn` 原本斷言 `date()` 另有 `switch` 外的呼叫端時沒有原狀態；依本 ADR 改為原狀態是 `DATING` 並標 `fromPartial`。三份 md golden 與 `wp40-md-decision-equivalence` 雜湊不變。

## 後果

- reservio（不設定角色）：自動建議的角色為「未登入」「商家」「客戶」。
- reservio 的 LINE 對話：`SELECTING_TIME → ENTERING_NAME／ENTERING_PHONE／CONFIRMING` 與 `CONFIRMING → COMPLETED／ENTERING_DATE` 出現在狀態轉換清單，附註另有推不出原狀態的進入方式。
- reservio 功能地圖「其他」由 6 個降為 3 個：`/*`（萬用轉址）、`/force-change-password`、`/line/account-link`，三者沒有可共用的依據，也不只屬於一個角色。訪客首頁歸入公開入口的選單、兩個「通知設定」各自歸入顧客與商家的選單。
