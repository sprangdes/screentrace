# ADR 0032：合成來源整合與同環境決定性

日期：2026-10-04。狀態：採用。

## 背景

需求方限定 WP10 為四項：五類自行撰寫的合成來源、決定性、完整離線還原 E2E、操作文件。暫不做效能調校、格式化規則與舊相容清理；不得修改既有斷言。

## 選項

1. 使用模擬 graph／替換 HTML payload，測試容易隔離，但無法證明 parser→CLI→capture→viewer 的銜接。
2. 使用實際 CLI 產物，把來源與使用者工作區隔離，再由 Node 與瀏覽器直接消費。

## 決定

採 2。fixtures/wp10 自行撰寫四類 source-only 專案與拒絕專用 Struts 2；不解析或複製第三方實作，辨識用 JS 僅保留自行撰寫的名稱標記。coverage.json 逐條列來源／token，搭配 graph 的全種類元件／行為、三層檢核、Dispatch 系列、Tiles、managed Action、契約、歧義、未知呼叫、動態對抗性與來源證據斷言。

SyntheticProjectIntegrationTest 複製完整 fixture 到暫存 user.home 下的專案區，使用隔離的工作區設定與 library import 指令綁定 sample。以反射呼叫現有 CLI 的私有 analyze 入口，保留正式 adapter／capture／pack／report 路徑；只略過互動選單和啟動桌面瀏覽器，無須新增正式測試入口。測試結束還原 user.home；每份副本與原 fixture SHA 相同且前後不變。

同來源在同一程序連續分析兩次。graph、preview-model、viewer-documents、單一 HTML 全部逐 bytes 比對，不排序或忽略輸出欄位；預覽限相同 Chromium／字型／viewport。Node 正式共用 md 模組使用兩份原始 payload，僅 generated_at 可不同。這不宣稱跨作業系統截圖位元組相同。

新增 *.e2e.mjs 直接開啟 Java 產物的 file:// URL，四類各在 Chromium／Firefox／WebKit 標記畫面與元件、指定元件庫覆寫、下載 md、清 localStorage、匯入、驗證決策／覆寫與再匯出 bytes。監看對外請求與 JS 探針；不執行任何目標服務。使用指南截圖來自該測試的合成畫面，不含真實專案內容。

## 後果

E2E 依賴 mvn verify 先產生 target/wp10-fixtures。現有 security.yml 已先 Java 後三引擎 E2E 且包含 npm audit／Dependency-Check，無需新增 CI 工作；本輪不擴張需求方範圍。無新相依、正式執行碼、格式契約或既有斷言變更。既有聚焦測試繼續驗證大小拒絕及特殊反例。

測試先確認 fixture／實際產物缺少而失敗；後續反例揭露 fixture 的單行註解吞掉 minified JS、managed Action 必須使用既有 bean-name 解析形式，以及新測試需使用完整 review state 契約。修正的是新 fixture／測試輸入，沒有放寬既有斷言。多 context 的設定證據保持已確認；配對結果另以 AMBIGUOUS 證據檢查，兩個候選都須保留。
