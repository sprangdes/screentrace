# ScreenTrace 程式健檢 — 2026-11-11

- 基準：`74519b2`（main）；分支：`feature/r38-health-check`。
- 範圍：七個 Maven 模組、`screentrace-js`、`screentrace-capture`、`screentrace-viewer`、CI 與建置設定。
- 方法：統計檔案規模與行長、搜尋例外處理與 regex 用法、比對 CI 實際執行的測試，並在本機執行 CI 沒跑的測試。這是抽查，不是逐行審查。
- 前次 [CODE_REVIEW_20261031](CODE_REVIEW_20261031.md) 的 CR-001～008 都已修正（PR #51～#58）。

## 總表

依「出問題時的影響 × 發生機率」排序，修正順序也照這個排。

| 編號 | 優先 | 項目 | 狀態 |
|---|---|---|---|
| HC-001 | 高 | 程式碼過度壓縮，沒有格式化與 lint 工具 | 排版（R39、R40）與拆分大型檔案（R41、R44）已完成；lint 規則待辦 |
| HC-003 | 高 | CI 沒跑到 7 個 capture 測試檔；只在 Linux 上測；沒有覆蓋率 | 測試已補進 CI（R38）；Windows 與覆蓋率已加入（R45） |
| HC-004 | 中 | 預覽擷取逐一畫面執行；R34 的 5 秒改善沒合併；Java 原始檔重複解析 | 預覽擷取已完成（R47）；Java 線性搜尋熱點待辦（R48） |
| HC-005 | 中 | Struts／JSP 有部分標記用 regex 解析 | 已完成（R46）；`c:url` 前處理待辦 |
| HC-006 | 中 | 框架 adapter 的選擇寫死在 if 判斷裡，沒有共同介面 | 刻意延後：等需要第三種框架時再做 |
| HC-002 | 低 | 26 處 `catch(Exception ignored){}` | 已重新評估，降為低 |
| HC-007 | 低 | 沒有 Maven Wrapper；Node 套件沒宣告 `engines`；Playwright 版本綁住 CI 的作業系統版本 | 已完成（R43） |
| HC-008 | 低 | ADR 128 份，缺一份現況摘要 | 待辦 |
| HC-009 | 低 | `element-styles.json` 含本機絕對路徑（R39 比對時發現） | 已完成（R42） |

## HC-001 [高] 程式碼過度壓縮，沒有格式化與 lint 工具

**現況**

主程式共 1.65M 字元，卻只有 18,712 行，平均每行 88 字元；很多檔案的寫法接近壓縮後的程式碼。

| 檔案 | 行數 | 大小 | 最長一行 | 超過 300 字元的行數 |
|---|---|---|---|---|
| `StrutsProjectAnalyzer.java` | 1,528 | 163 KB | 1,463 | 70 |
| `screentrace-js/react/analyzer.mjs` | 1,723 | 117 KB | 795 | 29 |
| `SpringServerValidation.java` | 63 | 16 KB | 1,506 | 19 |
| `SpringDtoSimulation.java` | 83 | 23 KB | 1,423 | 29 |
| `screentrace-viewer/src/simulation.ts` | 89 | 19 KB | 1,900 | 17 |

專案裡沒有 Spotless、Checkstyle、google-java-format、ESLint 或 Prettier 的設定。

**影響**

- PR diff 幾乎沒辦法逐行審查；一行改了一個字元，整行 1,000 多字元都會被標成變更。
- 除錯時中斷點只能下在一整行上，看不出是哪一段出錯。
- CR-003、CR-006 這類問題就藏在很長的單行邏輯裡。

**建議做法**

1. 先發一個「只格式化」的 PR：Java 用 Spotless + google-java-format，TS/JS 用 Prettier；用 fixtures 與 reservio 驗證所有分析產物和格式化前逐位元組相同。
2. CI 加上格式檢查，避免之後又寫回壓縮風格。
3. 再分批拆分 `StrutsProjectAnalyzer` 與 `react/analyzer.mjs`。

**需要先決定**：格式化會改到幾乎每一個檔案，所有還沒合併的分支（包括 `feature/r34-analysis-performance-security`）之後都會大量衝突。要先處理掉這些分支，再挑時間一次做完。

**進度**

- R34（PR #85）與 R38（PR #84）合併後，R39 WP110 以 Spotless + google-java-format 1.24.0 重新排版全部 Java 原始碼與測試（220 個檔案），CI 加上格式檢查，見 [ADR 0130](adr/0130-r39-java-formatting.md)。
- R40 WP111 以 Prettier 3.9.10 重新排版三個 Node 套件的 TypeScript／JavaScript（234 個檔案），CI 加上格式檢查，見 [ADR 0131](adr/0131-r40-typescript-javascript-formatting.md)。
- R41 WP112 把 `StrutsProjectAnalyzer.java` 依功能拆成 16 個檔案（只搬移），見 [ADR 0132](adr/0132-r41-split-struts-project-analyzer.md)。
- R44 WP115 把 `react/analyzer.mjs` 依功能拆成 9 個模組（只搬移），見 [ADR 0135](adr/0135-r44-split-react-analyzer.md)；`ScreenRenderer` 類別仍有 1,867 行。
- 待辦：ESLint 等 lint 規則。

## HC-002 [低] 26 處吞掉例外

**現況**

Java 主程式有 26 處 `catch(Exception ignored){}`，依用途分成四類：

| 類別 | 位置 | 是否會默默漏掉分析結果 |
|---|---|---|
| Java 原始檔解析失敗 | `SpringDtoSimulation:12`、`SpringSecurityProcessors:9`、`SpringSubmittedModel:15` | 否。檔案都經過 `ParsedJavaUnits` 快取，同一個檔案在主流程（`SpringMvcAnalyzer:150`、`SpringBootAnalyzer:56`）已經會產生「Unable to parse Java source」診斷；`SpringFormBindings` 與 `SpringServerValidation` 也各自再報一次。 |
| JSP／設定檔讀取失敗 | `StrutsProjectAnalyzer:110,129,1234,1331`、`ConditionalUrlTargets:21`、`RouteTemplateInference:109`、`ActionContracts:17` | 影響小。這些檔案在主要的 JSP／Struts 解析流程已經讀過，讀不到時那邊會報診斷；這裡只會少了 JSF 警告、頁面名稱或條件式表單目標這類補充資訊。 |
| Struts 版本偵測 | `StrutsProjectAnalyzer:465` | 影響小。版本只用於說明文字；拒絕 Struts 2 是另外由 `StrutsFrameworkDetector` 判斷。 |
| 寫入或讀取記憶體中的 JSON、解析 URI 或數字 | 其餘 12 處 | 否。是預期中的 fallback（例如 evidence 的 detail 不是 JSON），或實際上不會失敗的序列化。 |

**結論**

健檢初稿估計這些地方會默默漏掉關聯，重新逐處確認後，主要失敗都已經有其他診斷涵蓋，因此降為低優先。

**建議做法**

日後格式化（HC-001）時順手處理：第二類讀檔失敗改為產生診斷，或至少在程式碼裡註明由哪個主流程負責報錯；第四類改成只接住實際會丟的例外型別（例如 `JsonProcessingException`、`IllegalArgumentException`），不再用 `Exception`。

## HC-003 [高] CI 的測試範圍有漏洞

**現況**

1. `screentrace-capture` 有 19 個測試檔，CI 逐一列出檔名，只列了 12 個；`package.json` 沒有 `test` script，Maven 也沒呼叫。以下 7 個檔案從加入以來沒有在任何自動流程執行過：
   - `animation-preview.test.mjs`（WP70，2026-10-18）
   - `batch3-markup.test.mjs`（WP72，2026-10-19）
   - `r16-jsf-placeholder.test.mjs`（R16，2026-10-11）
   - `r16-struts-messages.test.mjs`（R16，2026-10-11）
   - `react-preview-state.test.mjs`（R18 WP83，2026-10-25）
   - `template-fragments.test.mjs`（WP76，2026-10-20）
   - `template-preview.test.mjs`（WP70，2026-10-18）
2. CI 只在 `ubuntu-24.04` 上跑，但產品支援 Windows（`bin/screentrace.cmd`、winget 安裝）。
3. 沒有量測測試覆蓋率（沒有 JaCoCo 或 c8）。

**驗證**

2026-11-11 在本機執行上述 7 個檔案：共 26 個測試，全部通過，目前沒有因此藏住的壞掉功能。

**修正（R38 WP109，[ADR 0129](adr/0129-r38-run-every-capture-test.md)）**

- CI 改為 `node --test screentrace-capture/*.test.mjs`，之後新增的測試檔會自動被執行；本機以同一個指令執行，19 個檔案共 85 個測試全部通過。
- `react-preview-state.test.mjs` 需要 `screentrace-js` 的相依套件，因此把「Install JavaScript parser dependencies」移到 capture 測試之前。

**待辦**

- 加一個 Windows runner，至少跑 CLI 的路徑處理測試與一次完整分析。
- 加上 JaCoCo 覆蓋率報告，先只產出報告、不設門檻。

**進度**：R45 WP116 加上 Windows job 與 JaCoCo 覆蓋率報告；Windows job 第一次執行就找到 5 個 Windows 產品問題並已修正，見 [ADR 0136](adr/0136-r45-windows-ci-and-coverage.md)。

## HC-004 [中] 分析效能

**現況**（數字引用 ADR 0125，reservio：41 個畫面、66 個 API，完整分析 30.0 秒）

| 步驟 | 耗時 |
|---|---|
| 預覽擷取（Playwright） | 15.6 秒 |
| React 分析（graph 一次、預覽一次，依序執行） | 5.6＋5.3 秒 |
| 預覽封裝 | 0.8 秒 |
| Java 分析與報表 | 約 3 秒 |

- 預覽擷取在 `capture-static-jsp.mjs:388` 逐一畫面截圖，只用一個 page。
- R34（`feature/r34-analysis-performance-security`，e19d7f0）把兩次 React 分析改成同時執行，可省 5 秒且輸出逐位元組相同，但沒有合併到 main。
- Java 原始檔被多次解析：Spring adapter 有 `ParsedJavaUnits` 快取，但 `SpringServerValidation`、`parser-jsp` 的 `JavaSources` 與 Struts 的 `StrutsSources` 各自建立 JavaParser。Java 部分只佔約 3 秒，影響不大。

**建議做法**

1. 決定 R34 分支要合併還是關閉。
2. 預覽擷取改成多個 page 同時擷取，每個畫面的結果分開收集，最後依畫面順序合併，確保輸出順序不變。

**進度**（R47 WP118，見 [ADR 0138](adr/0138-r47-concurrent-preview-capture.md)）

- 更正：R34 的 React 預先分析（`feature/r34-react-preview-alongside`）已經合併到 main，上面「沒有合併」的描述不正確。
- 修改前的量測：80 個畫面的合成 Struts 專案，預覽擷取要 170 秒，超過 CLI 的 120 秒上限，所有畫面都沒有預覽。其中 106 秒是把完整的 computed style 傳回 Node。
- 已完成：樣式只傳回和預設值不同的屬性；同時開 4 個 page 擷取，結果依畫面順序合併。同一專案的擷取降為 48.7 秒，CLI 完整分析 91.3 秒且預覽完整；15 個 fixtures 的產物不變。
- 重新評估：JFR 取樣中 JavaParser 只占 Java 端約 1.4%，重複解析不是瓶頸。Java 端 35 秒主要花在線性搜尋：`PrototypeModelGenerator.relationshipFrom`（約 29%）、`JspTagFileExpander` 每個 tag 重新掃描整頁的 taglib 宣告（約 15%）、`MarkupGraphContribution.putEdge` 與 `UrlGraphContribution`。改為處理這些熱點（R48）。
- 待辦：CLI 的預覽擷取上限固定 120 秒，畫面再多時仍可能整段逾時；是否依畫面數放寬，之後再決定。

## HC-005 [中] 部分標記用 regex 解析

**現況**

AGENTS.md 要求不要以 regex 作為解析結構化語言的主要手段。regex 用量：`StrutsProjectAnalyzer` 32 處、`JspProjectParser` 11 處、`SpringMvcAnalyzer` 8 處。已確認的例子：

- `StrutsProjectAnalyzer:108`：用 regex 在 `web.xml` 找 `FacesServlet`。同一個檔案的 `readFacesServletMappings`（第 133 行）已經用 XML parser 讀過一次，兩處邏輯重複。
- `StrutsProjectAnalyzer:119`：用 regex 解析 JSP 的 taglib 宣告。專案已經有 `MarkupTag.scan`。
- `StrutsProjectAnalyzer:1325-1329`：用 regex 移除註解，再抓 `<title>`、`<h1>`。

其他地方還沒逐一確認，其中不少可能只是字串清理。

**建議做法**

逐一確認；用於 XML 的改用 `StrutsSources.xml`，用於 JSP／HTML 標記的改用 `MarkupTag.scan`，並用 fixture 驗證結果不變。

**進度**：R46 WP117 把 7 處讀結構的 regex 改用 parser，fixture 產物不變，見 [ADR 0137](adr/0137-r46-parse-markup-instead-of-regex.md)。`JspProjectParser` 的 `c:url` 前處理仍用 regex 改寫原始碼，留待之後。

## HC-006 [中] 擴充架構與文件不一致

**現況**

AGENTS.md §6 描述了 `AnalysisAdapter` 介面，但它只存在於文件。實際上是由 `SpringProjectAnalyzer.analyze` 與 `ScreenTraceCli` 用 if 判斷技術訊號，來決定呼叫哪個 analyzer。

**影響**

之後新增 Angular、Vue 等框架時，必須修改這些判斷與 CLI，不能只是加一個新的 adapter。

**建議做法**

等到真的要新增第三種框架時再抽出介面；在那之前，維持 AGENTS.md 目前「概念性介面」的說明即可。

## HC-007 [低] 建置工具鏈

- 沒有 Maven Wrapper（`mvnw`），本機和 CI 的 Maven 版本可能不同。
- 三個 Node 套件都沒有宣告 `engines`：README 要求 Node 18+，CI 用的是 Node 22，兩者之間的版本沒有任何測試。
- Playwright 固定在 1.55.1，導致 CI 只能用 `ubuntu-24.04`。

**進度**：R43 WP114 已完成：Maven Wrapper 固定 Maven 3.9.11；Node.js 最低版本改為 22 並宣告 `engines`；Playwright 1.63.0，CI 改用 `ubuntu-26.04`，見 [ADR 0134](adr/0134-r43-toolchain-versions.md)。

## HC-008 [低] 文件維護成本

目前 `docs/adr/` 有 128 份 ADR，ROADMAP 也常有同一個 WP 驗證多次的紀錄，新人要讀很多份才知道現況。建議定期整理一份「目前有效的決策」摘要，並標出哪些 ADR 已被取代。

## HC-009 [低] 分析產物含本機絕對路徑

R39 比對格式化前後的產物時發現：`static-preview/element-styles.json` 的 `background-image` 會寫入擷取當時的本機絕對路徑（例如 `url("file:///Users/<帳號>/…/analyze/<專案>/static-preview/assets/…")`），樣式 ID 是內容的雜湊，因此同一個專案輸出到不同目錄時，樣式 ID 也不同。單一 HTML 報表與 `viewer-documents.json` 不受影響（兩個目錄的結果逐位元組相同），所以本機路徑不會出現在交給需求方的報表裡。建議擷取時把這類 URL 改寫成相對於分析目錄的路徑。

**進度**：R42 WP113 已完成，capture 改記 `st-preview-file:<相對路徑>`，報表端沿用原本的邊界檢查，見 [ADR 0133](adr/0133-r42-output-relative-style-resources.md)。
