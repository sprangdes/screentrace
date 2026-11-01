# ScreenTrace 全專案 Code Review — 2026-10-31

- 基準：`9946c08`；分支：`review/main-20261031`。
- 範圍：七個 Maven 模組，以及 `screentrace-js`、`screentrace-capture`、`screentrace-viewer`、啟動腳本、建置與需求文件。
- 檢查主線：來源掃描與檔案邊界、Spring／Struts／JSP／React 分析、圖與證據合併、URL 關聯、離線資源封裝、Screen Map、模擬、review 狀態與 Markdown、CLI 輸出。
- 以下八項皆以來源或合成 fixture 重現；CR-007／008 延續前次 OQ-038 review。這是全專案範圍的人工程式審查與回歸驗證，並非逐行完備性證明。
- 本次未修改產品程式碼、既有 fixture 或測試斷言；重現資料皆建立於暫存目錄，未執行目標應用程式。

## CR-001 [P1] 不同路徑的同名專案會互相覆寫分析結果

位置：`screentrace-cli/src/main/java/io/screentrace/cli/ScreenTraceCli.java:105–107`。

`projectAt()` 只以來源目錄 basename 決定輸出子目錄，沒有驗證現存輸出所屬的來源。支援任意絕對路徑的一步分析因此允許不同專案寫入同一個位置。

重現：隔離工作區設定同一個 `outputRoot`，建立 `a/app/Api.java`（`GET /first`）與 `b/app/Api.java`（`GET /second`），依序執行正式 CLI 的 `analyze <絕對路徑>`。

實測：兩次均回傳 0；均寫入 `out/app/application-graph.json` 及同一路徑的 HTML。第二次後只剩 `GET /second`，第一份結果已被覆寫，沒有衝突提示。

影響：使用者分析同名 repository、不同工作目錄或不同版本時，會遺失先前結果，且元件庫選用也以同一個 project name 查詢。

建議：以 canonical source identity 區分輸出，或在寫入前驗證既存圖的 `application.path`，對不同來源明確拒絕覆寫。

## CR-002 [P2] React 專案只要含 JSP 或 Spring MVC 訊號，就遺失 React 畫面

位置：`screentrace-adapter-spring/src/main/java/io/screentrace/adapter/spring/SpringProjectAnalyzer.java:9–13`。

選擇器在偵測到 JSP／Spring MVC 時直接走 `SpringMvcAnalyzer`，但 React 貢獻只接在 `SpringBootAnalyzer`；兩種來源無法共存。

重現：建立包含 `/react` route 與 REST Controller 的 React fixture，以 `SpringProjectAnalyzer` 分析；再加入 `src/main/webapp/error.jsp`，不改任何 React 來源，重新分析。

實測：加入 JSP 前有 `/react` 畫面；加入後只剩 JSP 畫面，`/react` 與其按鈕、API caller 全部消失。

影響：混合新舊前端的專案漏掉整個 SPA；API 使用狀態也可能因 caller 消失而誤標為未引用。

建議：讓 MVC 與 React 貢獻可組合，避免互斥選擇整條分析管線。

## CR-003 [P2] 非字面路由被當成未指定路徑，產生 CONFIRMED 的錯誤根路由

位置：`screentrace-adapter-spring/src/main/java/io/screentrace/adapter/spring/SpringBootAnalyzer.java:81–84`；MVC 同類邏輯位於 `SpringMvcAnalyzer.java:159–160`，類別 mapping 亦有同樣問題。

`paths()` 只回傳字串字面值；常數或其他不支援的運算式會回傳空集合，呼叫端再以空路徑替代，無法區別「沒有宣告 path」與「path 無法解析」。

重現來源：

```java
@RestController
class Api {
    static final String PATH = "/actual";
    @GetMapping(PATH)
    String get() { return null; }
}
```

實測：產出 `GET /`、`CONFIRMED`，沒有產出 `GET /actual`。

影響：會捏造根路由關係，讓真正 API 未被匹配，違反無法證明時保持 unresolved 的要求。

建議：分開表示 omitted、resolved、unresolved；可證明的常數以 AST 解析，其他保留原式與診斷，不能降成空字串。

## CR-004 [P2] Screen Map 將 Ajax 取回的片段誤畫為頁面跳轉

位置：`screentrace-viewer/src/map.ts:16`。

`indexGraph()` 無條件把 `TRIGGERS` 沿 `HANDLED_BY → RENDERS` 投影成畫面關聯。這會繞過後端 `SpringControllerFlow.project()` 對 `CALL_API` 的排除。

重現：`page.jsp` 的按鈕執行 `fetch('/fragment')`；Spring `/fragment` handler 回傳 `fragment.jsp`。

實測：正式 `SpringMvcAnalyzer` 產出 `CALL_API`，canonical graph 的 `NAVIGATES_TO` 為空；同一份圖交給正式 viewer `indexGraph()` 後，卻得到 `page → fragment`，觸發者是 `Load fragment`。

影響：需求方看到不存在的整頁流程，review 的導覽衝突判定也會受到污染。

建議：依 canonical navigation edge 或對應 behavior type 決定投影；普通 `CALL_API` 不應透過 `TRIGGERS` 變成導覽。

## CR-005 [P2] submitter 的 formmethod 被忽略，導致表單連到錯誤方法

位置：`screentrace-parser-jsp/src/main/java/io/screentrace/parser/jsp/JspProjectParser.java:145–151`。

按鈕的 `formaction` 已被讀取，但請求方法一律沿用 `activeFormMethod`，沒有讀取 `formmethod`。

重現來源：

```html
<form method="get" action="/page">
  <button type="submit" formaction="/save" formmethod="post">Save</button>
</form>
```

後端有 `GET /page` 與 `POST /save`。

實測：Save 的 `/save` 行為被解析為 `GET`，target 為 `UNRESOLVED`，evidence 明列 `原始 URL=/save；方法=GET；候選=[]`。

影響：實際可提交的按鈕無法追到 handler／完成頁，模擬也無法選到正確的提交結果。

建議：submitter 的有效方法優先採 `formmethod`，未設定時才沿用 form；保留覆寫屬性的來源證據。

## CR-006 [P2] 加入空白行就改變 Spring endpoint ID

位置：`screentrace-adapter-spring/src/main/java/io/screentrace/adapter/spring/SpringBootAnalyzer.java:86–88,104`；MVC 同類邏輯位於 `SpringMvcAnalyzer.java:155–156,175`。

handler ID 包含行號，endpoint ID 又包含 handler ID，使 API identity 間接依賴行號，違反 C9 的穩定 ID 約束。

重現：同一目錄、同一 `src/Api.java`、同一 `GET /actual` handler；第二次分析只在檔案最前方加入一個換行。

實測 endpoint ID：

```text
之前 endpoint:f7c97c1d-cf29-3e79-a26a-b9b3ef2dfb52
之後 endpoint:6b478728-1389-3b1c-8fe1-9cdd6e9b9610
```

影響：無語意變更也會把同一 API 視為新節點，連帶改變關聯與圖差異，無法可靠追蹤重新分析前後的 API。

建議：identity 使用相對檔名、完整類別／方法簽章及 mapping 等穩定鍵；行號只留在 source／evidence。

## CR-007 [P2] navigate() 與原生連結的 query 被移除，callback 選到一般入口

位置：`screentrace-js/react/analyzer.mjs:83`；相關建立點在 `1045,1298,1330`。

查詢變體選擇使用 `entryUrls ?? urls`，但只有 React `Link` 保留 `entryUrls`；其他導覽建立點的 `urls` 已經經過 `cleanUrls()` 移除 query。

重現：沿用 `OQ038QueryEntryVariantTest` 的 Guard，從其他畫面分別使用：

```jsx
<Link to="/signin?sso=ok">Callback</Link>
<button onClick={() => navigate('/signin?sso=ok')}>Button callback</button>
<a href="/signin?sso=ok">Anchor callback</a>
```

實測：Link 指向 `entryQuery: sso=err|ok`；button 與原生 a 都只指向一般入口。

影響：相同目的 URL 因觸發寫法不同而出現錯誤流程，callback 對應的已登入畫面與 API caller 不一致。

建議：所有導覽建立點都保留完整、求值後的 URL，再另以 pathname 做 route matching。

## CR-008 [P2] 查詢 Guard 拆至其他檔案後不建立 query-entry 變體

位置：`screentrace-js/react/analyzer.mjs:44,130–136`。

`findQueryEntry()` 收到的是路由宣告檔 `base.file`，並只在該 module 搜尋 hook import 與區域變數；audience 原子的實際來源 scope 沒有用來找出查詢參數。

重現：沿用 `OQ038QueryEntryVariantTest` 的同檔 fixture，將 `EntryGate` 搬至 `Gate.tsx`，由 App import，其餘邏輯不變。

實測：同檔時 `/signin` 有一般與 `sso=err|ok` 兩個變體；拆檔後只剩一個，audience 仍帶有 query guard。

影響：常見的獨立認證 Guard 結構完全失去 OQ-038 的入口拆分，原先要排除的登入狀態 API／目的地仍混在一般頁。

建議：以 audience 原子的來源與登記的 scope 解析符號，不使用 route file 作為 hook／變數的唯一搜尋範圍。

## 驗證結果

| 檢查 | 結果 |
|---|---|
| Maven 全模組 `mvn test` | 533 項：532 PASS、既有 1 SKIP |
| JavaScript `npm test` | 162 PASS |
| Capture `node --test screentrace-capture/*.test.mjs`，於 repo root 執行 | 84 PASS |
| Viewer `npm test` | 124 PASS |
| Viewer `npm run e2e` | 90 PASS |
| Viewer `npm run build` | TypeScript 與 bundle 建置通過 |

首次受限環境中的 Maven／viewer Chromium 啟動失敗，已在允許啟動本地瀏覽器的環境重跑通過。Capture 必須從 repo root 執行；子目錄執行造成的路徑錯誤不列為產品缺陷。

上述既有測試通過不代表八項缺陷不存在：新增合成情境重現使用正式 analyzer、CLI 或 viewer 模組，沒有替換解析／關聯結果，也沒有修改既有斷言。
