# ADR 0132：R41 拆分 StrutsProjectAnalyzer

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-001 的最後一段是拆分大型檔案。R39 排版後，`StrutsProjectAnalyzer.java` 有 4,877 行、148 個成員：一個公開的 `analyze`，其餘全是共用同一個 `State` 的 `private static` 方法、record 與 `State` 本身。修改任何一段都要在近五千行的檔案裡找，PR diff 也很難看出改到哪個功能。

## 決定

- R41-1：本段只搬移，不改邏輯。148 個成員依功能分到同一個 package 的 16 個檔案；方法內容不變，只把 `private` 改為 package-private。
- R41-2：分組如下（全部是 package-private 的 `final` 類別，只有 `StrutsProjectAnalyzer` 仍是 public）：

  | 類別 | 內容 |
  |---|---|
  | `StrutsProjectAnalyzer` | 公開入口 `analyze` 與 `PARSER` 常數，依原順序呼叫各階段 |
  | `StrutsModel` | 原本的 record、enum 與分析狀態 `State` |
  | `StrutsGraphSupport` | 節點、邊、證據、診斷、XML 等共用工具 |
  | `StrutsConfigParser` | struts-config 的 action mapping、form bean、Spring bean、Struts 版本 |
  | `StrutsServletMappings` | web.xml 的 ActionServlet／FacesServlet mapping 與公開路徑、JSF 偵測 |
  | `StrutsScreens` | JSP 畫面與 view、welcome file、畫面路由別名 |
  | `StrutsMessages` | message resource 與訊息 key |
  | `StrutsTiles` | Tiles 定義、Tiles 畫面與名稱 |
  | `StrutsDispatch` | DispatchAction 家族與 dispatch 方法解析 |
  | `StrutsForwards` | 設定檔與 Action 原始碼裡的 forward |
  | `StrutsWildcards` | 萬用字元 action mapping |
  | `StrutsActionInheritance` | action 之間 forward 的呼叫者傳遞與繼承的 action 樣板 |
  | `StrutsInteractions` | JSP 標記（連結、表單、載入時呼叫、include）與 action 的連結 |
  | `StrutsControls` | 單一互動元件產生的 component、trigger 與 behavior |
  | `StrutsValidation` | Commons Validator 規則與 ActionForm 欄位 |
  | `StrutsBehaviorProjection` | enrich 之後的 dispatch behavior 投影與證據保留 |

- R41-3：各類別以 `import static io.screentrace.adapter.struts.<類別>.*` 取得其他類別的方法，只匯入實際呼叫到的類別；所以方法內容不需要加上類別名稱。例外是兩個方法參照：`StrutsProjectAnalyzer::validDispatchSignature` 改為 `StrutsDispatch::validDispatchSignature`，`StrutsProjectAnalyzer::wildcardCandidateText` 改為 `StrutsWildcards::wildcardCandidateText`。
- R41-4：方法名稱在整個 package 內不重複，同名的多載方法（`publicPath`、`resolveMappingScreens`、`addNode`、`edge`）放在同一個類別，避免靜態匯入時被遮蔽或模稜兩可。
- R41-5：證據裡的 parser 名稱仍是 `StrutsProjectAnalyzer`（`PARSER` 常數不變），分析產物不受影響。
- R41-6：拆分 `screentrace-js/react/analyzer.mjs`、以及在各類別之間收斂共用的 `State`（例如改成各階段自己的輸入輸出）不在本段範圍。

## 後果

- 最大的檔案從 4,877 行降為 `StrutsTiles.java` 的 587 行；`StrutsProjectAnalyzer.java` 剩 75 行，讀它就能看到整個分析流程的順序。
- 驗證：
  - 原檔的 148 個成員與拆分後逐一比對，除了 R41-1 與 R41-3 的修改，忽略空白後完全相同（差異只有拿掉 `private` 後 google-java-format 重新換行）。
  - Maven 582 個測試 577 通過、5 個依作業系統條件略過，與拆分前相同。
  - 以拆分前（main `5f5f20d`）與拆分後的 CLI 分析 `fixtures/` 的 11 個專案（struts、struts-spring、wp10 的 struts1／struts1-spring／struts2-rejected、r3、r5、r7），197 個產物檔案除了專案來源路徑以及由它算出的報表 fingerprint 外相同；struts2-rejected 兩邊都以相同訊息拒絕。
- 各類別仍共用可變的 `State`，類別之間的相依沒有變少，只是按功能分檔；之後要改某一段時，再視需要把它的輸入輸出收斂成明確的參數。
