# ADR 0002 — 行為模型、框架中立檢核與相容版本

## 背景

WP1 需要元件分類、事件行為、父行為、檢核與共用 API 使用狀態。既有 schema 2.1 與測試接受沒有來源的歷史圖，不能把既有通過斷言改為失敗以宣稱嚴格模型完成。

## 選項

1. 直接改 schema 2.1 的必填規則並改既有測試。
2. 新增 schema 2.2 的嚴格證據/元件要求，保留既有 1.0/2.0/2.1 讀寫與建構器；新模型使用 2.2。

## 決定

採用選項 2。新增 behaviors / validationRules 集合，既有六參數建構器與 CURRENT_SCHEMA_VERSION=2.1 保持不變；BEHAVIOR_SCHEMA_VERSION=2.2 是新嚴格版本。schema 2.2 的 GraphIntegrityValidator 拒絕缺來源、解析器、元件 kind、不合法邊。新行為與檢核資料不論版本皆須證據。沒有修改或放寬既有斷言。

需求方已回覆 OQ-001：core 使用通用來源層級，框架名稱放 evidence。ValidationLayer 為 MARKUP / CLIENT / SERVER；HTML5、JS、STRUTS_VALIDATOR、ACTION_FORM、BEAN_VALIDATION、CUSTOM_VALIDATOR 的字串記在 adapter 產出的 evidence.detail。

行為不改既有 TRIGGERS / CALLS / NAVIGATES_TO 語意：Behavior 是獨立集合，triggerId 指元件或 load 畫面，targetId 指畫面、endpoint、dialog 元件或檢核規則。回呼可用 parentId 繼承觸發來源，validator 檢查不存在的引用、重複 ID 與父循環。

穩定 ID 由 UTF-8 穩定鍵與既有 UUID.nameUUIDFromBytes 生成。新鍵用長度前綴避免分隔符衝突；元件鍵為專案相對路徑、kind、排序屬性與同類同屬性出現序，不用行號或掃描順序。screen 保留相對檔案路徑鍵；endpoint 用 HTTP 方法+route；behavior 用觸發 ID+事件+類型+原始運算式+出現序；validation 用相對路徑+欄位+種類+原始規則+出現序。reconcile 回傳排序的 matched / orphaned / new，不猜測舊 ID 的對應。

ApiUsage 純函式依畫面與元件明確決策推導。共用元件的每個所屬畫面皆計為來源，load 呼叫只能隨畫面移除；行為回呼繼承元件來源。若有具體 API 行為，簡化邊不重複計同元件來源。沒有 caller 的 endpoint 永遠為 UNREFERENCED，不是 REMOVE 授權。

## 後果

新解析器需明確選用 2.2 並提供 kind 與解析器證據；舊 adapter 在各自工作包遷移。既有 line-based 元件 ID 需由各 adapter 切換至 StableGraphIds，舊 review 找不到時以 orphaned 揭露。框架專屬的檢核來源仍能精確追溯。無新增相依。
