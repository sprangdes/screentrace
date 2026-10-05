# ADR 0054 — 原始來源展開錨點（R7／OQ-017）

## 背景與選項

預覽 tag 定義位置與圖中的 JSP 呼叫位置不同，舊證據集合無順序，不能證明逐個元素的對應。可選擇擴充 ID 推導、猜配渲染順序，或記錄完整來源鏈；採用來源鏈，不修改元件 ID、名稱、信心或 graph schema。

## 決定

GraphNode.attributes 是既有字串 map；GraphIntegrityValidator 嚴格 2.2 驗證未限制新增屬性鍵，因此以 expansionAnchor 記錄來源鏈。capture 使用 data-st-expansion-anchor，預覽模型記錄 ANCHOR／HEURISTIC；唯一錨點候選沿用 INFERRED，多候選全數保留為 AMBIGUOUS。

OQ-017 採方案 A：分組键為原始完整標籤名稱（含前綴、轉小寫）及 `<` 的起始行。CRLF／LF 以換行計數產生相同行號。僅開啟標籤計數；同組一個不加序號，多個全部依原文順序加 #1、#2…。同名不同 type 仍併組，不同名稱但同 kind 不併組。自閉合、成對、自訂 tag 使用同規則，在展開、屬性替換、原生控制項轉換之前，針對完整原始檔案計數。

HTML／JSP 註解、CDATA、scriptlet、EL 內的假標籤與關閉標籤不計數。路徑為專案相對路徑、正斜線。來源鏈以 ` > ` 串接；doBody 保留 caller body 原有來源鏈，不加入被呼叫模板的位置。深度／循環受限的未展開尾端不建立錨點。

Java／Node 讀同一份 docs/examples/expansion-anchor-vectors.json。两份展開實作暫不合併，列技術債，以共用向量與整合測試降低漂移。

## 失敗證據與斷言異動

WP27 初始測試在舊實作執行：6 個測試、5 個斷言失敗、0 個錯誤；三次呼叫、巢狀鏈、body／迴圈、同行序號、必備錨點均收到 null。深度／循環既有保護通過。日誌 /private/tmp/wp27-red.log 僅留本機，不包含目標專案內容。本提交只新增合成資料／測試，沒有修改既有斷言或 golden。

## 後果

錨點不參與 StableGraphIds 身分計算。只有同畫面且相等來源鏈才能錨點配對，不以文字或順序補缺。增加圖／预覽字串的大小需實測，WP28 完成後停止驗收。
