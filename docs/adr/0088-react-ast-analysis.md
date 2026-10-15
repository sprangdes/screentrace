# ADR 0088：Spring Boot + React 前端改用 AST 分析

## 背景

以 `sprangdes/reservio`（Spring Boot 3.2 REST 後端 + React 18／react-router 6 + TypeScript 前端）實測時，結果有以下問題：

1. JavaParser 以預設語言層級解析，遇到 record、switch expression、text block 時整個檔案失敗（31 個檔案），Controller 與 DTO 契約遺漏。
2. React 分析以 regex 擷取 `<Route>`、`<Link>`、`navigate('...')` 與 `'/api/...'` 字串。專案透過 `api.login()` 這類包裝物件呼叫後端，所以畫面與 API 之間沒有任何 CALLS／TRIGGERS 邊。畫面來源以「整個檔案 import 了什麼」推斷，一個畫面最多被算進 112 個檔案。表單、輸入框、下拉選單、對話框都沒有被辨識。這也違反 AGENTS.md「結構化語言不得以 regex 為主要解析方式」。
3. `@RequestMapping("/api/x")` 類別上的 `@GetMapping`（無路徑）被組成 `/api/x/`，與 Spring 實際對應的 `/api/x` 不符。

## 決定

- 新增 `JavaSources.parse`，所有 Spring 分析統一以 Java 21 語言層級解析；移除 `SpringMvcAnalyzer` 對 `StaticJavaParser` 全域設定的副作用。
- React 分析移到 `screentrace-js/react/`，使用 `@babel/parser` 7.29.9（MIT；釘選版本；相依只有 `@babel/types` 與兩個 helper，npm audit 0）。選 7.x 是因為 8.x 需要 Node 22.18+，而 ScreenTrace 支援 Node 18+。Java 端 `ReactGraphContribution` 以 JSON 傳入來源文字，只執行本工具的分析模組，不執行目標程式碼。
- 分析範圍：
  - 路由：JSX `<Routes>/<Route>`（巢狀、index、`element`／`Component`）與 `createBrowserRouter`／`useRoutes` 物件陣列。重複路由保留第一個並記錄 `REACT_DUPLICATE_ROUTE`。
  - 渲染：從 `createRoot().render()` 的根節點開始（Provider 與 `<Routes>` 外的全域元件因此屬於每個畫面），走到該路由所屬的 `<Routes>` 後展開路由與版型（`<Outlet/>`）。元件依 import／export 解析並展開，props 以閉包綁定。三元、`&&`、`if`、`switch` 在條件可由常值 props 證明時只走成立的分支；無法證明時兩邊都保留，並把條件原文存成 `guard`。對常值陣列的 `.map` 逐項展開。
  - 元件：原生 `a`、`button`、`input`（依 type）、`select`、`textarea`、`form`、`dialog`／`role=dialog`／`.modal`、`table`，以及 router 的 `Link`／`NavLink` 和帶事件處理器的元素。同一元素在不同渲染路徑上是不同元件，ID 由「渲染路徑上各 JSX 元素的檔案、名稱、同檔出現序」組成，不含行號（C9）。
  - 行為：事件處理器沿區域函式、import 函式、props 回呼、自訂 hook 回傳值、物件成員追到 `fetch`／`axios`、`useNavigate()`、`location.assign`／`location.href`。URL 以 `{參數}` 保留無法證明的片段；`undefined`／`null` 不會被寫進 URL。`useEffect`（含自訂 hook 內）的效果是畫面載入呼叫。表單 `onSubmit` 的效果歸到表單內的送出按鈕。
  - 整頁導向到不是前端路由的伺服器網址（例如 OAuth 入口）記為 `GET` 的 CALL_API，evidence 註明為整頁導向。
- CALL_API 行為沿用 `UrlGraphContribution` 對應到後端 endpoint；對不到時保留 `javascript-request` 端點，與 JSP 頁面的 JS 請求一致。
- React 畫面的 SCREEN ID 維持既有公式（路由檔 + 路由），既有 review 決策可延續。元件 ID 因改用穩定的渲染路徑鍵而改變（舊 ID 含字元位移，本來就不穩定）。
- `@GetMapping` 無路徑時使用類別路徑本身，不加尾斜線（`SpringBootAnalyzer`、`SpringMvcAnalyzer` 同步修正）。

## 測試相容

`SpringBootAnalyzerTest`、`SpringBootAnalyzerSecurityTest` 的 React fixture 原本沒有 import `Route`，並以 default import 引用 named export，只有 regex 能接受。這些 fixture 的「輸入」改為合法的 React 模組（補上 `import { Route } from 'react-router-dom'`、改為 `export default`）；所有斷言未修改。

## 影響

- Graph schema 版本不變。React 畫面新增屬性 `rendering=static-reconstruction`。
- reservio 實測：33 個畫面、1064 個元件、470 條 TRIGGERS、203 條 CALLS；所有前端請求都對應到後端 endpoint；未被任何畫面使用的 API 為 `/api/dashboard`、`/api/reservations/today|week|month` 與 LINE webhook。
- 限制：元件內的巢狀 `<Routes>` 不展開（`REACT_NESTED_ROUTES`）；class component、動態元件變數、以 `let` 重新指派的 JSX 不解析；計時器或事件監聽在 `useEffect` 內註冊的回呼仍算作畫面載入期間的呼叫。
