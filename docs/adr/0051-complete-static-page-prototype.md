# ADR 0051：WP25 完整靜態頁面檢視與離線事件邊界

## 決定

預設卡片選取改為完整頁面；原中央畫面與關聯目的保留於「流程視圖」，再按「查看完整畫面」返回。沿用單一 sandbox=allow-same-origin iframe，不加入 allow-scripts。寬度為capture記錄值、高度至少為記錄高度與實際內容高度，中央捲動、縮放只在父頁進行。以父頁WAAPI做300ms FLIP；reduced-motion直接切換。返回總覽還原canvas平移縮放。PrototypeHistory只在記憶體保存畫面與捲動；返回／前進／重置不修改graph、review、md或瀏覽器URL。

元素點選保留右側樣式／來源與外框；連結及送出全數攔截，只顯示提示，WP26未開始。圖中可前往的目的另列縮圖，與全站導覽分組；不靠文字或DOM順序猜配。資料缺失有明確占位，不補造內容。無新相依或schema修改。

## 安全實測與補強

只加iframe CSP仍不足以達成嚴格零請求：DOMParser的離線文件會預載圖片；CSS雖被CSP阻擋，Playwright仍收到about:srcdoc的stylesheet/image請求事件。新增探針先取得失敗，不放寬零請求斷言。

inert-document在DOMParser之前中和抓取屬性，之後只還原嵌入圖片與data CSS；HTML結構仍交DOMParser解析。preview移除腳本、事件屬性、嵌套frame/object與meta/base。offline-css沿用本專案pack-preview的資源token掃描（含CSS escape），中和外部url、image-set字串及import，遞迴處理嵌入data CSS（深度上限20，超過中和）；其他CSS交瀏覽器解析。保留data圖片、字型、樣式；CSP仍只允許這些離線資源，script／connect／form／frame均none。單元測試證明嵌入CSS內遠端URL也被移除，E2E含script、onclick、javascript連結、遠端圖片、stylesheet/import/background/image-set、iframe/object，全數零腳本執行及零HTTP請求。

## R6 §3 呈現／互動測試適配

以下只增加明確的「流程視圖」進入步驟，全部原有資料／證據／安全／決策／md及決定性斷言保留。舊預期皆為選取畫面立即出現既有流程結構，新預期為先完整頁面、再明確切換流程；原因為WP25的預設檢視器要求。沒有刪除fixture或golden。

| 檔案 | 逐處測試名稱 |
|---|---|
| details.e2e.mjs | focus links, tooltip overflow, back, API/behavior detail and all-element style clicks；screen panel includes standalone markup validation without a JavaScript behavior；ambiguous behavior details retain every candidate and evidence instead of selecting one；focused relation is a visible SVG line with URL tooltip and direct navigation；focused page without outgoing destinations shows an explicit empty state；screen information is readable by requesters and component details trace API/navigation；default panel hides ambiguous candidate IDs and explicit selection reveals all readable candidates and evidence；ordinary preview elements expose captured computed styles on selection |
| r4-canvas.e2e.mjs | UI2 fits and centers cards, separates tools and only shows review icons in review；focused preview starts in the visible canvas at 1440 and 1024 widths；focus relation hover emphasizes the thin edge and both endpoints |
| r4-responsive.e2e.mjs | UI5 fits every focused destination without horizontal scrolling and uses responsive details drawers；UI5 real keyboard covers slash, previous screen, modal Escape focus return and complete Tab sequence |
| r5-endpoints.e2e.mjs | WP22 navigation says destination and URL, forms submit, while API tab contains only proven APIs |
| wp16.e2e.mjs | WP16 chromium full requester flow: struts1、struts1-spring、spring-mvc-jsp、spring-boot-jsp（四類）；WP16 150-screen and 600-relation report records overview, focus and search timings |
| wp18.e2e.mjs | WP18 source fixture offline map exposes submit success, validation return and all search branches |
| wp20.e2e.mjs | WP20 overview global toggle, grid, incident highlights and focus navigation groups |

另兩處返回刺激變更：r4-canvas的UI2測試、r4-responsive的real keyboard測試，由目的畫面按Esc回前一頁→Alt+ArrowLeft回前一頁，原「甲」名稱斷言保持不變；WP25規定Esc回總覽，新增WP25測試驗證此規則。抽屜Esc／焦點返回測試原封保留。performance.e2e的原3000ms門檻保留，額外加R5 278ms×3=834ms門檻。

## 舊實作失敗證明

f87afaf先提交歷史單元及兩個完整頁E2E失敗測試：缺少history模組，舊畫面沒有prototype-viewer，兩項超時失敗，見/private/tmp/wp25-red-history.log、wp25-red-e2e.log。d086fbf提交額外CSS失敗探針；原實作雖CSP阻擋，請求清單仍含import/background，見wp25-final-probes.log；缺少offline-css單元見wp25-css-red.log。

以保存的WP24報表（新prototype實作前）搭配同一fixture再驗證：舊流程存在，但「流程視圖」入口不存在；Alt+Left不返回甲，仍為乙。兩個新互動預期都失敗，紀錄/private/tmp/wp25-updated-interaction-red.log。未以修改原資料斷言取得通過。

完整驗證及真實容量／操作觀察見reports/R6.md。WP25後停止；彈窗、API提示、表單模擬與覆蓋率待WP26，不宣稱已完成。

追加驗證：e3bfdfe的＋／－測試先失敗（select的`.75`與程式設定的`0.75`不符，比例成0），修正為尋找數值相符的實際option。一次全套重跑暴露原review E2E查詢競態（71過／1失敗）：srcdoc元素已解析但load回呼尚未寫data-review-status。6c5206c以延遲1000ms的合成load回呼先重現失敗，隨後把純呈現確認標記在srcdoc交付前建立；決策推導／保存及既有review斷言不變。原review測試及新增延遲測試均重跑，見R6最終驗證；沒有隱藏失敗或加入固定等待放寬斷言。

將標記移前後，完整驗證另暴露既有capture路徑`body>c:param[1]>a:nth-of-type(1)`不是合法CSS selector：原先load回呼內只中斷標記，移前會中斷整個聚焦建構（四個Spring整合E2E失敗）。瀏覽器錯誤確認原因後，無效selector保持無法對應、略過該記錄，继续處理可證明的記錄，不依順序猜配。延遲load回歸測試加入此反例；原合成fixture／golden／整合斷言不變。失敗紀錄/private/tmp/wp25-synthetic-error.log與完整驗證69過／4失敗後重新修正。
