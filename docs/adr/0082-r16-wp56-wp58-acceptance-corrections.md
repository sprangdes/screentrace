# ADR 0082：R16 WP56–WP58 驗收補正

- 狀態：已採納
- 日期：2026-10-11

## 背景

R16 最終驗收 §8.1 指出一般 HTML DispatchAction 參數、Struts-Faces message、JSF 混合頁面辨識、FacesServlet suffix、以及 wildcard ActionConfig 繼承代入仍有缺口。§8.2 要求每項先以自行撰寫 fixture 鎖定，再以八個唯讀官方範例的實際 graph 驗證。目標原始碼僅供唯讀分析；沒有建置或執行目標程式。

## 決定

1. DispatchAction 從同表單的一般 HTML `input`、`button`、`select` 收集常值參數；多值保留完整候選並標示歧義。若 Action 類別原始碼可讀，輸出方法存在性；無法讀取類別時不推測。
2. JSP `s:message` 與 `bean:message` 共用訊息資源解析；key 無法解析時顯示 `（訊息 key：<key>）`。原始 tag、`data-st-` 及其衍生標籤不得成為報表可見文字。八份報表以結構性 E2E 掃描文字、title、alt、aria-label。
3. 畫面本身、Tiles 版型或片段 JSP 含 JSF tag 時，相關頁面定義畫面標記 `unsupportedComponentFramework=JSF`，並在可疑首頁卡片提示「使用 JSF，未分析」。不解析 JSF 元件或其行為。
4. 只有唯一、可證明的 FacesServlet suffix mapping 才將 JSF URL 正規化。`javax.faces.DEFAULT_SUFFIX` 未設定時採 JSF 預設 `.jsp`；`.faces` 只在 mapping 可證明時轉成實際 JSP。無 mapping 或存在衝突時保留未解析並診斷。
5. Wildcard ActionConfig 先解析 extends 繼承，再以實際路徑代入繼承後的 action 屬性與 forwards。Struts 1.3.10 `ActionConfigMatcher.convertActionConfig` 對 `name`、`type`、`roles`、`parameter`、`attribute`、`forward`、`include`、`input`、`catalog`、`command`、`multipartClass`、`prefix`、`suffix` 執行 `convertParam`，行號為該檔 159–177；每個 local forward 的 `path`、`command`、`catalog`、`module` 與 properties 代入見 179–204。exception config 複製而不轉換，見 206–210。`ModuleConfigImpl.findActionConfigs()` 以 `actionConfigList.toArray` 原序回傳，行號 465–468，故設定檔順序保留。

上述行號依 repo 外唯讀來源 `/private/tmp/r15-struts-audit.QxHhW3/source/struts-1.3.10/src/core/src/main/java/org/apache/struts/config/ActionConfigMatcher.java` 與 `.../config/impl/ModuleConfigImpl.java` 核對；未複製或執行範例程式。

## 失敗測試與 golden

補正先提交了測試：`100ff36`（WP56 驗收缺口）、`f729418`／`c3ee277`（一般 HTML DispatchAction 來源）、`f2178ea`（八份報表可見文字）、`9c3d1d2`／`4336ce5`／`0fc3968`（Faces suffix 與 Tiles 界線）。這些測試在對應實作前均用舊行為驗證失敗；其中結構 E2E 曾實際檢出惡意 screen/component 名稱中的 `<s:message>` 與 `data-st-`，修正後八份剛產生的真實報表及惡意 fixture 均無違規。

依 OQ-031 的 Struts 數量欄位授權，`real source fixtures produce identical graph, packed HTML and shared-module md on consecutive runs` 的唯一 golden 差異為：

| 測試 | 欄位 | 舊值 | 新值 | 原因與來源 |
|---|---|---:|---:|---|
| `real source fixtures produce identical graph, packed HTML and shared-module md on consecutive runs` | `fixtures/wp10/golden/struts1-spring.summary.json` → `behaviors_by_type.NAVIGATE` | 24 | 25 | `page.jsp:27` 的「存檔」連結 `/save.do` 現在依可證明的 `*.do` mapping 對應至 `ANY /save.do?op=save`，並保留 `CONFIRMED` 方法與 mapping evidence。新期望在更新前的 E2E 以 24 對 25 失敗；其他 golden 欄位未變。 |
| `real source fixtures produce identical graph, packed HTML and shared-module md on consecutive runs` | `fixtures/wp10/golden/struts1-spring.summary.json` → `behaviors_by_type.SUBMIT_FORM` | 16 | 19 | 三個實際表單的靜態 dispatch 參數現在另外保留方法分派行為：`page.jsp:27` `/save.do`、`:28` `/lookup.do` 的 `op=save`，以及同列 `/mapping.do` 由 mapping `parameter="save"` 指定的方法。三個方法分派候選各增加一個 `SUBMIT_FORM`，其餘表單行為與其他 golden 欄位不變。更新前的 E2E 實際以預期 16、實際 19 失敗；差異為本輪 Struts 分析行為數量，依 OQ-031 授權。 |

OQ-034 的實作補正保留每個 Tiles definition 的 VIEW 節點。`child` 這類繼承定義保留來源設定的 `view` 字串及解析後 `resolvedView`，並帶 `extends` 屬性；子版型到父版型以 `INCLUDES` 關係與 `Tiles definition extends=<父名稱>` evidence 表示。頁面判定仍依 OQ-029：被 extends 的 definition 不成為 SCREEN。R16 新增的 `StrutsR16TilesBoundaryTest.extendedTileDefinitionRemainsAsAuditableNonScreenNode` 先在實作前失敗（`view` 預期 `/WEB-INF/jsp/layout.jsp`，當時輸出已解析路徑 `src/main/webapp/WEB-INF/jsp/layout.jsp`），修正後與既有 `StrutsCompletenessTest.expandsInheritedNestedTilesAndJspTileInsert` 均通過；既有測試與 fixture 未改。

依 OQ-028 調整 R16 新增的 `facesSuffixMappingResolvesTilesLayoutAndCountsItsJsfTagOnThePageDefinition`：舊斷言禁止任何 SCREEN 使用 `layout.jsp` 作 view，會誤傷正常的 `.home` 頁面（它共用 `.base` template）；新斷言只禁止 `.base` 成為 SCREEN，並分別確認 `layout.jsp` 沒有自身的隱含 SCREEN ID。`.base` 的 VIEW 節點、正規化後路徑與 `.home → .base` extends 關係皆保留。

## 實際範例驗證

- `examples` graph 的 `dispatch/dispatch.jsp:63、68、73、78` 四個 submit 行為分別為 `dispatch-submit；分派到 doFoo`、`doBar`、`doInvalid（類別中找不到此方法）`、`execute（類別中找不到此方法）`；類別原始碼可讀，故後兩者標出方法不存在。
- `mailreader` `/SaveRegistration` 依繼承後 `name="{1}Form"` 代入為 `RegistrationForm`。五條 RegistrationForm 規則皆有 `StrutsValidatorFieldBinding=CONFIRMED`，綁至 Registration 畫面 `screen:d7e0cd04-a406-3009-ae21-511e65c67f2f` 的元件；全模組 `VALIDATION_RULE_UNRESOLVED` 診斷由 17 降至 12。
- 八模組實測的 `VALIDATION_RULE_UNRESOLVED` 剩餘值為 `blank=12`、`cookbook=36`、`el-example=0`、`examples=43`、`faces-example1=18`、`faces-example2=18`、`mailreader=12`、`scripting-mailreader=12`。Mailreader 的 12 筆逐項在 R16 報告列出；它們是 `validation.xml` 第 37、44、81、89、98、106、118、125、132 行所用的 `required`／`minlength`／`maxlength`／`email` 規則，其 ValidatorPlugIn 指向 Struts 函式庫資源 `/org/apache/struts/validator/validator-rules.xml`，此資源不是目標專案檔案，因此規則定義仍未由專案來源證明。欄位綁定已確認與規則定義可解析是兩項不同結果。
- `faces-example1` 有 5 個使用 JSF 的畫面；`faces-example2` 有 7 個頁面定義畫面。其畫面與檔案依據、`/layout.faces` 到 `layout.jsp` 的 mapping 證據，以及不再另建 `layout.jsp` 畫面的結果列於 R16 報告。
- eMusicStore（無／有 `/eMusicStore`）與 PetClinic 的 graph SHA-256 分別維持 `0253e9f…1590`、`490f741…0353`、`6bee8b1…ec99`，與 R16 基準逐位元組相同。

## 後果

WP56–WP58 的要求以來源證據呈現；未解析的 validator 規則仍保留診斷，不因欄位已綁定而升級信心。測試／報告中的 Struts 範例只作靜態輸入，分析器不執行目標程式。
