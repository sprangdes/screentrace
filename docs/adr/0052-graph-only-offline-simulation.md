# ADR 0052：WP26 只依圖的離線操作模擬

## 決定

simulation.ts 是可在 Node 單獨測試的純函式：輸入既有圖、畫面、exact preview path 的元件對應及原生表單有效性，輸出導覽／表單／彈窗／API／全部候選／無法確認的描述。simulation-ui.ts 僅呈現與綁定事件。所有文字使用 textContent，不執行 guard、條件、URL 運算式或專案程式。不修改 schema、分析器、API 狀態、review/md 契約或決策。

只有已證明的 CONTAINS 與行為目的可操作；UNRESOLVED、UNKNOWN、UI_STATE_CHANGE、SELECT_CHANGE、VALIDATE 不假造效果。回呼的靜態子行為列為選擇，不模擬執行回呼。guard 未求值時先列可能操作供選擇。AMBIGUOUS 的圖元件與行為目的候選全部列出，不以文字、URL 相似度或 DOM 順序擇一。行為候選僅讀現有 producer 的正式「候選：[ID, ID]」證據欄位，不從任意 evidence 文字猜測；不認得或不存在的目的仍呈現未知。

HANDLED_BY／RENDERS／FORWARDS_TO／NAVIGATES_TO 沿既有證據追蹤，深度10並防循環。已解析、未解析與缺少目的的結果均保留；表單只有唯一且已解析的畫面結果才自動導覽，歧義、條件與未解析結果不自動套用。每個結果保留證據等級、來源與解析器。context-path 的「未設定」證據不當成目的解析失敗；只讀真正 URL 解析結果，不新增 URL 推斷。

表單先用原生 checkValidity/reportValidity；SERVER 規則只顯示已有的欄位、訊息或規則名稱，不把後端規則偷偷轉成 required，也不宣稱驗證成功。API 只提示已記錄 METHOD／路徑並可跳到 API 詳情，不送請求、無假回應。MODAL 只有對應到本頁真實 DOM 才顯示，內容留在已淨化的 iframe，關閉鈕／遮罩／Esc 可關閉。輸入與模擬歷史僅在記憶體／暫時 DOM，重置重建頁面；不寫 localStorage，md 前後不變。

## WebKit 事件邊界

實測 WebKit 可以啟動，但拒絕執行父頁綁在 sandbox iframe 內的事件回呼，不能視為環境不可用。原始 E2E 導覽失敗且出現 sandbox script-blocked 訊息。不能加入 allow-scripts 或放寬 CSP。

WebKit/Safari 使用 simulation-surface.ts 的父頁操作層：依本次 iframe DOM 的精確元素矩形放置由檢視器建立的透明按鈕及原生輸入；圖配對仍只用原元素 path。輸入的安全原生屬性及選項 textContent 保留，暫時值同步回 iframe。原生表單驗證、Enter 送出與規則函式共用，不另寫推導；不搬入專案 HTML、腳本、CSS 規則或事件屬性到父頁。只複製有限的 computed 外觀屬性。iframe 禁止指標／Tab 原生互動，所有連結／送出在父頁攔截，避免真實導向；彈窗內容仍留在原 iframe，事件與關閉焦點由父頁控件接收。Chromium/Firefox 使用原父頁事件綁定。瀏覽器分支只解決已確認的 WebKit sandbox 差異，不是資料配對啟發式。

sandbox 始終只有 allow-same-origin，script/connect/form/frame 均為 none；離線 DOM/CSS 清理沿用 WP25。測試記錄所有非 data/blob 的請求，除初始報表外必須為空；原 script、onclick、javascript: 探針不得被觸發。

## 覆蓋率與驗證

N 為可取得靜態文件中所有 a、button、form、select、input、textarea（含隱藏與停用元素）；M 只計圖支持的導覽、送出結果、彈窗、API 或含可模擬候選的選擇。原生輸入可編輯不代表腳本可模擬；未配對元素不排除。缺失文件另報畫面數，不能把缺失當成已分析完整。右欄以畫面顯示，分析資訊顯示全專案。

b781d57 先提交缺少模組的規則失敗與互動測試。初版 E2E fixture 的 fingerprint／證據不完整，md 下載先失敗；補齊新 fixture 後，以保存的 WP24 報表證明缺少操作模式／覆蓋率、導覽仍留原畫面。既有斷言、fixture、golden 沒有改動。新增條件／回呼與未解析、缺少分支的回歸先失敗再修正；唯一未解析結果不得自動導覽另有 E2E；此新增測試先暴露原生欄位 blur 插入無關提示造成滑鼠按下／放開間位移、漏掉真實送出點擊。未對應原生欄位僅編輯值，不在 blur 產生無關效果；明確點選或下拉操作仍可提示未知。沒有增加固定等待或修改結果斷言。WebKit 原導覽、Esc 關閉失敗均記入 R6 報告，不用固定等待掩飾。

完整數字、真實 Petclinic 操作、四類 fixture 覆蓋率、瀏覽器可用性與未驗證項目見 reports/R6.md。無新增相依。WP26 完成後等待需求方驗收。
