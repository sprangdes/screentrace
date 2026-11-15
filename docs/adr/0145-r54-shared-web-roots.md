# ADR 0145：R54 context 絕對路徑依引用檔所在的 web root 解析

## 背景

[CODE_REVIEW_20261114](../CODE_REVIEW_20261114.md) 的 RV-317、RV-401、RV-425、RV-512：Struts adapter、JSP parser、capture 各自寫死 web root（多數只認 `src/main/webapp`，Struts 另認 `WebContent`、`web`），而掃描器早已認得 `src/main/webapp`、`WebContent`、`WebRoot`、`webapp`、`web` 與 `nbproject/project.properties` 指定的資料夾。結果是 WebContent／WebRoot 這類舊專案的 include、tag file、HTML 畫面與相對連結解析不到，而這正是主要分析對象。

## 決定

- R54-1：新增 `io.screentrace.scanner.WebRoots`，作為 web root 的唯一規則：
  - `of(root)`：專案的 web root 清單（`nbproject` 指定時只有該資料夾，否則為預設 5 個）。
  - `rootOf(roots, file)`：檔案所在的 web root。只比對路徑開頭；模組資料夾內只認 Maven 的 `src/main/webapp/`（例如 `app/src/main/webapp/`），避免把 `src/main/resources/web/` 之類的資料夾誤認為 web root。
  - `candidates(roots, file, target)`：context 絕對路徑（`/WEB-INF/...`）先在引用檔自己的 web root 下找，再退到專案根目錄（保留既有行為）；引用檔不在任何 web root 時，依序試每個 web root，最後是專案根目錄。**不會**改到另一個 web root 下找同名檔。
- R54-2：改用 `WebRoots` 的位置：JSP include 與 tagdir（`JspProjectParser`、`JspTagFileExpander`）、標記投影（`MarkupGraphContribution`，沒有專案根目錄可讀，使用預設清單）、Struts 的 view 索引、HTML 畫面、相對連結與 include 來源（`StrutsGraphSupport`、`StrutsScreens`、`StrutsInteractions`）。
- R54-3：struts-menu 的 `menuConfig` 以 `WEB-INF` 的上層資料夾為 web root，`WEB-INF/config/struts-config.xml` 也能找到 `/WEB-INF/menu-config.xml`。
- R54-4：capture 的 `<mvc:resources>` 探索除了 `src/main`，也掃描實際的 web root；同一檔案只讀一次。
- Spring adapter 中寫死 `src/main/webapp` 的位置（`SpringMvcAnalyzer`、`SpringControllerFlow`）不在本輪範圍；R58 已依同一規則調整，見 ROADMAP。

## 後果

- WebContent／WebRoot／模組內 `src/main/webapp` 的專案，include、tag file、HTML 畫面、相對連結與靜態資源對應可以解析。
- 引用檔所在 web root 下找不到時不會改用其他 web root 的同名檔，避免靜默猜錯。
- 驗證：新增 `WebRootsTest`、`WebRootResolutionTest`、Struts `webRootLayoutResolvesHtmlScreensIncludesAndRelativeLinks`、`StrutsMenusTest` 與 capture 測試各一，都已確認在修改前失敗；既有 fixtures 都使用 `src/main/webapp`，測試全數通過（JS 181、capture 95、viewer 單元 149、Maven 全數）。
