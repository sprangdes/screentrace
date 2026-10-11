# ADR 0014：API 契約與 SERVER 檢核的靜態來源

## 背景

WP5 要求純後端 Spring 端點、Struts action 契約，以及 Bean Validation／Validator 的欄位與端點連結。目標程式不可載入、執行或反射，型別候選不可任意挑選。

## 選項

維持 Spring 專屬 extractor、另寫 Struts DTO 解析；或共用來源 DTO extractor，框架端點與啟用規則留在 adapter。執行 validator 得出結果不符合 C1。

## 決定

共用既有 JavaParser 與 ApiContractExtractor，無新增相依。來源檔仍走 SafeProjectFiles。正式 import／完整名稱優先，無唯一型別時列出全部 DTO 欄位，標 AMBIGUOUS；不依檔案順序擇一。支援非 static 欄位、getter、record、繼承與循環保護。

Spring MVC／Boot 辨識 RestController、ResponseBody、ResponseEntity，不以是否有畫面決定 API 是否存在。契約保留 consumes／produces、請求／回應欄位來源。Struts 擷取 ActionForm／Dyna 欄位、HttpServletRequest.getParameter 常值與 XML 中明確的 forward 候選；沒有可證明 action 方法或回應時保留 UNRESOLVED，不捏造 HTTP 狀態。

SpringServerValidation 使用 Java 17 AST。僅正式 javax.validation／jakarta.validation 約束與 Valid、Spring Validated 啟用規則；同名非正式註解不套用。支援巢狀 Valid、繼承、getter、record，循環停止並診斷。groups 無靜態群組語意時保留 UNRESOLVED；動態 message 保留參數原文而不冒充字串。

自訂 Validator 僅解析可唯一找到來源的明確 new 註冊、支持的 DTO 型別、rejectValue 字面欄位；InitBinder 模型名稱須對應。未知 DI／動態註冊保留診斷，條件註冊不升為 CONFIRMED。原始條件、message code、來源行號均保留，不推算執行結果。

SERVER ValidationRule 的 parameters.endpointIds 列出所有使用端點，端點 attributes.validationRuleIds 反向列出規則。fields 保留欄位路徑與能由已對應表單證明的元件 ID。規則 ID 不含行號，無關空白不變。

## 後果

新增 Spring 10、Struts 2 個測試，涵蓋純後端、正式／偽註解、兩種 validation namespace、繼承／record／cascade、循環、自訂 Validator、欄位連結、穩定 ID、DTO 歧義全列、import 唯一選取、groups／動態 message 與缺漏 Action。既有斷言全部保留。無法證明的執行時群組與依賴注入不在靜態來源中猜測。
