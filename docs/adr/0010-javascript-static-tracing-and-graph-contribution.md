# ADR 0010：JavaScript 靜態追蹤、值與 canonical graph

## 背景與選項

WP4 需從事件及載入入口追蹤應用函式，保留回呼的父子行為與呼叫來源。可執行目標程式取得值，或僅在 AST 上建立有界的靜態環境；C1 要求後者。

## 決定

函式宣告、表達式與物件方法以 AST 環境追蹤，預設深度 10，Node request.maxDepth／Java screentrace.js.maxDepth 可設定；來源檔案與函式位置構成循環保護鍵。達到限制保留 UNKNOWN／UNRESOLVED 與診斷。success、done、then 回呼保留 parentId，行為 evidence 包含呼叫鏈與定義來源。使用名稱被重寫的函式保持未知；來源中的同名函式優先於原生 API 語意。

字串、串接、template literal、單次初始化及物件常值屬性使用抽象值，不求值或呼叫目標函式。未知部分保留 {expr}／INFERRED；重新賦值、computed access、使用者輸入與 scriptlet 保持 UNRESOLVED。單次宣告後賦值只接受同一作用域的無條件初始化且先於使用。XHR 多個 open 候選全部保留為 AMBIGUOUS，不取最後一個。

相對 import／export 只從 SafeProjectFiles 已讀取的專案檔案映射取得 AST；不使用 import、require 或網路載入目標模組。module 匯出符號依檔案命名，私有符號不進入 classic script 全域。無法證明的匯入產生診斷。第三方內部仍依 ADR 0009 跳過。

JavaScriptGraphContribution 透過受信任工具路徑的 Node CLI 與 JSON stdin/stdout 接入兩種 adapter；不啟動目標專案。載入來源為畫面；失敗的事件綁定以所屬畫面保留 selector 原文及 UNRESOLVED。靜態 DOM 中被事件匹配的普通容器可建立 OTHER 元件，附原標籤與來源證據。include 來源投影保留元件與使用畫面所有權。

URL 與 HTTP method 可解析的呼叫建立前端請求描述 ENDPOINT，穩定鍵為 javascript-request、method、url；backendStatus=UNRESOLVED。這是呼叫描述，不代表後端路由已匹配；後端對應與合併屬 WP5。未知 URL 的行為仍保留。canonical CALL_API 與其簡化 CALLS 邊由 ApiUsage 去重，避免雙重計數，既有移除決策仍按 (screenId, componentId)。Spring 2.1／Struts 2.2 既有輸出版本保留，統一 schema 屬 WP5。

行為 ID 使用來源檔案、觸發者、事件、類型、原文、父 ID 及同類出現序的 SHA-256；行號只用於 evidence。新增 CLIENT 規則、行為、邊均保留 source、parser 與狀態。

## 相依與後果

無新增套件；ScriptSources 使用既有釘選 JavaParser 3.26.1（Apache-2.0 授權選項）讀取 context 定義證據。Node 相依仍為 ADR 0007 的 Acorn 8.18.0／acorn-loose 8.5.2（MIT）。CI 在 Java 整合測試前安裝 Node 工具，執行 npm audit 與 Dependency-Check。

解析不等同執行：副作用探針的標記檔不能產生。缺少工具、超時、語法錯誤與未知函式留下診斷，不把失敗升級為確定結果。Windows launcher 更新但本次未在 Windows 執行。
