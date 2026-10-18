# 公開專案實測（2026-10-18）

> 歷史紀錄：本報告只涵蓋產物生成與基本 UI smoke check，不能作為操作流程／功能還原的驗收依據。新的業務應用流程實測與問題紀錄見 [WORKFLOW_RESTORATION_20261018.md](WORKFLOW_RESTORATION_20261018.md)。

實測版本：ScreenTrace `5260f64cf7607cecab75e895a529b614c3c39444`。本輪只新增實測記錄及重現腳本，未修改分析器。

4 個公開 repository、5 個分析單位均能完成分析、通過 CLI 的 GraphIntegrityValidator 並產出可操作單檔 HTML；**不代表解析完整正確**。Todo 的 Java view resolver 未生效，造成邏輯畫面與 JSP 分離；Gradle Spring Boot 專案的技術辨識漏標。Struts 仍有大量未解析診斷，必須保留人工確認。

## 輸入與結果

數量直接讀取實際 application-graph.json；端點包含頁面路由，不等同報表 API 頁的列數。

| 公開來源／分析單位 | 原始碼 commit | 畫面 | 端點 | 元件 | 行為 | 診斷 | 有縮圖／畫面 | 第一次／第二次秒數 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| [Apache Struts 1 / mailreader](https://github.com/apache/struts1/tree/02c9ff7485b1900515c6e0b32ed54ea46dd97d51/apps/mailreader) | `02c9ff7485b1900515c6e0b32ed54ea46dd97d51` | 11 | 13 | 99 | 63 | 109 | 11/11 | 6.20 / 6.12 |
| [Apache Struts 1 / cookbook](https://github.com/apache/struts1/tree/02c9ff7485b1900515c6e0b32ed54ea46dd97d51/apps/cookbook) | 同上 | 35 | 25 | 320 | 231 | 193 | 35/35 | 11.56 / 10.61 |
| [RameshMF / spring-mvc-jsp-petclinic](https://github.com/RameshMF/spring-mvc-jsp-petclinic/tree/74ad18bfa4dc0c11d04e3f04d6f138dfdd1c93e9) | `74ad18bfa4dc0c11d04e3f04d6f138dfdd1c93e9` | 10 | 19 | 93 | 66 | 3 | 9/10 | 5.15 / 4.84 |
| [kyungseo / spring-boot-todo-jsp](https://github.com/kyungseo/spring-boot-todo-jsp/tree/a18f9de8bb900461338a3e3f13cd94952b79e9d7) | `a18f9de8bb900461338a3e3f13cd94952b79e9d7` | 20 | 10 | 51 | 41 | 22 | 14/20 | 5.41 / 4.69 |
| [gothinkster / spring-boot-realworld-example-app](https://github.com/gothinkster/spring-boot-realworld-example-app/tree/ee17e31aafe733d98c4853c8b9a74d7f2f6c924a) | `ee17e31aafe733d98c4853c8b9a74d7f2f6c924a` | 0 | 19 | 0 | 0 | 0 | 0/0 | 1.16 / 1.12 |

時間為同機最多三個分析單位並行的觀測值，含預覽及報表生成，不是效能基準。RealWorld 是純後端，零畫面符合輸入內容；本次只核對 REST annotation 路由，不涵蓋其 GraphQL 功能。

## 已確認的問題與邊界

1. **Todo：Java view resolver 未正確解析，影響主要畫面關聯。** `WebMvcConfig.java:145–149` 建立 `InternalResourceViewResolver`，設定 prefix `/WEB-INF/view/`、suffix `.jsp`；`TodoController.java:59,66,129` 回傳 `todo/list`、`todo/form`、`todo/dashboard`。三個 JSP 實際存在，但 graph 產生同名邏輯 view 的獨立 SCREEN，並回報找不到 JSP。`welcome` 同樣分裂。20 個畫面中 5 個沒有靜態文件，僅 14 個有縮圖；不能把「分析成功」當成主要流程已還原。
2. **RealWorld：Gradle 技術標示漏掉 Spring Boot。** `build.gradle:34` 明確依賴 `spring-boot-starter-web`，`RealWorldApplication.java:6` 使用 `@SpringBootApplication`，但 technologies 只有 `Gradle, Java`。`ProjectScanner` 的 Spring 判定只查 pom.xml／部分 XML，未採用 Gradle 或 Java annotation。19 個 REST 路由仍逐一符合人工原始碼盤點；此輸入尚未造成端點漏失。
3. **Struts：基本分析可用，流程完整性尚未全數確認。** Mailreader 有 28 個 STRUTS_ROUTE_UNRESOLVED、15 個 STRUTS_REDIRECT_CYCLE、11 個 STRUTS_DISPATCH_UNRESOLVED、11 個 STRUTS_WILDCARD_VERSION_UNRESOLVED，以及 `/Welcome`、`/Welcome.do` 重複路由診斷。Cookbook 有 150 個 STRUTS_ROUTE_UNRESOLVED、36 個 VALIDATION_RULE_UNRESOLVED。本次採公開 repository HEAD，並非先前 R16 的 1.3.10 封存版本，數量不可直接作回歸比較。未逐項裁定這些診斷是工具缺陷或原始設定邊界。
4. **PetClinic：1 個缺少來源 JSP 的回傳值。** `VisitController.java:95–97` 回傳 `visitList`，checkout 沒有相應 JSP；工具保留未解析畫面並給出診斷，9 個實體 JSP 都有縮圖。另有 context path 未設定及 URL 未解析診斷。
5. **來源可追溯性例外。** Cookbook 的 1 筆、PetClinic 的 40 筆 behavior evidence 使用 `file=".", line=1`，表示 context path 未設定，並非可點開的來源檔；其他同項 evidence 仍有 JSP 路徑。逐筆檢查未發現其他節點／邊／行為／檢核 evidence 的實體來源檔與行號越界。這個 sentinel 仍是來源契約需另行檢視的例外，未把它算為完整來源驗證通過。
6. **執行成功與品質警告。** 最初一般沙盒內 Chromium 因 macOS MachPort 權限失敗，CLI 仍 exit 0 並產生無預覽報表。取得背景 Chromium 執行權限後，正式兩輪全部成功，未再出現這個問題。Struts 日誌另有 `DOCTYPE is disallowed` 訊息，雖不阻止產物，尚未證明對全部設定的影響。

## 驗證範圍

- 只建置 ScreenTrace；下載目標原始碼後不執行其 Maven／Gradle／npm、Java、JSP 或 JavaScript，也不啟動目標服務。
- 5 個單位各連續完整分析兩次，10 次 exit code 全為 0；所有輸出 `.json`、`.html` 路徑集合及 SHA-256 逐一相同，包括 application graph、preview model、內嵌縮圖與單檔報表。
- 圖節點 ID 唯一、所有 relationship 的 from/to 都存在；CLI 自身嚴格圖驗證通過。
- 依原始 Controller 原文獨立列出 RealWorld 19 個、Todo 10 個 HTTP 方法／路由，與實際 graph 的端點集合完全一致，完整清單見 audit.json。其餘三單位未建立全量正確性基準。
- 每個目標 repository 的 `git status --porcelain --untracked-files=all` 為空，確認分析後沒有變更或新增目標檔案。
- 背景 Chromium 逐一開啟五份真實產物，驗證兩個頁籤、畫面卡片數、第一張畫面聚焦及預覽、API 清單與詳情。各報表 API 列數為 7、2、2、2、19；依現行規格排除頁面路由及未匹配的 JS request node，與端點總數不同屬預期。
- 五份報表的 pageerror 為 0，HTTP(S) 請求為 0；每份保存 API 截圖，四份有畫面的另存聚焦截圖。抽看 Todo 截圖，畫面可呈現，但不代表樣式或所有互動已逐項驗收。
- 本輪沒有修改 production code，也沒有重跑整套單元測試或掃描所有互動分支；重點是公開原始碼輸入的實際分析與產物檢查。

## 產物與重現

- 可開啟的完整分析產物：`analyze/public-20261018/<分析單位>/report/screentrace-report.html`。同一根目錄保留 graph、preview、靜態文件、截圖及成功／初次失敗的原始 log。此目錄受既有 `/analyze/` ignore 規則排除。
- [數據、原始碼版本、兩輪所有 JSON／HTML 雜湊](public-projects-20261018/audit.json)
- [五份報表 UI 實測結果](public-projects-20261018/ui-smoke.json)
- [兩輪分析腳本](public-projects-20261018/run.py)、[圖與來源稽核腳本](public-projects-20261018/audit.py)、[真實報表 UI 腳本](public-projects-20261018/ui-smoke.mjs)

腳本記錄本次實際機器路徑。工作區 `/private/tmp/screentrace-public-20261018` 中，`sources/` 放上述四個 repo，`home/.screentrace/config.json` 設 projectRoot 為 `sources/`，`struts-home/.screentrace/config.json` 設 projectRoot 為 `sources/struts1/apps/`；兩者 outputRoot 皆為 `output/` 的絕對路徑。重現時須 checkout 表列 commit；若改用其他目錄，調整腳本內 base/root，並同步設定 config。

```sh
cd /Users/machi/IntelliJ/screentrace/screentrace-viewer
npm run build
cd /Users/machi/IntelliJ/screentrace
mvn -q -DskipTests package
python3 docs/reports/public-projects-20261018/run.py
python3 docs/reports/public-projects-20261018/audit.py
node docs/reports/public-projects-20261018/ui-smoke.mjs
```

分析腳本使用獨立 `-Duser.home`，不讀寫使用者日常 ScreenTrace 設定；`analyze` 標準輸入為 `/dev/null`，不自動開啟桌面瀏覽器。Chromium 需要可在本機啟動背景程序的執行權限。
