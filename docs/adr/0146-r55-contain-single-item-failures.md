# ADR 0146：R55 單一檔案或項目出錯只影響它自己

## 背景

[CODE_REVIEW_20261114](../CODE_REVIEW_20261114.md) 的「跨模組主題 3」：多處以一個大範圍的 `try` 包住整個迴圈，任一檔案或項目出錯就丟棄同一迴圈的其他結果，有時也不留診斷（RV-217、RV-220、RV-404、RV-414、RV-421、RV-511、RV-602；RV-007 已於 R53 處理）。

## 決定

- R55-1：錯誤範圍縮小到出錯的那一個檔案或項目，並留下指出位置的診斷；其餘項目照常處理。
  - Spring Web Flow（RV-220）：每個 `flow-location` 各自成功或整筆撤回（先保存 nodes／edges／behaviors／diagnostics，失敗時還原），診斷 `FLOW_UNRESOLVED` 指向 registry 中該行。
  - Thymeleaf 片段（RV-404）：片段範本不存在或無法讀取時，只略過該次 `th:replace`，診斷 `TEMPLATE_FRAGMENT_UNRESOLVED` 指向呼叫行並寫出範本名稱。
  - JavaScript 分析輸出（RV-414）：不認得的行為類型只略過該行為（`JS_BEHAVIOR_UNSUPPORTED`）；不認得的 status 視為 UNRESOLVED，不當作證明。React 的 status 解析共用同一規則。
  - React 畫面（RV-421）：route 不是 `/` 開頭時只略過該畫面（`REACT_ROUTE_UNRESOLVED`）。
  - React 預覽樣式表（RV-511）：超過大小上限或無法讀取的樣式表回報 `REACT_STYLESHEET_UNREADABLE`，其他樣式表照常套用。
  - viewer 的 CSS 資源（RV-602）：`@import` 循環時，只把重複出現的那個引用換成空資源，不再拋例外讓所有畫面的預覽失敗；解析結果依資源快取。
- R55-2：需要「全部讀到才能證明」的推論維持 fail closed，但縮小範圍並說明原因。Spring Security 外部呼叫（RV-217）要證明專案只有一條 security chain：讀不到的檔案若原始內容不含 `SecurityFilterChain`（Java）或 security namespace（XML），就不可能是另一條 chain，直接略過；否則仍不標記外部呼叫，並回報 `EXTERNAL_CALL_UNRESOLVED` 指出是哪個檔案。原始內容的比對抽成 `SafeProjectFiles.mayContainAscii`，R53 的 Struts 2 偵測（RV-007）也改用它。

## 後果

- 一個壞掉的檔案不再讓整個 flow registry、整個 Thymeleaf 頁面、全部 JS 行為、全部 React 畫面或整次預覽擷取失效，報告也會指出是哪一個。
- 驗證：每項都新增測試，除 RV-414、RV-421 以單元測試驗證輸出解析外，皆已確認在修改前失敗；JS 181、capture 96、viewer 單元 150、viewer e2e 118、Maven 全數通過。
