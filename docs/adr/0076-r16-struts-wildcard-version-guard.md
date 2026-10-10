# ADR 0076：R16 Struts 萬用字元順序與版本證據

## 狀態

已採用，依 OQ-032 方案 A。

## 背景

WP54 要求完全相符的 action path 優先，其餘萬用字元 mapping 依設定順序採最後一個符合項；但此行為只在能從專案建置檔或函式庫證明 Struts 為 1.3.x 時採用。若版本未知或非 1.3.x，且第一個與最後一個候選不同，分析器不得猜測。

## 決定

- 分析器以有界唯讀掃描檢查 Maven POM、Ant 建置設定與已存在的 Struts JAR 名稱。只有唯一且明確的版本證據可作為版本判定；多個互相矛盾的版本證據視為未證明。
- 完全相符路由優先於 wildcard。Wildcard 候選保留 `struts-config` 順序；能證明 Struts 1.3.x 時採最後一個符合 mapping。版本未知或非 1.3.x 且首末不同時，對兩個端點各保留 `AMBIGUOUS` 呼叫關係，列出 mapping、來源位置、具體 path，並輸出 `STRUTS_WILDCARD_VERSION_UNRESOLVED`。首末相同時正常解析。
- 常值連結的 caller evidence 明確記 `basis=STATIC_URL`；Wildcard mapping 仍以 mapping pattern 為 endpoint，並累積全部具體 `matchedPaths`。
- `STRUTS_WILDCARD_VERSION_UNRESOLVED` 在檢視器顯示「萬用字元路由版本未能證明」。

## 官方實作核對

R15 已驗證的 Apache Struts 1.3.10 原始碼顯示：

| 原始檔 | 行號 | 判定依據 |
|---|---:|---|
| `src/core/src/main/java/org/apache/struts/config/impl/ModuleConfigImpl.java` | 285–311 | `addActionConfig` 將每個設定依讀取順序 append 至 `actionConfigList`。 |
| 同上 | 465–469 | `findActionConfigs()` 直接以 `actionConfigList.toArray` 回傳，因此順序仍是設定檔順序。 |
| `src/core/src/main/java/org/apache/struts/config/ActionConfigMatcher.java` | 63–92 | Matcher 依傳入的 `ActionConfig[]` 順序建立 `compiledPaths`。 |
| 同上 | 117–129 | `match()` 逐一檢查；每個符合項都覆寫 `config` 且不提早結束，所以最後一個符合項生效。 |

目標樣例的 Maven POM 明確宣告 Struts Apps parent 版本 `1.3.10`，例如 `mailreader/pom.xml:25` 與 `scripting-mailreader/pom.xml:25`；版本判定來自專案檔案，不以目前稽核用的下載目錄或外部環境推斷。

## 測試證據

新增的合成測試先於實作提交：

| 測試 | 失敗測試提交 | 實作前結果 | 修正後 |
|---|---|---|---|
| `struts13UsesLastMatchingWildcardWhenSpecificMappingFollowsCatchAll` | `63d50b1` | 版本 1.3.10、`/*` 在前、`/Edit*` 在後時，呼叫來源未連至最後的 `/Edit*` endpoint。 | `/Edit*` 收到 `/EditUser.do`，caller confidence 為 `CONFIRMED`，evidence 含 `basis=STATIC_URL`。 |
| `struts13UsesLastMatchingWildcardWhenCatchAllFollowsSpecificMapping` | `63d50b1` | 版本 1.3.10、`/Edit*` 在前、`/*` 在後時，呼叫來源未連至最後的 `/*` endpoint。 | `/*` 收到 `/EditUser.do`。 |
| `unknownStrutsVersionMarksDifferingFirstAndLastWildcardMappingsAmbiguous` | `63d50b1` | 未知版本時只選到一個候選，沒有版本不足診斷。 | 首末兩個端點都保留 `AMBIGUOUS` 關係，診斷完整列出候選 mapping。 |
| `exactRouteWinsBeforeLastMatchingWildcardAndStruts13UsesConfigurationOrder` | `3df8303`（OQ-028 授權更新的 R16 新測試） | 舊預期錯把第一個 wildcard 視為 Struts 1.3 選擇規則。 | 精確 action 仍優先；對兩個 wildcard 的重疊路徑採 Struts 1.3.x 最後符合項。 |
| `struts13UsesLastMatchingWildcardWhenSpecificMappingFollowsCatchAll` caller evidence assertion | `687da70` | 關係未提供 `basis=STATIC_URL`。 | 常值連結證據含 `basis=STATIC_URL`。 |

`63d50b1` 的修正前測試執行結果為 7 項中 3 項失敗；`687da70` 的修正前執行結果為 7 項中 1 項失敗。修正後 `StrutsR16WildcardRoutingTest` 與 `StrutsR16ForwardInheritanceTest` 共 13 項通過。

## 後果

Struts 1.3.x 專案遵從官方 wildcard 規則；其他版本或無版本證據的重疊 wildcard 不會被靜默擇一。若無法證明版本，診斷與兩個候選關係會讓使用者看見實際不確定性。

## WP54 OQ-032 實際樣例核對

`mailreader/pom.xml:25` 與 `scripting-mailreader/pom.xml:25` 都直接宣告 `struts-apps` parent 為 `1.3.10`，所以兩者適用最後符合規則。實際圖中 `mailreader` 的 `/Edit*`、`/Save*`、`/Delete*` 分別收集 `/EditRegistration`、`/EditRegistration.do`、`/EditSubscription`；`/SaveRegistration`；`/DeleteSubscription`。`scripting-mailreader` 的 `/Edit*` 與 `/Save*` 分別收集相同 Edit 路徑集合與 `/SaveRegistration`。

需求方要求 `scripting-mailreader /Delete*` 也為使用中，但原始碼的可執行連結 `Registration.jsp:167` 指向 `/EditSubscription?task=Delete`，該 concrete URL 依 Struts matcher 命中 `/Edit*`。刪除分支在 `WEB-INF/scripts/SaveSubscription.gv:80–86`，屬於 `/SaveSubscription.do` 的處理內容。`/DeleteSubscription` 只出現在 `tour.html:1914、1970` 的 escaped code example；不能視為實際 link。`/Delete*` 設定的 `Delete{1}.gv` 對應檔案亦不存在。本 ADR 不把任務參數或文件範例改寫成另一個 HTTP endpoint；此差異記錄於 OQ-033，待需求方決定如何修訂驗收。

8 模組本輪重跑亦發現 `examples/exercise/html-img.jsp:48` 的 `html:img action` 與 `faces-example2/index.jsp:23` 的 JSP `jsp:forward` 有明確來源但未建成 caller。前者為 page-load image request，後者不是 Struts action forward；它們與 OQ-032 wildcard 選擇無關，已在 R16 報告與 OQ-033 明列。JSF／Struts-Faces tag 仍依 OQ-026 排除，不改既有規則。
