# ADR 0048：報表專案路徑與導向文案補強

依需求方 WP23 前補強授權，只從單一 HTML 資料投影的 graph.application 去除 path，名稱與 technologies 保留；canonical graph 與分析輸出不改。調查 md、元件庫比對／来源、搜尋、導覽與 review 沒有直接使用此欄位。分析指紋原本雜湊整份 canonical graph，仍在去除欄位前以原圖計算，維持既有暫存與 md 狀態還原。沒有需要改動的欄位相依入口，因此不用另選遷移方案。

新合成測試以實際 TempDir 專案根作 application.path，全文掃描實際專案根、輸出根、user.home、file://、/Users/ 與 Windows 使用者路徑及 JSON 跳脫形式；同時驗證 canonical graph bytes 與原指紋不變。前次樣式隱私測試的圖 path 為 `.`，無法覆蓋本案例；本次補足此缺口。失敗測試先提交 df41cca，原實作因專案根洩漏失敗。

導向列已經有具體「前往畫面」摘要，不再重複顯示「前往其他畫面」文字。原 NAVIGATE 行為詳情按鈕改為資訊圖示，aria-label 為「查看導向細節」，保持 data-behavior 與選取／證據入口；新增 E2E 先在舊實作失敗。既有斷言／golden 不改。

原有 67 E2E 連續 20 次全部通過，詳見 R5。未重現使用者的單次失敗，不把尚未查明的原因宣稱已修復；沒有以增加固定等待或放寬斷言消除失敗。
