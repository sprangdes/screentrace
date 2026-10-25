# ADR 0103：R18 第三階段——預覽狀態、頁面元件與樣式缺件診斷

## 狀態

已採用（R18 WP83–WP85）。

## 背景

reservio 實測顯示：React 靜態預覽同時畫出載入中、錯誤、空資料等互斥狀態；畫面的 `view` 指向 Guard、外框或選擇身分的包裝元件，使同網址的變體同名；`<PageHeader {...copy.landing}/>` 這類 spread props 未解析；前端從未安裝的套件 import 樣式表時沒有任何提示。

## 決定

1. 預覽狀態：以「載入成功路徑」模擬掛載時的載入函式（`useEffect` 回呼及其呼叫的專案內函式，含元件呼叫的自訂 hook），求得狀態值後再求值渲染條件；無法求值者沿用既有規則。結果記入 preview-model 的 `previewState`，只影響靜態預覽，不影響 graph；不依變數或函式名稱判斷。
2. 頁面元件：從路由元素出發；Guard 與外框不記錄，改看傳入的 children；一般元件記為候選並只看最後一個 `return`；拆分變體的元件改看產生該變體的分支；children 不是單一元件元素時結束，最後一個候選即頁面元件。
3. JSX spread 屬性可求值為物件字面值時，其屬性視為 props，依書寫順序覆蓋。
4. 以套件路徑 import 的 CSS，若 frontend 的 `node_modules` 中沒有該套件目錄，產生 `STYLESHEET_PACKAGE_MISSING` 診斷並在相關 SCREEN 加 `missingStylePackages`；不安裝、不下載、不連網。

## 期望值修改紀錄（依 R18 §4 預先授權與需求方明確授權）

- `screentrace-js/test/react-route-facts.test.mjs`：測試「R18 fixed useLocation pathname and literal includes participate in guard contradictions」與「R18 parameter, splat and transformed pathname remain free」的輔助函式 `reader()`，查找條件由 `view==='Choose'` 改為 `view==='Reader'`。原因：決定 2 改變了 `view` 的定義；需求方明確授權只修改查找條件，其他判斷未改。

## 驗證

需求方審查者於 sandbox 外以 `d7075ff` 執行完整驗證與實測，數字與結果見 [R18 報告](../reports/R18.md)「第三階段」。eMusicStore、PetClinic 與五個 Struts 模組的 `application-graph.json`、`preview-model.json` 與 `e2fcc0b` 位元組相同。

## 後果

- 預覽更接近實際資料載入後的畫面；條件無法判定的區塊仍可能出現，報告逐一列出。
- 同網址變體名稱可依頁面元件區分；SCREEN ID 與 `name` 不變，既有決策不受影響。
- 未安裝套件的專案，報表會提示預覽樣式不完整。
