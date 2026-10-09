# ScreenTrace 第十四輪調整指示（R14：功能盤點工作台）

給 Codex 執行。執行前依 AGENTS.md §10 讀取 `AGENTS.md`、`docs/CODEX_INSTRUCTIONS.md`、`docs/REQUIREMENTS.md`、`docs/ROADMAP.md`、`docs/USER_GUIDE.md`、`docs/REVIEW_STATE_CONTRACT.md`、`docs/REVIEW_MD_CONTRACT.md`、`docs/OPEN_QUESTIONS.md`（OQ-013、OQ-020）、`docs/adr/0005-*`，以及 `docs/reports/R10.md`、`R11.md`、`R12.md`、`R13.md`。

REQUIREMENTS §1 原文與 §2 決策不得更動。R3–R13 的「不要做」與「停止條件」仍適用（不新增模式或全域開關）。本輪會修訂 OQ-013、OQ-020 的既有決定（§2），並取代 R10 WP37「確認儀表板」與「匯出前檢查」對話框的呈現方式。

設計稿（需求方已確認）：https://claude.ai/artifact/4Fye1iiMZM3YYHmdmVoTWt
共 6 張：盤點首頁、逐頁確認、按鈕總表、功能地圖、API、交付清單。設計稿是**版面與互動的目標**，不是逐像素規格；稿中數字取自 eMusicStore 實測，實作必須由分析資料計算，不得硬編碼（CODEX_INSTRUCTIONS §0.4）。

---

## 0. 需求方的情境與要求

> 我接手一個很舊、經過很多人手的系統，不清楚它有哪些功能，只知道有些功能已經沒在用。我要用 ScreenTrace 確認哪些功能保留、哪些移除。

需求方以 eMusicStore（`screentrace_target/eMusicStore_eCommerce_Website`）實際操作後的結論：分析能力足夠，但介面是「給工程師研究程式」的設計，不是「給需求方做盤點決定」的設計。本輪把報表改成**功能盤點工作台**。

需求方已確認的決定：

| 編號 | 決定 |
|---|---|
| R14-D1 | 報表以「盤點首頁」為進入點，依「可疑程度」引導需求方，而不是先看整張地圖。 |
| R14-D2 | 決策維持兩種明確狀態：**保留／移除**；沒有標記即「未決定」（即既有 UNDECIDED）。**不做**「要問人」狀態、詢問對象欄位、詢問信。 |
| R14-D3 | 每個決定可附**原因**（固定選項）與**備註**（自由文字），寫入 md。 |
| R14-D4 | **不做**主管簽核清單／PDF。交付只有 md（給 AI，也用來接續進度）。 |
| R14-D5 | **不做**「共用區塊一次決定」頁面。減輕標記量的方式是按鈕總表的「依名稱合併」與批次標記（WP48）。 |
| R14-D6 | 判斷依據（怎麼進到這頁、這頁去哪、呼叫哪些 API、移除的影響）必須在**做決定之前**就看得到，不能只在標了移除之後才出現。 |
| R14-D7 | 程式組出來的網址若格式符合某個路由，標為「推定」入口／呼叫來源（INFERRED），不得標為確定（CONFIRMED）。 |
| R14-D8 | 本輪**不做**存取紀錄（access log）匯入；設計稿首頁的「加入實際使用紀錄（選用）」卡片不實作、不放佔位按鈕。 |

## 1. 審查者已確認的現況（eMusicStore，Chromium 1440×900，2026-10-09）

### 1.1 分析誤判（會讓需求方刪錯東西，最優先）

以原始碼逐一對照：

| 報表現況 | 實際 | 原因與證據 |
|---|---|---|
| View Product Inventory、Edit Product、View Product 沒有任何畫面連入 | 列表頁每筆資料都有連結進入 | 迴圈內 `<spring:url value="/admin/productInventory/viewProductInventory/${product.productId}"/>` 等含 EL 的網址維持 UNRESOLVED（`productInventory.jsp:66`、`:71`，`productList.jsp:44`）；依 OQ-013 決定，EL 值不解析 |
| `ANY /admin/productInventory/deleteProduct/{productId}` 未被使用 | Product Inventory 的「Click to Remove Product from Inventory」呼叫 | 同上（`productInventory.jsp:76`） |
| `GET /rest/cart/{cartId}` 未被使用 | CART 畫面載入時呼叫 | `cart.jsp` 的 `ng-init="initCartId(...)"` → `controller.js:24` `initCartId` → `:10` `refreshCart` → `:11` `$http.get('/eMusicStore/rest/cart/'+$scope.cartId)`；JS 字串串接與 AngularJS scope 函式沒有連到端點 |
| `DELETE /rest/cart/{cartId}`、`PUT /rest/cart/add/{productId}`、`PUT /rest/cart/remove/{productId}` 被歸類為畫面網址（MVC_SCREEN） | 是 REST API，分別由 Clear Cart、Order Now、Remove 呼叫 | `CartController` 方法回傳 `void` 並標 `@ResponseStatus`，被當成畫面；呼叫在 `controller.js:19`、`:31`、`:38`，由 `cart.jsp`、`viewProduct.jsp` 的 `ng-click` 觸發 |
| Login 沒有任何畫面連入（看起來可疑） | 是 Spring Security 的登入頁，存取 `/admin/**` 未登入時自動導向 | `WEB-INF/applicationContext.xml:46–55` `<security:http>`、`login-page="/login"`、`intercept-url pattern="/admin/**"` |

修正後，此專案真正可疑的只有：畫面 `Using Angular`（`views/firstPage.html`，沒有網址也沒有入口），以及 `PUT /rest/cart/{cartId}`（`CartController.update()`，找不到呼叫來源）。

### 1.2 介面問題

| # | 問題 |
|---|---|
| U1 | 需決定 129 項（11 畫面＋118 按鈕），其中約 90 項是 `templates/header.jsp`（6 個）與 `footer.jsp`（3 個）在 10 個畫面重複。按鈕總表只合併「目的地已解析」的全站導覽，仍有 94 列；確認儀表板 129 項逐條列出。 |
| U2 | 系統已能算出入口數，但「未連結的畫面」只是地圖右側小標，在 1440 寬時被右側資訊欄遮住一半；關閉全站導覽時首頁 Welcome 也被放在「未連結的畫面」欄下。 |
| U3 | 「沒有已知的導向來源」只在標記移除**之後**才出現在右欄最下方（`main.ts` `decisionImpact`）。 |
| U4 | 用語過於技術：「有圖支持的行為 3 個；無法確認 7 個：沒有已知的行為 6、已記錄行為但無法確認結果 1（目的未解析 1）」、`ANY`、`REDIRECT`。 |
| U5 | 名稱不一致：介面顯示 `Using Angular`，匯出前檢查顯示 `firstPage.html`；`View Product Inventory` 顯示為 `viewProductInventory`。 |
| U6 | 三欄（左清單、地圖、右資訊）同時存在，未選取時右欄整欄空白；確認儀表板塞在左欄窄條中與畫面清單混在一起。 |
| U7 | 頂部「按鈕」「API」分頁偶發第一次點擊無反應，或分頁高亮與實際內容不一致。 |
| U8 | 功能區域：eMusicStore 全部 11 個畫面落在同一區「首頁與其他」。原因是 OQ-020 規則「單畫面區域數最少者勝」，所有 JSP 都在同一目錄時「JSP 目錄」依據只有 1 區、單畫面區域為 0，因而勝出。 |
| U9 | 決定沒有原因或備註欄位，md 無法帶上判斷依據。 |

## 2. 對既有決定的修訂（需求方授權）

### 2.1 OQ-013 修訂：含 EL 的網址樣板「推定」對應

OQ-013 原決定「EL 值保持 UNRESOLVED」**維持**——既有 UrlResolution 結果、`targetStatus`、`UrlVariableBoundaryTest` 等斷言一律不改。本輪**另外新增**一層「路由樣板推定對應」：

1. 對象：`spring:url`／`c:url`／`<a href>`／`<form action>` 的原始網址樣板，以及 JS 中由「字串常值前綴 ＋ 運算式」組成的網址（WP44-2）。
2. 正規化：去掉已證明的 context path（只用 UrlResolution 白名單採用值；JS 中以字串常值開頭且等於任一 context path 候選者亦可去除，候選需記入證據）；每個 `${...}` 或非常值運算式片段視為**一個路徑段**的萬用字元；查詢字串忽略。
3. 比對：與全部路由樣板（`{var}` 為單段萬用字元）逐段比對，HTTP 方法相容（JSP 連結＝GET 或 ANY；JS `$http.get/put/delete/post` 取對應方法）。
4. 結果：**恰好一個**相容路由 → 新增 confidence=`INFERRED` 的關係（導覽為 `NAVIGATES_TO`，API 為 `TRIGGERS`／`CALLS`，沿用現有邊類型），evidence 含原始樣板、正規化後樣板、比對到的路由、來源檔與行號、parser 名稱；**兩個以上** → AMBIGUOUS，保留全部候選，不建邊；**零個** → 維持 UNRESOLVED。
5. 不得把推定結果寫回 UrlResolution 或改成 CONFIRMED。

### 2.2 OQ-020 修訂：功能區域依據的選擇

在既有規則前加一條：**產生區域數為 1 的依據不得成為預設**，除非三種依據都只產生 1 區。其餘（單畫面區域數最少、平手順序網址前段→控制器→JSP 目錄、介面可切換並標明依據）不變。以 eMusicStore 與 PetClinic 實測並記入報告。

### 2.3 API 狀態推導（R-API）

R-API-1～6 文字不變。WP44 新增的 INFERRED 關係**是**呼叫來源（R-API-1），因此會讓部分 API 由 UNREFERENCED 變為 IN_USE。Java `ApiUsage` 與 TypeScript `deriveApiUsage` 必須同步，並在 `docs/examples/api-usage-vectors.json` 新增「只有 INFERRED 來源」「CONFIRMED＋INFERRED 混合」「INFERRED 來源全被移除→REMOVABLE」三組向量（ADR 0034 規則）。介面另外顯示「推定使用中」（全部來源都是 INFERRED 的 IN_USE），md 狀態列舉不變。

### 2.4 預先授權的斷言修改（同 R4 §0）

只可修改**直接鎖定被取代的版面或流程**的斷言：三欄版面、左側欄、確認儀表板位置與內容、匯出前檢查對話框、首次引導步驟文字、全站導覽合併規則、功能區域預設依據（僅 §2.2 影響者），以及因 WP44 新增 INFERRED 關係而改變的「API 狀態／入口數量」fixture 期望值。鎖定資料正確性、安全、決策鍵、md v1／v2 往返與 golden、決定性、模擬規則、零網路、零 script 執行的斷言一律不得修改。每處在 ADR 逐處記錄（測試名稱、舊預期、新預期、原因），並證明新斷言在舊實作上失敗。無法歸類者寫入 OPEN_QUESTIONS 並停止該項。

## 3. 硬性原則

1. 決策資料鍵不變：畫面一鍵；元件以（畫面, 元件）為鍵；「合併列」標記時逐一寫入每個（畫面, 元件），不新增合併鍵。
2. 沒有原因或備註的決策，匯出的 md 必須與本輪前**逐位元組相同**（以既有 v1／v2 golden 鎖定）。
3. 單一 HTML、離線、決定性、不含本機路徑；報表大小增幅 ≤ 5%（以 eMusicStore 與 PetClinic 量測）。
4. 需求原文的功能必須仍可到達：Screen Map（畫布、關聯線 hover 顯示 URL 與縮圖、點擊關聯線前往、聚焦畫面時右側列出 API 與按鈕）、檔案結構、以實際 URL 搜尋、API 頁、元素樣式、模擬操作、元件庫對應。可以搬位置，不能消失。
5. 所有分類由**單一決定性純函式**計算並有單元測試；介面只呈現結果。
6. 名稱一致：任何地方顯示畫面都用同一個 `humanizeName` 結果（WP42 規則）；技術名稱（檔名、類別名、方法）只出現在「技術細節」或等寬字的次要行。
7. 觸控裝置可完成所有操作；所有控制項可用鍵盤到達；顏色之外另有文字或圖示區分狀態。

## 4. 工作包

順序固定：**WP44 → 停止驗收 → WP45、WP46、WP47 → 停止驗收 → WP48、WP49、WP50 → 停止驗收**。每個工作包獨立提交；先提交失敗測試，再實作。

### WP44　分析端補強（§1.1 的五項誤判）

1. **含 EL 網址的路由樣板推定**：依 §2.1 實作於 JSP 連結／表單。fixture 需含：迴圈內 `spring:url` 帶 `${x.id}`（唯一命中→INFERRED）、兩個路由都相容（→AMBIGUOUS）、無相容路由（→UNRESOLVED）、`c:url` 同情境（推定層同樣適用；UrlResolution 結果不變）。
2. **JS 網址串接**：在既有 Acorn AST 分析中，`'常值' + 運算式`（含多段串接與 template literal）作為網址參數傳入 `$http.get/post/put/delete`、`$http({method,url})`、`fetch`、`$.ajax/$.get/$.post` 時，依 §2.1 比對。不執行 JS。
3. **AngularJS 事件鏈**：`ng-click`／`ng-submit`／`ng-init` 呼叫的 `$scope.fn(...)`，追蹤到同一 `controller(...)` 內 `$scope.fn = function` 的定義與其中的網址呼叫（含 `$scope.a` 呼叫 `$scope.b` 的一層以上鏈結，需設深度上限並在診斷中記錄截斷）。`ng-init` 視為畫面載入時呼叫（R-API-1(a)）。控制器綁定以 `ng-controller` 名稱對應；對應不到 → UNRESOLVED 並記診斷。
4. **端點分類**：回傳 `void` 且標 `@ResponseStatus`、或方法／類別標 `@ResponseBody`／`@RestController`、或回傳 `ResponseEntity` 的 handler，歸類為 `REST_API`，不是 `MVC_SCREEN`。修正需涵蓋 Spring MVC 與 Spring Boot fixture。
5. **自動導向畫面**：解析 Spring Security XML（`<security:http>`／`<http>` 的 `form-login login-page`、`access-denied-page`）與 Java Config（`.formLogin().loginPage("...")`、`.exceptionHandling().accessDeniedPage("...")`）的常值。被指向的畫面加屬性 `autoRedirect`（值為 `LOGIN_PAGE`／`ACCESS_DENIED`），evidence 含設定檔與行號；受保護的 `intercept-url`／`requestMatchers` 樣式一併記入 evidence。非常值 → 不加屬性並記診斷。若需 schema 變更，更新 schema 與 ARCHITECTURE 文件（schema 版本規則依 CODEX_INSTRUCTIONS）。

驗收：
- 以 eMusicStore 唯讀重新分析：View Product Inventory、Edit Product、View Product 各有一個 INFERRED 入口（來源如 §1.1）；deleteProduct 與 4 支 `/rest/cart` 端點（GET／DELETE／PUT add／PUT remove）各有 INFERRED 呼叫來源；`PUT /rest/cart/{cartId}` 仍為 UNREFERENCED；Login 帶 `autoRedirect=LOGIN_PAGE`；`/rest/cart` 5 支端點分類為 REST_API。
- PetClinic 重新分析結果的差異逐項列入報告並說明原因（預期 ownersList 等迴圈連結會出現 INFERRED）。
- 每項都有獨立 fixture 測試（含正向、AMBIGUOUS、UNRESOLVED、截斷），符合 AGENTS.md §9。
- `docs/reports/R14.md` 記錄 WP44 前後兩專案的入口數、API 狀態分布與差異表。
- **WP44 完成後停止**，等需求方驗收分析結果。

### WP45　資訊架構、導覽列與盤點首頁

1. **頂部列**：品牌與專案名｜主分頁 `盤點首頁`、`逐頁確認`、`按鈕總表`、`功能地圖`、`API`、`交付清單`｜全域搜尋（沿用 `Ctrl／⌘＋K`，可搜畫面名、URL、按鈕、API）｜`交付清單 · 已決定 N / 總數`。「⋯」選單保留匯入 md、分析資訊、說明、重新開啟引導。
2. **移除三欄常駐版面**：沒有選取物件時不顯示空白右欄；左側清單只在需要的分頁出現（逐頁確認的佇列、功能地圖的檔案結構）。
3. **分頁切換可靠**：任何主分頁第一次點擊即切換，`aria-current` 與內容同步；E2E 以連續點擊 6 個分頁各 3 輪鎖定（修正 U7，若根因在 R13 轉場則一併修正，但不得移除 R13 行為）。
4. **入口分類純函式** `classifyScreenEntry(graph)`，每個畫面恰好一類：
   - `AUTO_REDIRECT`：有 `autoRedirect` 屬性。
   - `NO_ENTRY`：沒有可對應路由，且沒有任何（CONFIRMED 或 INFERRED）來自其他畫面的入口。
   - `ROUTE_ONLY`：有路由，但沒有任何來自其他畫面的入口。
   - `INFERRED_ENTRY`：有入口，且全部入口都是 INFERRED。
   - `HAS_ENTRY`：至少一個 CONFIRMED 入口。
   入口計算包含全站導覽（頁首連結算入口）；同一畫面自己連自己不算。輸出含入口清單（來源畫面、元件、信心、證據），供 WP46 使用。
5. **盤點首頁**（預設進入頁，版面依設計稿第 1 張）：
   - 開頭：分析日期、畫面／API／按鈕數；標題「這個系統有哪些功能還在用？」；一句說明總決定數；右側決定進度（保留／移除數、進度條、「決定存在這台電腦，換電腦前請到交付清單匯出」）。
   - 三步驟：看可疑清單 → 逐頁決定 → 交付清單。
   - 「可能已經沒在用」卡片，依序：`完全找不到入口`（NO_ENTRY，標「最可疑」）、`找不到呼叫來源的 API`（UNREFERENCED，標「最可疑」）、`有網址，但沒有連結進入`（ROUTE_ONLY，標「要查證」）、`入口是推定的`（INFERRED_ENTRY 畫面＋全部來源為 INFERRED 的 API，標「大概還在用」）、`系統自動導向`（AUTO_REDIRECT，標「不列入可疑」，顯示設定檔與行號）。數量為 0 的卡片不顯示；全部為 0 時顯示「沒有找到明顯可疑的項目」。每列可點擊進入逐頁確認或 API 頁對應項目。
   - 「依功能區域」卡片：區域名、依據、畫面數、各分類數、已決定進度；點擊進功能地圖並篩選該區域。
   - 「ScreenTrace 看不到的事」固定說明：書籤或 Email 連結直接進入、排程／批次／其他系統呼叫的 API、比對不到網址格式的程式組成連結。
6. **功能區域**：依 §2.2 修訂預設依據。
7. **首次引導**：改為 3 步，對應首頁三步驟；R8 引導的暫存行為不變。
8. 取代：R10 WP37 確認儀表板的內容由首頁（進度、區域）與交付清單（WP49）承接；`n` 鍵「下一個未決定」保留。

驗收：純函式單元測試涵蓋 5 類與邊界（自連、只有全站導覽入口、INFERRED＋CONFIRMED 混合、無路由但有入口）；eMusicStore 首頁卡片內容與 §1.1 修正後結果一致（Using Angular、PUT /rest/cart/{cartId}、3 個推定畫面＋5 個推定 API、Login 自動導向）；分頁切換 E2E；1024／768／390px 無整頁水平捲動。

### WP46　逐頁確認工作區

版面依設計稿第 2 張：左佇列｜中畫面｜右「判斷依據＋你的決定」。

1. **佇列**：依可疑程度分組（最可疑 → 有網址沒連結 → 入口是推定的 → 系統自動導向 → 有入口），組內依入口數、名稱排序；可切換「依功能區域」「只看未決定」。每列顯示名稱與狀態（未決定／保留／移除）；有入口者顯示「入口 N」。目前項目高亮並 `aria-current`。
2. **中間**：標題列顯示區域、第 i / 總數、畫面名稱、URL（等寬字）、上一個／下一個。下方是**既有完整畫面檢視器**（模擬操作、R13 轉場、Alt 點擊選取、縮放），不是靜態截圖；保留「示意畫面：資料為範例值」提示。
3. **這頁的按鈕**：列出此畫面全部可標記元件，每列：名稱、白話行為（「回到 Product Inventory 畫面」「呼叫 deleteProduct API（推定）」「目的地無法確定」）、目前狀態、`保留`／`移除`。未標記者顯示「跟著畫面：保留／移除／跟著畫面」（沿用 `effectiveComponent` 與「隨畫面移除」規則）。**來源檔為 `INCLUDES` 引入的 `TEMPLATE_FRAGMENT`**（如 header.jsp、footer.jsp）的元件，收在可展開的「頁首、頁尾的按鈕 · N 個」群組；群組名稱取片段檔名人性化，不猜測用途。標題列顯示「已標記 N / 總數」。點列時在預覽中高亮該元件（沿用既有行為）。
4. **判斷依據**（永遠顯示，不需先標記，修正 U3）：
   - 怎麼進到這一頁：有無網址；確定入口清單；推定入口清單（來源畫面、按鈕、原始樣板、檔案與行號）；自動導向依據；沒有入口時明說。
   - 從這一頁可以去：目的畫面清單（可點擊前往）。
   - 呼叫的 API：方法＋路徑，點擊前往 API 頁該項。
   - 如果移除：會失去連結的其他畫面／按鈕、因此變為可移除的 API、既有衝突（沿用 `decisionImpact` 的計算，改為不論決策都顯示「假設移除」的結果）。
   - 技術細節（預設收合）：來源檔、handler、診斷、信心徽章；以及「樣式」與「元件庫對應」（WP9 覆寫功能，僅 KEEP 畫面可用，沿用既有規則）。
5. **你的決定**：`保留`／`移除` 兩個大按鈕（`radiogroup`，再按一次取消＝未決定）；選定後顯示原因下拉（WP47）；備註文字框；`儲存，看下一個`（前往佇列下一個未決定畫面）。快捷鍵 `k` 保留、`x` 移除、`u` 取消、`n` 下一個未決定（輸入欄位內不觸發）。
6. 用語白話化（修正 U4）：覆蓋率改為「這頁有 N 個按鈕：M 個知道會做什麼、K 個不確定」；`ANY` 顯示為「任何方法」並保留原值於 tooltip；`REDIRECT` 顯示「轉址」。舊文字移入技術細節。

驗收：E2E 驗證判斷依據在 UNDECIDED 時即可見；佇列分組與順序；按鈕逐一標記與「跟著畫面」顯示；片段群組只收 INCLUDES 來源；快捷鍵；儲存並前往下一個未決定；模擬操作與 R13 轉場既有測試全數通過；觸控長按選取。

### WP47　決策原因與備註（資料與 md）

1. **原因代碼**（固定，可測試常數）：
   - 移除：`DISCONTINUED`（業務單位確認已停用）、`REPLACED`（功能已被其他畫面取代）、`DEV_ONLY`（開發測試用頁面）、`OTHER`（其他，請在備註說明）。
   - 保留：`IN_USE`（仍在使用）、`COMPLIANCE`（法規或稽核需要保留）、`OTHER`。
   決策改變時，若原因不屬於新決策的選項則清除原因（備註保留）。決策改為未決定時，原因與備註都保留但不輸出（重新決定時恢復）。
2. **ReviewState**：新增選用欄位 `decisionNotes`：`{ screens: Record<screenId, Note>; components: Record<screenId, Record<componentId, Note>> }`，`Note = { reason?: ReasonCode; note?: string }`。`note` 上限 1,000 個 Unicode code point（超過時輸入框阻擋並提示）；控制字元在輸入時移除。localStorage 鍵與既有規則相同；舊資料沒有此欄位照常載入。
3. **md**：
   - 有任何非空原因或備註 → 附錄 `format_version: 3`，新增必要鍵 `decision_notes`（結構同上；v3 也必須含 v2 的兩個覆寫鍵，可為空）。都沒有 → 維持 1 或 2，位元組不變。
   - 正文 §3 畫面小節與元件表新增「原因」「備註」欄：原因顯示中文標籤＋代碼；備註視為**不可信使用者文字**，套用與專案文字相同的正文隔離（code span、可見化控制／隱形字元、300 上限加截斷標記指向附錄）。
   - CODEX_INSTRUCTIONS §8.2 固定文字不變。
   - 匯入：v3 驗證規則比照 v2（未知鍵拒絕、型別、原因代碼必須屬於對應決策、長度上限、`state_sha256` 涵蓋 `decision_notes`）；v1／v2 匯入結果 `decisionNotes` 為空。
   - 更新 `REVIEW_STATE_CONTRACT.md`、`REVIEW_MD_CONTRACT.md`，新增 v3 golden，並保留 v1／v2 golden 不變。
4. 合併列批次標記（WP48）可一次套用原因，但備註不批次寫入。

驗收：單元測試涵蓋原因代碼與決策對應、決策切換時清除規則、v1／v2 golden 位元組不變、v3 往返（generated_at 除外位元組相同）、備註含反引號／控制字元／雙向字元／超長時的正文隔離、v3 拒絕案例；三引擎（Chromium／Firefox／WebKit）md 往返沿用既有矩陣。
**WP45–WP47 完成後停止**，等需求方驗收。

### WP48　按鈕總表：依名稱合併與批次標記

版面依設計稿第 3 張。

1. **合併規則**（純函式）：分組鍵＝（顯示名稱, 行為簽章）。行為簽章＝元件類型＋已解析目的（畫面 ID／端點 ID 排序集合）；目的未解析者以「原始網址樣板正規化結果」為簽章；沒有任何行為者以「無行為」為簽章。
   - 同名且簽章相同 → 一列「名稱 · 出現在 N 個畫面」，標記時逐一寫入每個（畫面, 元件）。
   - 同名但簽章不同 → 一列「名稱 · N 個畫面 · 行為不同」，不能直接標記，必須展開逐列決定。
   - 不同名稱不合併。
   - 取代既有「只合併已解析全站導覽」的規則（§2.4 授權）。
2. 預設「依按鈕名稱合併」開啟；可關閉回到逐畫面逐列（既有 118 列）。標題顯示「118 個按鈕 → N 列」。
3. 篩選：文字、區域、狀態（全部／未決定／保留／移除／隨畫面移除）、會做什麼（換頁／呼叫 API／目的地無法確定／不會換頁）。
4. 勾選多列後出現批次列：「已選 N 列，共 M 個按鈕」、全部標為保留、全部標為移除（可選原因）、取消選取。行為不同的列不可勾選。
5. 合併列內各畫面決策不一致時，狀態顯示「部分保留／部分移除」，並提示展開。
6. 每列可點「查看」跳到逐頁確認並高亮該元件。

驗收：合併純函式測試（eMusicStore 依審查者手算為 118 → 27 列，實際結果不符時逐列列出差異並說明原因，不得為了吻合而調整規則；Submit 與 Click to get Product Details 為「行為不同」；Home／Products 等全站導覽各合併為 10 個畫面一列）；批次寫入的鍵與逐一標記結果完全相同；關閉合併的列數；部分決策顯示。

### WP49　功能地圖、API 頁與交付清單

**功能地圖**（設計稿第 4 張）：
1. 保留既有畫布、平移縮放、聚焦、關聯線 hover（URL＋縮圖）與點擊前往、聚焦時右側資訊（API 與按鈕）——需求原文功能不得移除。
2. 版面改為**依功能區域分欄的泳道**：每欄一區，欄內依既有決定性分層由上而下排列；跨區關聯線照畫。全站導覽連線預設隱藏（既有開關保留）。
3. 卡片顯示：名稱、URL、入口數；外框表示分類：推定入口＝藍色點線、找不到入口＝紅色虛線、自動導向＝一般外框加「系統自動導向」文字；已決定者顯示保留／移除色條與圖示（R11 WP40 規則）。圖例固定顯示。
4. NO_ENTRY、ROUTE_ONLY 畫面放在所屬區域欄底部並加小標題；不再使用全域「未連結的畫面」欄（修正 U2）。
5. 「檔案結構」與「依 URL 搜尋」移到地圖頁左側可收合面板（需求原文功能）。
6. 右側資訊欄只在聚焦畫面時出現，並提供「到逐頁確認」按鈕。

**API 頁**（設計稿第 5 張）：
1. 分頁「API」與「畫面網址」（依 WP44 分類）。
2. 狀態篩選：全部／使用中／推定使用中／找不到呼叫來源／可移除（可移除依需求方決策即時變化）。
3. 左清單（方法、路徑、狀態徽章）＋右詳細：狀態白話說明、handler、呼叫來源（畫面「按鈕」或「畫面載入時」、確定／推定、證據檔案與行號；點擊回逐頁確認並高亮元件）、契約欄位（既有）、固定的狀態規則說明（R-API-2／R-API-5 白話）。
4. UNREFERENCED 顯示「找不到呼叫來源」，並保留 R-API-6 說明（排程或其他系統呼叫看不到）。

**交付清單**（設計稿第 6 張，取代匯出前檢查對話框）：
1. 頂部統計：移除、保留、未決定三格。
2. 「確定移除」表：項目（名稱＋所在畫面或檔案）、原因、備註、一併影響（因此變為可移除的 API、失去連結的畫面；依既有推導）。
3. 「保留」可展開列表（含原因）。
4. 交付前提醒：未決定數（點擊回逐頁確認第一個未決定）、衝突清單（沿用 conflicts）、`5 MB` 警告（既有）。
5. 下載區只有：`給 AI 的指示檔（md）`（主要按鈕，既有匯出）、`開啟先前匯出的 md`（既有匯入，說明「換電腦或交接時用來接續進度」）。**不做** PDF／簽核清單／詢問信。
6. 所有名稱用 `humanizeName`（修正 U5）。

驗收：地圖 E2E 驗證關聯線 hover／點擊、聚焦右欄、泳道分欄數等於區域數、NO_ENTRY 畫面在所屬欄內可見且未被遮擋（1440／1024 寬）；API 篩選計數與 `deriveApiUsage` 一致；交付清單統計與 md 匯出統計一致；匯出、匯入既有測試全數通過。

### WP50　文件、截圖與報告

1. 更新 `docs/USER_GUIDE.md`：以「盤點流程」重寫章節順序（首頁 → 逐頁確認 → 按鈕總表 → 地圖 → API → 交付清單），刪除確認儀表板與匯出前檢查的舊敘述；詞彙表新增「推定入口」「找不到呼叫來源」「系統自動導向」「跟著畫面」。
2. 指南截圖重新產生，維持逐位元組決定性（連續三次 SHA-256 清單相同）；截圖仍只用合成 fixture，不使用 eMusicStore／PetClinic 畫面。
3. `docs/ROADMAP.md` 新增 R14 列；`docs/reports/R14.md` 記錄每個工作包的實測數據（含 eMusicStore／PetClinic 前後對照、報表大小、效能）。
4. ADR：WP44 分析規則、§2.1／§2.2 修訂、WP47 md v3、§2.4 斷言修改清單，各自一份（編號自 0067 起）。

## 5. 測試與停止點

提交前執行完整驗證（指令同 R13 §5；E2E 以預設並行執行，不得改為序列執行規避）：

```bash
mvn -B verify
npm --prefix screentrace-viewer run build
npm --prefix screentrace-viewer test
npm --prefix screentrace-js test
node --test screentrace-capture/*.test.mjs
node --test screentrace-viewer/test/*.e2e.mjs
```

基線以 R13 結束時為準（284 Java、40 JS、108 viewer、43 capture、130 E2E），只增不減（§2.4 授權修改者除外）。`performance.e2e.mjs` 首次渲染不得退步超過 10%。

停止點：WP44 後、WP47 後、WP50 後各停止一次，等需求方驗收；未經授權不得進入下一段。

## 6. 不要做的事

- 不做「要問人」狀態、詢問對象、詢問信（R14-D2）。
- 不做主管簽核清單、PDF 或其他新匯出格式（R14-D4）。
- 不做「共用區塊一次決定」頁面或新的合併決策鍵（R14-D5）。
- 不做存取紀錄匯入或任何執行期資料（R14-D8）。
- 不把 INFERRED 升級為 CONFIRMED，不修改既有 UrlResolution 結果；不以文字相似度、DOM 順序或 LLM 猜測對應。
- 不硬編碼 eMusicStore／PetClinic 的路徑、類別名或畫面名；兩專案只作為唯讀驗證對象。
- 不新增模式或全域開關；不新增外部相依或網路資源。
- 不修改被分析的目標專案。

---

## 7. WP44 驗收回覆（需求方，2026-10-09）

**結論：部分通過，需補正後再驗收。** 不得進入 WP45。

已通過：Spring Security 自動導向（Login `autoRedirect=LOGIN_PAGE`）、`/rest/cart` 5 支端點改為 REST_API、三個畫面的 INFERRED 入口、沒有猜測 context path、沒有修改既有斷言、報表大小在門檻內。

### 7.1 需求方提供的 context path

eMusicStore 的部署 context path 為 `/eMusicStore`（需求方提供）。以 **workspace 設定**提供，不得寫進程式或 fixture：

```json
"contextPaths": { "<eMusicStore 專案的實際路徑>": ["/eMusicStore"] }
```

審查者以暫存 `user.home` 套用此設定實測（commit 5d1e752）：`GET`／`DELETE /rest/cart/{cartId}`、`PUT /rest/cart/add/{productId}`、`PUT /rest/cart/remove/{productId}` 皆變為 IN_USE，`PUT /rest/cart/{cartId}` 維持 UNREFERENCED，符合預期。R14 報告須補上「有設定」與「無設定」兩組結果。

### 7.2 必須補正

**A1　推定的 JSP 連結沒有成為端點的呼叫來源。** 實測（有、無 context path 皆同）下列端點仍為 UNREFERENCED，但畫面上都有連結指向它們：

| 端點 | 實際呼叫來源 |
|---|---|
| `ANY /admin/productInventory/editProduct/{productId}` | Product Inventory「Click to Edit Product from Inventory」（`productInventory.jsp:71`） |
| `ANY /admin/productInventory/viewProductInventory/{productId}` | Product Inventory「Click to get Product Details」（`:66`） |
| `ANY /admin/productInventory/deleteProduct/{productId}` | Product Inventory「Click to Remove Product from Inventory」（`:76`） |
| `ANY /productList/viewProduct/{productId}` | All Products「Click to get Product Details」（`productList.jsp:44`） |

原因：§2.1 的推定只建立元件 → 畫面的 `NAVIGATES_TO`，沒有建立元件 → 端點的關係。確定（CONFIRMED）的連結會同時產生兩者（例如 `/admin` 有 10 個呼叫來源）。§2.1 第 4 點的本意是：**推定連結產生的關係集合，必須與同一個連結若為確定時產生的關係集合相同，只是 confidence 為 INFERRED。** 「deleteProduct 是一般 MVC handler 的導向」不影響這點，它仍然是被這個按鈕呼叫的端點。
驗收：上表 4 支端點都是 IN_USE，且全部來源為 INFERRED（介面顯示「推定使用中」）；deleteProduct 的元件同時保有導向 Product Inventory 的 INFERRED `NAVIGATES_TO`。

**A2　JS 請求描述捏造了路徑段。** 無 context path 設定時，圖中出現 `PUT /eMusicStore/rest/cart/add/null`、`PUT /eMusicStore/rest/cart/remove/null`：`addToCart(productId)` 的參數 `productId` 無法靜態取得值，卻被寫成字面 `null`。這違反 CODEX_INSTRUCTIONS §0.4「不得捏造」。同時 `{$scope.cartId}` 把運算式原文放進路徑。
補正：無法靜態取得值的段一律以固定佔位符 `{?}` 表示（例如 `/eMusicStore/rest/cart/add/{?}`），原始運算式只放 evidence；比對路由樣板時 `{?}` 視為單段萬用字元。同步修正 ADR 0010 描述與 JS 測試（新增「函式參數作為路徑段」「`$scope` 屬性作為路徑段」兩例）。

**A3　context path 提示（診斷，不自動套用）。** 當未解析的 JSP／JS 網址「去掉第一段後」能唯一比對到既有路由，且這樣的呼叫 ≥ 1 個時，輸出一則診斷 `CONTEXT_PATH_HINT`：列出候選前綴（例如 `/eMusicStore`）、可解析的呼叫數、各呼叫的來源檔與行號，並說明設定方式（`./bin/screentrace config`）。**不得**依此提示自動套用前綴或改變任何關係。顯示在報表「分析資訊」，並在 CLI 分析完成摘要中以一行提示。
驗收：eMusicStore 無設定時出現此診斷，數量為 4；設定後不出現；PetClinic 不出現。

### 7.3 寫入 OPEN_QUESTIONS，不要自行實作

**OQ-021　只經由轉址到達的路由。** `GET /cart/{cartId}` 只由 `ANY /cart/`（`CartItemController.get()`）轉址到達，`/cart/` 的呼叫來源是 View Product「View cart」，但 `/cart/{cartId}` 在 R-API 下沒有呼叫來源，會顯示為「找不到呼叫來源」。請列出可選方案（例如：轉址目的地以 INFERRED 繼承轉址來源的呼叫來源；或維持現狀、只在介面標示「由轉址到達」），以及對 R-API 雙端向量的影響，等需求方決定。

### 7.4 併入後續工作包的要求

- **WP49（API 頁）**：`origin=javascript-request` 且 `backendStatus=UNRESOLVED` 的前端請求描述，不得與後端 API 混在同一清單或計入 API 總數。另列一區「沒有對應到後端的呼叫」，顯示方法、網址（含 `{?}`）、呼叫來源，並在有 `CONTEXT_PATH_HINT` 時提示設定。
- **WP49（API 頁「畫面網址」分頁）**：渲染 `AUTO_REDIRECT` 畫面的路由（如 `/login`）顯示「系統自動導向」，不顯示「找不到呼叫來源」。
- **WP45（盤點首頁）**：有 `CONTEXT_PATH_HINT` 時，在「可能已經沒在用」上方顯示提醒：「有 N 個呼叫因為網址前綴無法確認，相關 API 可能被誤列為找不到呼叫來源，請分析人員設定 context path 後重新分析。」

### 7.5 補正完成後

重新跑 §5 完整驗證；在 R14 報告列出補正前後 eMusicStore（有／無 context path）與 PetClinic 的 API 狀態逐項對照表；然後停止，等需求方再次驗收 WP44。
