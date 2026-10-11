# ScreenTrace 第三輪調整指示（R3）

給 Codex 執行。執行前依 AGENTS.md §10 讀取 `AGENTS.md`、`docs/CODEX_INSTRUCTIONS.md`、`docs/REQUIREMENTS.md`、`docs/ARCHITECTURE.md`、`docs/ROADMAP.md`、`docs/reports/R2.md`。REQUIREMENTS §1 原文與 §2 決策 D1–D8 不得更動。R2 的「不要做」與「停止條件」同樣適用（不放寬既有斷言；需改 schema 時先寫 OPEN_QUESTIONS 等確認）。

## 0. 背景

R2 以合成 fixture 驗收通過。需求方改用**真實專案** `spring-framework-petclinic`（Spring MVC + JSP + JSP tag file）實測，暴露出 fixture 沒覆蓋的缺口。這些缺口不是 UI 細節，多數是**分析漏掉了最重要的流程**，導致 Screen Map 幾乎沒有關聯線。

實測資料（可用唯讀方式重新分析驗證，**不得修改該專案、不得把其程式碼複製進 repo**）：

- 來源：`/Users/machi/IntelliJ/screentrace_target/spring-framework-petclinic`
- 分析結果：`/Users/machi/IntelliJ/screentrace_target/analyze/spring-framework-petclinic/application-graph.json`
- 結果：10 個 SCREEN、28 個 COMPONENT、8 個 NAVIGATE 行為（5 個 UNRESOLVED）、`NAVIGATES_TO` 邊 9 條且全是「表單送出 → 表單畫面」；報表總覽只看得到 1 條關聯線。

## 1. 實測發現的缺口

### 分析面（需求核心：流程）

**G1　`spring:url var` 後以 `${var}` 使用的連結無法解析。** 例（`ownerDetails.jsp`）：

```jsp
<spring:url value="{ownerId}/edit" var="editUrl"><spring:param name="ownerId" value="${owner.id}"/></spring:url>
<a href="${fn:escapeXml(editUrl)}">Edit Owner</a>
```

目前 NAVIGATE 的目標為 `${fn:escapeXml(editUrl)}` 並標 UNRESOLVED（Edit Owner、Add New Pet、Add Visit、Edit Pet 皆如此）。這是 JSP 最常見的寫法之一。

**G2　JSP tag file（`WEB-INF/tags/*.tag`）內的元件與連結完全沒被抽出。** 全站導覽列（Home／Find owners／Veterinarians／Error）定義在 `menu.tag` + `menuItem.tag`，以 `<petclinic:menuItem url="/owners/find" ...>` 傳入屬性。元件清單（28 個）沒有任何選單項目，所以首頁→找飼主→獸醫列表→錯誤頁這些主要流程**全部缺失**。

**G3　Controller 的 `redirect:` 與 view 回傳沒有形成畫面間的邊。** 例：`return "redirect:/owners/" + owner.getId();`。表單送出後導向哪個畫面是重要流程，目前圖中只有「表單送出 → 同一個表單畫面」的 INFERRED 邊（疑似自我迴圈而非真實流向）。

**G4　`JSP_UNRESOLVED` 7 筆、`UNKNOWN_CALL`（flatpickr）2 筆**需逐筆確認：屬於真的無法靜態證明，還是解析器漏掉可解析的寫法。

### 呈現面

**G5　所有畫面同名。** 畫面名稱採 `<title>`，而 `htmlHeader.tag` 固定輸出 `PetClinic :: a Spring Framework demonstration`，於是 10 張卡片標題全相同，只剩一長串檔案路徑可分辨。R2 的名稱規則在「版型統一 title」時失效。

**G6　左側診斷區仍是英文代碼串，超出側欄寬度被截斷**（如 `CONTEXT_PATH_UNSPECIF…`、`PREVIEW_SOURCE_UNAVAIL…`），也沒有中文說明或明細展開。R2 WP15 第 4 點未達成。

**G7　畫面卡片可讀性。** 卡片標題塞「名稱＋完整檔案路徑」，被截斷；URL 縮在最小字。

**G8（沿用 R2.1 觀察）。** 聚焦時大量相同的「未解析」目的卡片未合併；按鈕清單混入輸入框／表格且標籤為「按鈕 25」「連結 22」「open」「notEmpty」等內部名稱；API 頁的呼叫來源用完整檔案路徑且多筆連在一起，且呼叫常被歸給共用版型而非需求方認得的畫面。

**G9（WP17 驗收後新增）　全站導覽讓 Screen Map 變成打結的線團。** WP17 讓版型的導覽列元件進入每個畫面，petclinic 的 44 組畫面關聯中，約 36 組只是「每個畫面都連到首頁／找飼主／獸醫／錯誤頁」。總覽目前把所有畫面疊成單一縱列，邊全部重疊在相鄰卡片之間，無法閱讀；真正的流程（列表→詳情→編輯／新增寵物／新增看診）被淹沒。

**G10（同上）　導覽元件名稱未代入屬性。** 全站導覽元件目前名稱為 `${fn:escapeXml(title)}`；應代入呼叫處屬性（`title`），或 `jsp:doBody` 內的可見文字（`Find owners`）。

## 2. 工作包

每個工作包獨立提交。分析面修改**必須先寫合成 fixture 與失敗測試，再實作**（fixture 為自行撰寫的最小 JSP／tag／Java，仿照上述寫法，不得複製 petclinic 內容；放 `fixtures/wp10` 以外的新目錄或在其下新增 family 子目錄均可，但**不得修改既有 fixture 與 golden**，新增 golden 另檔）。

### WP17　變數化 URL 與 tag file（G1、G2、G4）

1. **變數追蹤**：`spring:url`／`c:url`／`c:set`（page 範圍，同檔內、先宣告後使用）宣告的 `var`，在後續 `${var}`、`${fn:escapeXml(var)}`、`${fn:escapeXml(var)}` 之類**不改變語意的包裝**中視為同值。`spring:param`／`c:param` 代入 `{placeholder}`；參數值為 EL 時保留為 `{ownerId}` 之類路徑變數，不猜具體值。
2. **相對路徑**：`{ownerId}/edit` 這類相對 value，依「該 JSP 對應的 controller 路由」解析為 `/owners/{ownerId}/edit`；若所屬路由不唯一或無法證明，標 AMBIGUOUS／UNRESOLVED，**不要猜**。解析成功的標 INFERRED 並保留 evidence（來源檔、行號、使用的規則）。
3. **tag file 展開**：解析 `taglib prefix=... tagdir=...` 的自訂標籤；呼叫處的屬性（如 `url="/owners/find"`）代入 tag file 內 `${url}`、`<spring:url value="${url}"/>`，並展開 `<jsp:doBody/>` 內容。由 tag file 產生的連結／按鈕／表單必須成為正式 COMPONENT，來源記錄**呼叫處與 tag 定義處兩個位置**。tag 內再呼叫 tag（`layout.tag` → `bodyHeader.tag` → `menu.tag` → `menuItem.tag`）須遞迴展開，並設深度與循環上限（超過則診斷，不得無限展開）。屬性值為無法證明的 EL 時，該屬性保持 UNRESOLVED。
4. **版型共用元件的歸屬**：全站導覽列這類出現在每個畫面的元件，圖中需讓「每個使用該版型的畫面」都能看到它並各自有決策（沿用「決策按 (screenId, componentId)」規則），不得只掛在版型檔上。
5. **逐筆查核**：對 petclinic 的 7 筆 `JSP_UNRESOLVED`、2 筆 `UNKNOWN_CALL`，在 `docs/reports/R3.md` 逐筆說明「確實無法靜態證明」或「已修正」。flatpickr 這類第三方函式維持 UNKNOWN_CALL 即可，但不得導致其所在畫面的其他分析中斷。

驗收：新 fixture 測試涵蓋 (a) `var` 後使用且含 `fn:escapeXml`、(b) 相對路徑解析成功與路由不唯一、(c) 帶屬性的 tag file 與巢狀 tag、(d) tag 循環／深度上限、(e) 不可證明的 EL 仍為 UNRESOLVED 而非被猜成功。既有 208 Java 測試與所有 golden 不得改動後仍通過。

### WP18　Controller 導向形成畫面關聯（G3）

1. 以 JavaParser 解析 handler 回傳值：字串常數 view 名、`redirect:`／`forward:` 前綴、`"redirect:/owners/" + owner.getId()` 這類「常數 + 運算式」→ 路徑樣板 `/owners/{…}`（INFERRED），`ModelAndView`／`new RedirectView(...)` 的常數形式。多個 return 路徑各產生一條邊（成功導向、驗證失敗回表單等），並保留 evidence（類別、方法、行號）。
2. 表單畫面 → 送出的 API → handler → 導向目的畫面，應能連成**畫面到畫面**的流程邊（Screen Map 用得上）。保持「表單送出回到同一表單」這類邊不被誤當成流向別的畫面。
3. 目的不是常數（變數、方法呼叫）→ UNRESOLVED 並保留原運算式文字，不猜。
4. 這是新增邊，**不改 schema**：若現有 NAVIGATES_TO／RENDERS 無法表達「經由 handler 導向」，先寫 `OPEN_QUESTIONS.md` 提方案，等確認再動。

驗收：新 fixture 涵蓋 redirect 常數、redirect 加串接、forward、多個 return、非常數 return；viewer 的 Screen Map 在該 fixture 上出現對應的畫面間關聯線。

### WP19　畫面命名與卡片（G5、G7）

1. 名稱優先序：`<title>`／h1 **只在該值於全部畫面中唯一時採用**；若多個畫面名稱相同（版型共用 title），退為「由 view 檔名人性化」（`ownerDetails` → `Owner Details`；駝峰拆字）；仍重複時附上主要 URL。名稱決定須放在分析輸出或 viewer 的**單一**位置，不要兩邊各一份（見 ROADMAP 技術債教訓）。
2. 卡片排版：第一行顯示名稱，第二行顯示主要 URL（可截斷但可 hover 看全文），**不再顯示完整檔案路徑**（路徑放右側「來源檔」與檔案結構）。名稱與 URL 不得被截斷成無法辨識。
3. 同名衝突時不得出現兩張外觀完全相同的卡片。

驗收：測試覆蓋全畫面同 title、部分重複、全部唯一三種情境；斷言卡片文字不含 `src/main/webapp`。

### WP20　診斷區與未解析合併（G6、G8）

1. 左側診斷：預設收合；展開後每個代碼一列「中文名稱 ×數量」，點開看明細（訊息、來源檔、行號）；所有文字在側欄寬度內換行，**不得水平溢出或截斷**。英文代碼可放在明細的技術欄位。每個現有代碼都要有中文說明（含新增代碼），缺說明的代碼在測試中視為失敗。
2. 聚焦畫面：多個「未解析」目的合併為單一節點「未解析 ×N」，點開列出各觸發按鈕與原因；已解析目的維持逐一顯示。
3. 按鈕清單：預設只列「可操作項目」（按鈕、連結、送出、下拉、選擇器、彈窗觸發）；輸入框、核取方塊、表格收進「欄位與檢核」分組。標籤優先序：可見文字 → `title` → `name` → `id` → `類型＋序號`；`open`、`notEmpty` 之類內部名稱若僅是 tag 屬性或檢核規則名，不得當作按鈕標籤。
4. **全站導覽（G9）**：分析時將「出現在同一版型下多數畫面、目的與屬性相同」的導覽關聯標記為全站導覽（不改 schema；若需新增欄位先走 OPEN_QUESTIONS，否則由 viewer 依「同目的在 ≥50% 畫面出現」計算）。總覽預設隱藏全站導覽邊，並提供「顯示全站導覽」切換與統計；聚焦畫面時全站導覽目的另成「全站導覽」群組，不與該畫面特有流程混在一起。隱藏不等於刪除，右側欄與 API 頁仍列出。
5. **總覽版面（G9）**：畫面不得全部疊成單一縱列。採分層（依主流程方向）或力導向／格狀版面，使邊不穿過卡片、相鄰層邊可辨識；邊數很多時以半透明＋hover 高亮該畫面的進出邊。決定性（同輸入同座標）必須維持。
6. **導覽元件名稱（G10）**：tag 屬性代入後名稱為 `find owners` 或可見文字 `Find owners`；仍含未解析 EL 的名稱改用類型＋目的 URL，不得顯示 `${...}` 原文。
7. API 頁：呼叫來源用「畫面名稱 › 按鈕標籤」，每筆獨立一行；版型共用元件的呼叫以 WP17-4 的歸屬方式顯示在實際畫面上。

驗收：另加（G9）petclinic 總覽預設隱藏全站導覽後，可見邊數 ≤ 非導覽關聯數；任一邊不穿過非端點卡片（以座標測試）；切換顯示後邊數還原；（G10）元件名稱不含 `${`。DOM 測試斷言診斷區無水平溢出（`scrollWidth <= clientWidth`）、每個代碼有中文名稱、未解析節點合併計數正確、按鈕標籤不含已列為內部名稱的字串。

## 3. 真實專案驗收（唯讀）

完成 WP17–WP20 後，對 petclinic 重新分析與產生報表，並在 `docs/reports/R3.md` 回報下表（前後數字）。**不得提交該專案的原始碼或分析輸出**。

| 項目 | R2 結果 | 目標 |
|---|---|---|
| 全站導覽（Home／Find owners／Veterinarians／Error）成為元件並有 NAVIGATE 邊 | 無 | 有，目的為對應畫面 |
| 「Edit Owner」「Add New Pet」「Add Visit」「Edit Pet」的目的畫面 | UNRESOLVED | 解析為 INFERRED 並連到對應表單畫面（無法證明者說明原因） |
| 表單送出後的導向（redirect）形成畫面關聯 | 無 | 有 |
| Screen Map 總覽的關聯線數 | 1 | 明顯增加；列出實際數字 |
| 10 個畫面名稱可互相區分 | 否（全部同名） | 是 |
| 診斷區無截斷、有中文 | 否 | 是 |

另外請對 `eMusicStore_eCommerce_Website`（同目錄下另一個專案）做同樣的唯讀分析，列出它暴露的**新缺口**但**不在本輪處理**；若缺口屬於 WP17–WP18 的同類型（變數 URL／tag file／redirect），在相同工作包內處理。

## 4. 不要做的事

- 不改 graph schema（需要時走 OPEN_QUESTIONS）。
- 不複製 petclinic 或 eMusicStore 的程式碼進 repo；不提交其分析輸出。
- 不更動 `fixtures/wp10/golden/*`；新 golden 另檔。
- 不放寬任何既有斷言；不因測試失敗而改預期。
- 不新增效能調校、Angular／遷移產碼、AI 呼叫。
- 不執行或啟動被分析專案；分析維持純靜態。

## 5. 測試與完成條件

每個工作包提交前執行與 R2 §3 相同的完整驗證：

```bash
mvn -B clean verify
npm --prefix screentrace-js test
npm --prefix screentrace-viewer run build
npm --prefix screentrace-viewer test
node --test screentrace-capture/docs-baseline.test.mjs screentrace-capture/safe-files.test.mjs screentrace-capture/spring-resource-mappings.test.mjs screentrace-capture/capture-static-jsp.security.test.mjs screentrace-capture/preview-markup.test.mjs screentrace-capture/preview-v2.test.mjs screentrace-capture/pack-preview.test.mjs
node --test screentrace-viewer/test/*.e2e.mjs
```

基線：208 Java／40 JS／44 viewer／33 capture／41 E2E，只增不減。決定性（兩次輸出逐 byte 相同）與單一 HTML 離線開啟（D6）必須維持。更新 `ROADMAP.md`（R3 列）、`USER_GUIDE.md`、`ARCHITECTURE.md`（tag 展開與 redirect 解析的位置與限制）、必要時新增 ADR。

## 6. 停止條件與回報

- 任一項需要改 schema、或發現某寫法無法在不猜測下解析：寫入 `docs/OPEN_QUESTIONS.md` 並停止該項，其餘工作包照常。
- 完成後停止，不自行開新工作包。
- 最終回報：各 WP 狀態（完成／部分／未做）、新增測試數、§3 表格的前後數字、eMusicStore 暴露的新缺口清單、未驗證項目。未驗證不得寫成已完成。
