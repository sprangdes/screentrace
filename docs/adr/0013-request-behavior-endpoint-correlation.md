# ADR 0013：請求行為與後端端點對應

## 背景與選項

WP4 的前端請求描述節點不代表後端 handler 已匹配。WP5 可在各 adapter 內維持個別 URL 猜測，或共用 UrlResolution 並接入 canonical 行為。

## 決定

UrlGraphContribution 處理 CALL_API／SUBMIT_FORM，兩種 adapter 與混合圖共用同一引擎。從 Acorn JSON 證據取 URL／HTTP method；表單取靜態目標與方法。標準 pageContext contextPath 可證明其性質；同來源、使用前、唯一且作用域可證明的 context 別名附定義證據。未證明變數不因名稱是 ctx 而剝除；未知 method 不匹配 ANY 端點。

唯一候選為行為結果；多個候選 targetId 為 null，全部 CALLS／TRIGGERS 標 AMBIGUOUS，evidence 列出所有候選。方法不符不連後端，產生診斷。畫面載入使用 CALLS，元件使用 TRIGGERS；原始綁定失敗證據不被丟棄。回呼 parentId 保留。明確 servlet-mapping 的副檔名模式用安全 XML 讀取。

未匹配請求仍保留前端描述及呼叫者，backendStatus=UNRESOLVED，避免捏造後端或把既有呼叫遺失；匹配後無引用的暫時前端描述可移除。當前畫面提交以 RENDERS／HANDLED_BY 的所有者證據找候選，不猜一個入口。保留來源表單與模型貢獻。

## 後果

畫面載入、失敗綁定、表單及 Struts 副檔名呼叫具整合測試；多候選不擇一。設定來源／採用值附於行為與關聯。圖在回傳前依 ADR 0012 移除實際使用者家目錄字串（以 [home] 表示），包含 application.path 及其他文字欄位／鍵；真實 workspace 設定檔路徑從不傳入 graph。
