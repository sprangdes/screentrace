# ADR 0074：R16 路由別名與 Tiles 畫面界線

## 狀態

已採用。

## 決策

只有在 `web.xml` 能唯一證明 Struts ActionServlet mapping 時，action path 與公開 URL 才合併為同一個 endpoint。公開 URL 是 endpoint 的主要 `path`；`logicalPath` 與 `aliases` 保留 action path，呼叫來源只連到該 endpoint 一次。無法證明或 mapping 有多個候選時，維持 R16 前的 endpoint 候選與信心，另發出 mapping 未證明診斷。Viewer 的 API 全域搜尋同時檢查公開 path、logicalPath 與 aliases。

Tiles definition 一律保留為 `VIEW`，只有 Struts forward 唯一指向的 definition 才建立 `SCREEN`。被 Tiles template 或 JSP-valued put 引用的 JSP 不因檔案存在而自動成為畫面；若被 Struts forward 或 welcome-file 直接指向，仍建立獨立畫面。被使用的 template 與 JSP 片段維持 `VIEW`／`INCLUDES` 關係，片段控制項依 definition 歸屬到畫面；未被導向的 definition 不產生畫面或畫面控制項。

## 驗證

- `StrutsR16RoutingTest` 覆蓋 mapping 已證明、缺少或多候選時的 endpoint 身分與診斷。
- `r16-endpoint-alias-search.e2e.mjs` 驗證 API 全域搜尋可用 logical alias 與公開 path 找到同一 endpoint。
- `StrutsR16TilesBoundaryTest.onlyForwardedTileDefinitionBecomesScreenAndItsJspControlsStayGrouped` 覆蓋 extends、JSP put、字串 put、被 forward 與未被 forward 的 definition、直接 forward JSP，以及 layout／fragment 控制項歸屬。
- R16 前已存在的測試與 fixture 未修改；OQ-028 授權的兩個 R16 新測試預期另記於 ADR 0073。
