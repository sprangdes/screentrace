# ADR 0096：R18 畫面渲染事實與 schema 2.3

## 背景

React 的路由 Guard 與全站 Guard 已被分析為元件 guard 前綴，卻未成為畫面適用條件。需要保留來源並供後續身分變體共用。

## 選項

1. 依角色名稱猜測：不符合確定性與框架隔離要求。
2. 從 AST 的回傳／條件結構抽取 children 可達條件，使用有限布林規則：採用。

## 決定

- 有實際 React 畫面貢獻的圖輸出 schema 2.3；僅偵測到 React 副檔名而無可解析路由時，沿用輸入圖版本；非 React 來源維持 2.2，避免改變 JSP／Struts／Spring MVC 的既有圖位元組。
- SCREEN 的 `audience` 為 `{text, truth, source}` 陣列。條件由 Guard 實際轉交 children 的分支取得，保留檔案與行號；多個可達分支以析取保留，不任選一支。
- optional chaining 與嚴格比較／否定正規化。只能使用 R18 WP78 的矛盾規則；未知呼叫與無法拆解的條件保留原子。推導不改原有證據信心。
- 元件／load guard 僅移除 audience 已蘊含的合取部分，原本自身條件保留。
- 組合超過 16 或有界枚舉無法安全完成時停止細分並輸出 `REACT_AUDIENCE_TOO_MANY`；保留每個畫面的完整 audience。
- core 與正式消費端接受嚴格 2.2／2.3，歷史版本維持原讀取規則。review 狀態容器及暫存鍵維持 v1／schema 2.2；其 schema 欄位是既有容器契約，分析圖的版本由 fingerprint 辨識。md v1 的 golden 位元組、D4／D5 不變。
- capture 樣式／packed preview 的獨立格式仍為 version 2／schema 2.2；新增的 audience 只存在 canonical graph。

## 測試與既有斷言

新增 `react-audience.test.mjs` 與 `AudienceSchemaTest`，失敗測試提交 `778bae6`、`46ede84`。未修改既有測試斷言。

既有 viewer 文件連結測試在開工基線即失敗：將指示文件中的 inline code `obj[key]` 後緊接括號誤識為連結。範例加入 JavaScript 允許的空白，需求語意不變，測試不動。

## 後果

身分條件為來源表達式摘要，不從字串猜中文名稱（R18-C 待確認）。WP79 的舊 screenId 匯入仍待 R18-A，未在本 ADR 決定遷移政策。
