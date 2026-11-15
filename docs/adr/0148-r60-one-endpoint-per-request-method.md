# ADR 0148：R60 一個 mapping 宣告多個 HTTP 方法時，每個方法各建一個端點

## 背景

[CODE_REVIEW_20261114](../CODE_REVIEW_20261114.md) 的 RV-202：`@RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})` 被轉成文字 `"{ GET, POST }"`，成為端點的 `httpMethod` 與名稱。URL 解析、表單比對、Spring Security 外部呼叫與 viewer 都以單一方法字串比較，所以這種端點永遠對不到任何請求。

## 決定

- R60-1：`SpringMvcAnalyzer.httpMethods(mapping)` 回傳 mapping 接受的每個方法（依宣告順序、去重複）；未宣告時為 `ANY`；陣列內出現無法靜態判定的值時整體視為 `ANY`。`SpringBootAnalyzer` 改用同一個方法，刪除自己的副本。
- R60-2：每個方法各建一個 ENDPOINT（例如 `GET /save`、`POST /save`），都 HANDLED_BY 同一個 handler；redirect／forward 的待解析目標也依方法各記一筆。
- 不採用「一個端點、方法欄位存多個值」：所有下游都以單一字串比較，改成多值要同時修改 Java 與 viewer 的每個比較點。
- 只宣告單一方法的 mapping，端點 id 與修改前相同。

## 後果

- 多方法 mapping 的端點 id 會改變（原本的 id 含有 `{ GET, POST }` 文字），舊報告中針對這類端點的審查決策不會延續。這類端點修改前無法與任何請求連結，影響有限。
- 驗證：`SpringRound60Test` 的 MVC 與 Boot 兩個情境都已確認在修改前失敗；Maven 全數通過。
