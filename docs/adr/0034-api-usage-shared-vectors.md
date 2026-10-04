# ADR 0034：API 狀態 null 目標與跨語言一致性向量

日期：2026-10-04。狀態：採用（需求方授權的小修正）。

## 背景與選項

ADR 0033 記錄 Java ApiUsage 對 CALL_API 的 null target 查詢 TreeMap 時丟出例外。TypeScript 已略過這類目標，但兩份實作沒有共同預期資料。可只修例外並各自維護測試，或保留架構、以同一份明確向量檢查兩者；需求方指定後者。

## 決定

Java 在行為與關聯的 callers.containsKey 前檢查目標非 null；所有 callers.get 均位於相同非 null 與已知端點分支內，不對 null 鍵查詢 TreeMap。未知／null 目標不建立 API 呼叫來源，不改寫或刪除原圖的 UNRESOLVED 行為。有效呼叫仍保留；沒有來源的端點維持 UNREFERENCED，不代表授權移除。

共用資料為 docs/examples/api-usage-vectors.json，format_version 1：graphs 是具名合成圖，cases 指向圖並列 screenDecisions、以 screenId → componentId 分組的 componentDecisions、規則編號與 expected。expected 列所有端點、狀態及排序後的完整呼叫來源；缺少元件／行為的來源欄位明確為 null，TypeScript 僅在比較邊界將 undefined 正規化為 null，不改正式實作。預期值明確簽入，不由任一實作生成。

18 個案例涵蓋 R-API-1～6：null 目標獨立／與正常呼叫並存、共用元件不同畫面 KEEP／REMOVE／UNDECIDED／缺省決策、所有來源移除、畫面移除繼承（保留明確 KEEP 決策）、載入時來源、未解析綁定來源、子回呼、簡化邊與 canonical 行為去重、null CALLS／TRIGGERS 目標，以及無來源 API 不可因畫面決策變 REMOVABLE。null 邊是函式防禦性測試資料，不宣稱通過嚴格圖完整性驗證。

Java ApiUsageTest 與 viewer api-usage-vectors.test.mjs 讀取同一檔案，逐案例完整比對狀態與來源，檢查 R-API-1～6 覆蓋及決策輸入未被修改。測試尋找 pom.xml 與 screentrace-core 的來源根目錄，不依賴 .git。日後修改規則，必須同步審查向量預期與兩端測試，不能單獨修改一份實作的預期以消除失敗。

## 後果與驗證

保留兩份正式實作，新增 ROADMAP 技術債，向量為一致性依據；沒有新相依、schema 變更或既有斷言修改。先新增測試，Java 11 tests 中新增的 4 tests 以 NullPointerException 失敗，既有 7 tests 通過；TypeScript 同一向量通過，再修 Java 兩處查詢。ADR 0033 當時「尚未修正」的紀錄保留，本決定修復該問題。
