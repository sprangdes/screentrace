# ADR 0075：R16 WP54 Struts 呼叫來源補正

## 狀態

已採用。

## 決策

Struts JSP tag 的 `action=` 在比對前依 Struts 規則正規化：補上缺少的起始 `/`，移除 query／fragment，並依已證明的 servlet mapping 將公開副檔名 URL 還原為 action path。原始 action 字串與正規化證據仍保留。一般 HTML 相對 `href`／`form action` 依 JSP 所在公開 URL 目錄解析；JSP 可由 module 前綴目錄或該 module 的 forward 證據取得 module 歸屬，同一 JSP 被多個 module forward 時為各 module 分別建立關係。當 JSP 目錄名與 action path 同名時仍套用 module prefix，例如 module `/dispatch` 中的 action `/dispatch` 解析為公開 URL `/dispatch/dispatch.do`。

welcome-file 的 `GET /` 在首頁與 API 頁顯示「系統預設首頁」，不列入「找不到呼叫來源」篩選；graph 中原始 `UNREFERENCED` 狀態保留，不把系統入口偽裝成元件呼叫。

## 先失敗後修正的證據

以下合成 fixture／測試先於實作提交，舊行為下失敗：

| 測試 | 先行測試提交 | 失敗原因 | 修正提交 |
|---|---|---|---|
| `normalizesStrutsTagActionsAndResolvesModuleRelativeHtmlTargets`、`oneJspForwardedFromTwoModulesKeepsBothModuleRelationships` | `2b1c1bc` | tag action 的前導斜線、query／fragment、相對 URL 與多 module JSP 歸屬未能形成來源關係。 | `53fb73c` |
| `R16 welcome-file entry is presented as the system default homepage, not a missing caller` | `df60ad8` | welcome-file 的 `GET /` 被當成一般無來源 API。 | `53fb73c` |
| `dispatchActionCallerAlsoMarksThePublicActionMappingInUse` | `ed11f6a` | DispatchAction 的表單來源只連到分派 endpoint，漏掉公開 action mapping。 | `53fb73c` |
| `strutsElTaglibStaticActionsRetainTheirEndpointCallers` | `38de04e` | Struts EL tag 的靜態 action 未建立來源關係。 | `53fb73c` |
| `actionMatchingItsModulePrefixStillGetsTheModulePrefixInPublicUrl` | `136de5a` | 對 `/dispatch` action 與 `/dispatch` module，舊實作把 target 當成已含 module prefix，沒有建立 `/dispatch/dispatch.do` 的 caller；測試預期端點缺少 `TRIGGERS` 關係而失敗。 | `f0808f6` |
| `wp10BehaviorSourceTuplesBeforeWp55RemainPresentAfterTilesDeduplication` | 既有 WP55 invariant | 原始實作少了三筆 `struts-config.xml` action mapping 證據；原始 JSP `onclick` 的 unresolved 行為來源亦需保留。失敗列出四個缺漏 tuple。 | `baeb263` |
| `R16 confirmed navigation accepts a route alias recorded on its destination screen` | `f64ba10` | 舊嚴格驗證只接受 destination 的 `route`／`view`，拒絕已在 `routeAliases` 記錄的 confirmed URL alias；新增測試在修正前以「導覽關聯」失敗。 | `b21f1d9` |

原始測試輸出、每個剩餘無 caller endpoint 的搜尋命中與判讀、八模組實測及 Spring hash 對照見 [R16 報告](../reports/R16.md)。新增的 module-root 修正只移除錯誤的「target 等於 module 即不加前綴」條件；沒有改動既有 fixture、斷言或 golden。

## 驗收證據

- §5.1 列出的六組路由全部在重新分析後為 `IN_USE`；`html-cancel.jsp` 的四支送出 action 也都有來源。額外發現並補正 `dispatch/index.jsp:46` 指向 `/dispatch/dispatch.do` 的來源。
- `examples` 的 endpoint 數由 104 降為 103（已證明 alias 合併），`UNREFERENCED` 由 95 降為 16，其中 1 筆是 welcome-file `GET /` 系統入口；79 筆變成 `IN_USE`。使用者介面中的「找不到呼叫來源」清單由 95 筆降為 15 筆。
- OQ-031 授權範圍內，`struts1.summary.json` 只更新兩個診斷數量：`STRUTS_DISPATCH_UNRESOLVED` 2→0、`STRUTS_ROUTE_UNRESOLVED` 3→2。新 module-root 合成測試在舊實作上失敗；實際八模組輸出顯示 `/dispatch` module 的公開目標現在形成 `/dispatch/dispatch.do`，故兩筆 dispatch unresolved 診斷消失，另有一筆 route unresolved 消失。其餘 golden 欄位未變。
- `struts1-spring.summary.json` 依 OQ-031 授權更新實際變動的數量欄位：`behaviors_by_type.SUBMIT_FORM` 16→12、`behaviors_by_type.UNKNOWN` 27→26（Tiles 畫面收斂後重複來源去重），以及 `diagnostics_by_code.STRUTS_DISPATCH_UNRESOLVED` 2→0、`diagnostics_by_code.STRUTS_ROUTE_UNRESOLVED` 4→3（module-root action `/dispatch` 正規化為 `/dispatch/dispatch.do`，取得可證明 caller）。行為來源的去重明細與 tuple 子集證據如上；R16 前 103 個 `(檔案, 行號, 類型)` tuple 全數在目前 113 個 tuple 中。使用修正前實作 `1c61d76` 實際摘要核對，以上四個新值均與舊值不同，因此更新 golden 會在修正前輸出失敗。其他 golden 欄位不變。
- 8 個官方模組的剩餘 endpoint 以 action 最後一段（含與不含副檔名）搜尋模組全部 JSP、JS、Java、XML；每個命中逐行附原文與不構成互動 caller 的理由，沒有命中則記為「全模組原始碼中沒有任何參照」。
- 在同一組 repo 外 workspace 設定、相同 analyzer／graph writer 下，以 WP54 前 commit `27a5af6` 與補正後實作重新分析只讀目標。eMusicStore（未設定 context path）SHA-256 均為 `0253e9f25eac3119acad8810f170cc8d9c5f6cfe4edd582c851dc7b0daba1590`；設定 `/eMusicStore` 均為 `490f741cb41f9e5c912f5f0c54ed0be16865bfa8a0b8d407ea964f62f7410353`；PetClinic 均為 `6bee8b1445a466767b2a0e8a6662ccb7b1412b21e4dba248e674ea699199ec99`。
- 目標範例與 Spring 專案只讀；未建置或啟動範例程式，也未發出網路請求。Apache 原始碼不加入 repo；報告僅包含本次明確要求的逐筆搜尋行與短原文片段。
- `struts1` WP10 fixture 的既有行為來源 tuple invariant 初次失敗列出 4 筆；補回 action mapping 行為證據及原始 inline event 的 unresolved 來源後，舊 49 tuple 全數出現在新的 53 tuple 集合中，沒有變更該斷言或 fixture。
