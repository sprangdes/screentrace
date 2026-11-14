# ADR 0144：R53 修正 2026-11-14 code review 的 P1 項目

## 背景

[CODE_REVIEW_20261114](../CODE_REVIEW_20261114.md) 列出 11 項 P1。逐項重現後，9 項成立、1 項不成立（RV-006）、1 項影響比記錄的小（RV-009）。其中三項的修法會改變對外行為，需要記錄決定。

## 決定

- R53-1（RV-010）：CLI 的用法錯誤與元件庫指令錯誤都只印一行訊息，不印 stack trace。
  - 用法錯誤與無效的 `library` 指令或選項：exit 2。
  - `library` 讀寫失敗：exit 1，訊息不含路徑（`LibraryCommands.FailedException`）。之前印在 stdout 且 exit 0。
- R53-2（RV-005）：每次分析在寫完 `application-graph.json` 後、產生預覽前，先刪除上一輪的 `static-preview/`、`screenshots/`、`viewer-documents.json`（`ScreenTraceCli.clearPreviewOutputs`）。
  - 報表依「檔案是否存在」決定載入哪些預覽，所以擷取逾時、失敗或本次不需擷取時，不能留下舊檔。
  - 其中有符號連結時拒絕並停止，不跟隨、不刪除連結目標。
- R53-3（RV-007）：Struts 2 偵測遇到無法解析的檔案時，先掃描檔案原始位元組。
  - 偵測器檢查的每一種 Struts 2 訊號（import、型別、package、Maven 依賴、Gradle）都含有 `struts2` 字樣；檔案完整讀完且不含此字樣（不分大小寫），就不可能是 Struts 2 訊號，略過即可。
  - 含有此字樣或讀取失敗時，維持原本的 `FRAMEWORK_DETECTION_UNRESOLVED` 並停止分析（fail closed）。
- 其餘 P1 修正不改變對外契約：
  - RV-001：`bin/screentrace setup` 依 `required_node` 安裝 `node@22`。
  - RV-002：`RelationshipsByFrom` 覆寫 `remove`、`clear`；`from()` 只回傳仍在 map 中的關聯，經由 `entrySet().removeIf` 等檢視刪除的邊不會再被查到。
  - RV-003：`if (count==1) stmt;` 不加大括號時與加大括號的寫法同樣分析，不再拋 TypeError。
  - RV-004：viewer 存在 `:library-transfer` 暫存時，每次儲存都一併更新，舊快照不會蓋過之後的決策。
  - RV-008：位於專案根目錄的 JSP 以空的上層目錄解析相對路徑。
  - RV-009：Tiles 畫面的標記投影以 `tilesDefinitionName` 找 definition。Struts adapter 本身已建立 CONTAINS 邊，所以修正前遺失的是標記層的證據、guard 與 repeated 資訊。
  - RV-011：`mvc:resources` 的 `mapping` 含 `.`、`..`、空段或反斜線時不採用；XML 註解內的設定不採用。

## 後果

- 腳本與 CI 可以依 exit status 判斷 `library` 指令是否成功。
- 重新分析一定反映這一輪的預覽；擷取失敗時畫面會明確標成沒有預覽，而不是顯示舊內容。
- 驗證：每項修正都有新增測試，且已確認在修改前失敗（RV-001 為啟動腳本，未加自動測試）；JS 181、capture 94、viewer 單元 149、Maven 全數通過。viewer e2e 118 個中「500 個畫面 3 秒內首次繪製」在 sandbox 負載下逾時一次，單獨執行時修改前後都通過。
