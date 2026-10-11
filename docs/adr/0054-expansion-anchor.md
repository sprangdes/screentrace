# ADR 0054 — 原始來源展開錨點（R7／OQ-017）

## 背景與選項

預覽 tag 定義位置與圖中的 JSP 呼叫位置不同，舊證據集合無順序，不能證明逐個元素的對應。可選擇擴充 ID 推導、猜配渲染順序，或記錄完整來源鏈；採用來源鏈，不修改元件 ID、名稱、信心或 graph schema。

## 決定

GraphNode.attributes 是既有字串 map；GraphIntegrityValidator 嚴格 2.2 驗證未限制新增屬性鍵，因此以 expansionAnchor 記錄來源鏈。capture 使用 data-st-expansion-anchor，預覽模型記錄 ANCHOR／HEURISTIC；唯一錨點候選沿用 INFERRED，多候選全數保留為 AMBIGUOUS。

OQ-017 採方案 A：分組鍵為原始完整標籤名稱（含前綴、轉小寫）及 `<` 的起始行。CRLF／LF 以換行計數產生相同行號。僅開啟標籤計數；同組一個不加序號，多個全部依原文順序加 #1、#2…。同名不同 type 仍併組，不同名稱但同 kind 不併組。自閉合、成對、自訂 tag 使用同規則，在展開、屬性替換、原生控制項轉換之前，針對完整原始檔案計數。

HTML／JSP 註解、CDATA、scriptlet、EL 內的假標籤與關閉標籤不計數。路徑為專案相對路徑、正斜線。來源鏈以 ` > ` 串接；doBody 保留 caller body 原有來源鏈，不加入被呼叫模板的位置。深度／循環受限的未展開尾端不建立錨點。

Java／Node 讀同一份 docs/examples/expansion-anchor-vectors.json。兩份展開實作暫不合併，列技術債，以共用向量與整合測試降低漂移。

## 失敗證據與斷言異動

WP27 初始測試在舊實作執行：6 個測試、5 個斷言失敗、0 個錯誤；三次呼叫、巢狀鏈、body／迴圈、同行序號、必備錨點均收到 null。深度／循環既有保護通過。日誌 /private/tmp/wp27-red.log 僅留本機，不包含目標專案內容。本提交只新增合成資料／測試，沒有修改既有斷言或 golden。

## 後果

錨點不參與 StableGraphIds 身分計算。只有同畫面且相等來源鏈才能錨點配對，不以文字或順序補缺。增加圖／預覽字串的大小需實測，WP28 完成後停止驗收。

## WP28 驗證與大小界線

- cdc3c22：Node 三項失敗（共用向量、四個 href 精確配對、移除猜測／完整歧義候選），CLI 合成流程失敗於缺少 body 錨點。641e012：reader 未拒絕未知 matchBasis，viewer 缺少驗證入口，皆為紅燈。
- a943cd7：新增原始大小寫 tag 檔案的合成案例，舊 capture 找不到圖元件；新增打包文件去除重複 DOM 錨點但不修改原始 capture 的紅燈測試。此測試初稿誤要求 packed href 保留；既有打包器安全規則會移除 href，已修正此新增測試為要求 href 繼續移除，原始檔案仍逐位元組保留。沒有修改任何 R7 之前的斷言、fixture 或 golden。
- 真實初次產出 petclinic 比 R6 增加 5.821%，超過 5% 界線。移除展示用 packed HTML 裡重複的 data-st-expansion-anchor，完整錨點仍在 graph／preview model 與原始 capture。最終 petclinic 增加 3.166%，eMusic 增加 1.705%，沒有截斷內容或放寬大小要求。
- 既有斷言異動清單：無。R7 之前的資料、證據、安全、決策、md、API 與決定性斷言全數保留。新增資料正確性測試實際比對 graph href 與渲染 href，不以「有配到」代替。
