# ADR 0020：檢視器關聯投影與預覽封裝

日期：2026-10-03；狀態：採用（WP7 B／C）。

自製決定性分層：先將循環 SCC 凝聚，再依最長路徑分層，以圖 ID 排序。畫面投影保留共用元件的每個 owner、全部目標及觸發元件，不將歧義擇一。URL 搜尋支援原始路由子字串、路徑變數、單星／雙星及副檔名。無新增圖形或版面相依。

capture 新增工具 pack-preview（沿用 quote-aware markup scanner，CSS lexical scanner），只讀既有重建 HTML／本地資源，不執行目標程式碼、不連線。CSS import 靜態展開，循環／未知引用診斷；圖片與字型依 MIME＋bytes SHA-256 去重，字典保存 data URI，文件保存雜湊標記，srcdoc 建立前由工具替換。外部／越界／symlink／超量資源明確診斷並停用引用；原始 source 不修改。預覽保留文字與來源 metadata，移除主動內容、事件屬性、導頁／表單動作。

面板以 textContent 呈現所有來源文字；iframe 僅 allow-same-origin，父頁自有 click listener 讀 WP6 路徑與字典，未配對不猜元件，多候選完整呈現。API caller 依 Java ApiUsage 同一規則保存載入時、未綁定來源、共用元件及回呼父行為。review 的有效狀態於 D 另建共用模組。

測試：純模組／file:// 端到端，實際 CSS／圖片 data URI、探針不觸發、無外部或相對資源請求、聚焦／tooltip／面板／樣式點擊；500／5,000／3,000 fixture 強制 3 秒。沒有執行期 UI 相依；封裝亦無新增 npm 相依。

WP7 D：review 狀態獨立於圖、schema 2.2 與格式 v1；複合鍵採巢狀字典，避免 ID 分隔符與 prototype 汙染。screen REMOVE 僅推導有效顯示，明確元件決策不突變。localStorage 失敗僅警告。共用來源／使用狀態模組按 Java ApiUsage 規則與 162 組狀態組合驗證；詳見 [review 契約](../REVIEW_STATE_CONTRACT.md)，WP8 重用此結構。
