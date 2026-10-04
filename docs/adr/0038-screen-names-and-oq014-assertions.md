# ADR 0038：畫面名稱與 OQ-014 限定呈現斷言

日期：2026-10-04。狀態：採用。WP19／WP20；需求方明確授權 OQ-014 方案 A。

## 決定

命名只在 viewer `names.ts` 決定；先選跨畫面唯一 title，再選唯一 h1，否則將 view 檔名拆駝峰／連字號成可讀名稱。同 basename 追加主要 URL，仍相同時以穩定序號區分。畫布、聚焦、右欄與 API 呼叫來源使用同一 display graph；canonical graph、來源證據、review ID 與 md golden 不變。卡片只顯示名稱與主要 URL，URL 可 hover 看全文，來源放右欄與檔案結構。

## 僅授權修改的既有斷言

檔案：screentrace-viewer/test/diagnostics.e2e.mjs；fixture／安全探針與其他斷言不變。

| 位置 | 舊預期 | 新預期 | 原因 |
|---|---|---|---|
| navigation prioritizes…，a 卡片斷言 | 卡片含「帳戶維護」與 web/a.jsp | 兩卡片 strong 名稱不同；a 卡片不含來源路徑 | 重複 title 不採用，來源路徑離開卡片 |
| 同測試，b 卡片斷言 | 卡片含「帳戶維護」與 web/b.jsp | b 卡片不含來源路徑，名稱不是重複 title | 同上；另加三種命名 E2E 與 basename 衝突單元測試 |
| graph and preview diagnostics…，收合文字斷言（WP20） | 尚未展開即含 UNSUPPORTED_FRAMEWORK | 收合為中文摘要；展開技術明細後完整代碼、原訊息、struts.xml:2 可查 | 英文代碼移入明細技術欄位；不刪證據、不降低安全探針斷言 |

## 舊實作反證

套用新卡片斷言與三種命名測試，但實作仍為已驗收 WP18 的報表。6 項 E2E：2 通過、4 失敗；同名卡片仍含路徑，新增命名情境不能滿足唯一可讀名稱／主要 URL 行。記錄於 reports/R3.md。診斷斷言於 WP20 測試先行時另驗證失敗。

## 後果

預覽重複 title 不再淹沒畫面名稱；變更只影響人類查看，不修改分析信心或 md 契約。未知／動態字串仍作資料以 textContent 顯示；不增加框架名稱至 core。

WP20 的巢狀診斷細節新增後，既有展開操作定位限縮為直接子 summary，並在原來源／ASSET_UNRESOLVED 斷言前明確展開對應群組與技術明細；這些來源、訊息、代碼及惡意腳本安全斷言原文不變。沒有讓收合內容以隱藏字串規避測試。

WP20 將第三處授權斷言套用於舊實作：3 項中 2 通過、1 失敗（收合內容仍暴露 UNSUPPORTED_FRAMEWORK，違反新摘要規格）。實作後原訊息、struts.xml:2、英文代碼及腳本不執行斷言全部通過。
