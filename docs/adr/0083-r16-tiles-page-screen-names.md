# ADR 0083：R16 Tiles 頁面畫面名稱

## 背景

R16 §9.1 驗收指出，Tiles 頁面定義沿用共用版型 JSP 的標題，造成多個畫面都顯示「Layout」，再以網址與流水號區分。這使使用者無法辨識實際頁面。

## 決定

Tiles 頁面定義名稱依序採用：

1. definition（含 `extends` 繼承後）`put name="title"` 的常值，或可由訊息資源唯一解析的值。
2. `body` 或唯一主要內容 put 指向的 JSP，其靜態 `<title>`／`<h1>` 文字；其中 `bean:message`、`s:message` 只在訊息資源可解析時採用。
3. Tiles definition 名稱的人性化文字，移除開頭句點並拆分駝峰字。

共用版型 JSP 不參與頁面名稱判定。路由只保留在網址欄。若名稱重複，優先用唯一網址區分；網址仍相同時使用可讀的 definition 名稱或來源檔名。不得以流水號區分。Viewer 對 Tiles 畫面使用 graph 的頁面名稱，不以共用版型預覽文件的 `<title>`／`<h1>` 覆蓋。

## 測試與既有 R16 測試預期調整

測試先於實作提交：`b9aa0c7` 新增 Tiles title put、body heading、definition fallback 與 WP10 `outer` 命名測試；舊 analyzer 回傳 definition／版型名稱，未符合測試。Viewer 測試亦曾觀察到共用文件標題覆蓋頁面定義名稱。`4166a3a` 新增重複 Tiles 名稱測試；實作前結果為 `Main Menu（/menu.do）` 與 `Main Menu（/menu.do）（2）`，因此新預期明確失敗。

依 OQ-028（R16 新增測試授權），本輪同步修正早先 R16 新增的 Tiles 測試預期，沒有修改 R16 前的測試或 fixture：

| 測試 | 舊預期 | 新預期 | 原因 |
|---|---|---|---|
| `wp10FixtureKeepsUnroutedPageDefinitionAndDirectJspAsScreens` | `Outer` | `合成訂單畫面` | `outer` definition 的主要內容 JSP `<title>` 可讀，依優先序 (b) 勝過 definition fallback。 |
| `wp10OuterPageDefinitionUsesHumanizedName`（改名為 `wp10OuterPageDefinitionUsesBodyJspReadableName`） | `Outer` | `合成訂單畫面` | 同一 WP10 `outer` 頁面應套用相同 body JSP 規則。 |
| `everyUnreferencedPageDefinitionRemainsAScreenAndItsJspControlsStayGrouped` | `home.page`、`unused.page` | `Home Page`、`Unused Page` | 兩個 body JSP 的靜態 `<h1>` 可讀，採用 WP42 規則；保留未入口畫面及元件歸屬斷言。 |
| `pageDefinitionOwnsTilesDefinitionInsertedByItsJsp` | `home.page` | `Home Page` | 靜態 `<h1>` 是頁面內容名稱，插入的版型不提供名稱。 |
| `referencedRootTemplateWithoutEntryIsNotAnIndependentScreen` | `home.page` | `Home Page` | 頁面名稱採 body JSP `<h1>`，另保留版型不成為獨立畫面的既有 R16 測試意圖。 |
| `unreferencedTileTemplateRetainsItsOwnScreenAndControls` | 以 `base` 節點名稱尋找 | 以穩定節點 ID `tiles:base` 尋找 | 未引用模板仍是畫面，但其名稱依 body JSP（`Page`）規則，不再以 definition 名稱 `base` 查找；元件與行為斷言保留。 |
| `standaloneTileTemplateScriptRemainsAttachedToItsUnroutedScreen` | 以 `base` 節點名稱尋找 | 以穩定節點 ID `tiles:base` 尋找 | 同上；保留未入口模板腳本仍掛在原畫面的斷言。 |
| `SyntheticProjectIntegrationTest` 的 WP10 前置畫面來源資料 | `outer` | `合成訂單畫面` | 混合 Struts/Spring 整合 fixture 的 `outer` 繼承 body JSP，該 JSP 有靜態 `<title>`，依規則採內容名稱；來源檔及行號不變。 |
| `facesSuffixMappingResolvesTilesLayoutAndCountsItsJsfTagOnThePageDefinition`、`facesTargetWithoutProvenMappingIsNotSuffixGuessedAndHasDiagnostic` | 節點名 `.home` | `Home` | 兩個 R16 合成頁面定義只有 `<a>` 文字，沒有 title／h1 或 title put；依序採 definition 名稱的人性化結果，Faces mapping 狀態及 JSF 診斷斷言不變。 |

## 後果

Graph 保留 `tilesDefinitionName`、`screenNameSource`、`screenNameSourcePath` 供追溯。名稱推導只讀靜態標記與已解析訊息資源，不執行目標程式。這項改動只影響 Struts/Tiles 名稱與 Viewer 顯示標籤；Spring graph 雜湊必須保持不變。
