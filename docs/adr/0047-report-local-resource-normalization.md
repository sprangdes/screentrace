# ADR 0047：OQ-016 報表讀取層的本地資源識別

## 背景與選項

Computed style 由 Chromium 保存完整 file URL。Petclinic 的 logo background-image 因分析輸出根不同產生不同 styleId，進而影響 preview-model 與 HTML 決定性，並洩漏輸出路徑。修改 capture 會影響其原始樣式完整保存契約；僅把 HTML 字串路徑遮掉則無法修正 styleId 與元素引用。

## 決定

依需求方 OQ-016 方案 1，只修改 `screentrace-report/PreviewCaptureReader`。讀入 styles 與 defaults 後，將 browser-serialized 本地 file URI 轉成 `st-preview-resource:` 加相對於分析輸出根的 URI 路徑；保留編碼後的 Unicode／空白、query 與 fragment。它是樣式資料的識別文字，不是可讀取本機的 URL；預覽實際資源繼續由既有 packed documents／內容雜湊內嵌，不由這個識別載入。

所有 CSS 屬性採同一處理，不僅 background-image；一筆值中的多個 URI 均處理，data URI 不變。僅在樣式值改變時，以排序後的字典 JSON 計算 SHA-256 styleId，並同步所有元素引用；無本地 URL 的既有 styleId 保留。defaults 值也正規化，既有 defaultId 不變。

解析前先去除 query／fragment 以檢查檔案路徑，再保留兩者到穩定識別。解碼及 normalize 後必須位於輸出根之下，拒絕鄰近目錄、編碼的 `..`、無效 URI 與其他機器的絕對路徑；錯誤訊息不帶原 URI 或其可能洩漏路徑的原因。此層只處理 URI 文字，不開檔、讀取 URI 資源、發出請求或執行目標程式。

不改分析器、圖 schema、capture 程式與 capture 檔、不改 packed documents、既有斷言或 golden。新增測試以同一合成 page.jsp 分別輸出至兩個有空白的目錄；沿用正式 pack 工具，驗證 packed documents、styles、styleId 與 HTML 一致，以及原始 capture 位元組不變。

## 驗證

失敗測試先提交 `e6f1bcf`：2 個測試均失敗，一個發現 styleId 不同，一個發現實際輸出路徑。補強前追加 query／fragment 反例也失敗，再補正 URI 分解。括號輸出目錄反例亦先驗證失敗，再修正為依引號完整辨認 URI。共新增 5 個 Java 測試，涵蓋 background-image、border-image-source、cursor、list-style-image、mask-image、多 URI、defaults、Unicode 路徑、query／fragment、括號輸出目錄、data URI、越界與 Windows／macOS 路徑。

最終報表測試掃描實際輸出目錄、合成專案根、當前 user.home，另掃描 file://、/Users/、C:\Users\ 與 JSON 跳脫形式。真實 Petclinic／eMusic 報表也以實際根目錄掃描。只發現 Petclinic 兩筆 background-image，沒有其他欄位需要保留絕對路徑；補強後均無洩漏。

完整結果與報表大小見 [R5](../reports/R5.md)。WP10 決定性及所有原有斷言／golden 保留並通過。
