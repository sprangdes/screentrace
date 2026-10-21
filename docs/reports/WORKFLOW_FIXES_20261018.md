# WP69：公開應用流程修正與驗收

分支：`fix/workflow-restoration`。實作提交：`054cf0c`；回歸測試提交：`302a812`。日期：2026-10-18。

**WF-001–009 已修正並重新驗證：32／32 項操作、3／3 條完整使用旅程通過。** 三個原始公開專案均成功產出離線報表；三份輸出再分析一次，76 個 JSON／HTML 檔案的路徑集合與 SHA-256 完全相同。

原始失敗紀錄及關鍵截圖完整保留於 [WORKFLOW_RESTORATION_20261018.md](WORKFLOW_RESTORATION_20261018.md)。此次沒有使用前輪的五個專案重測，也沒有更改目標原始碼；三個來源 repository 的 git status 與基準來源 SHA-256 皆維持不變。

## 問題對照

| 問題 | 修正 | 原專案重新驗證 |
|---|---|---|
| WF-001：OLMS 相對 JSP 連結 | 支援 legacy web roots 與 Struts link 正規化，為實際來源畫面保存公開別名 | REGISTER YOURSELF、Forget Password 正確前往；C01 由登入頁完成註冊旅程 |
| WF-002：清除及控制項轉換 | 空白分隔的 property/path 正確轉成 name；button 的文字、type 正確；同一行的精確來源 ID 可在原候選內選定；七個 literal value assignment 由工具模擬 | 七欄填入後均清空；clear 按鈕可見且不是 submit |
| WF-003：日期選擇 | 辨識已登錄的 YX Popup Calendar 配置，提供工具自己的安全日期控制及格式回填 | Select Date 可開啟日期選擇；選取 `2026-10-18` 後欄位為 `2026/10/18` |
| WF-004：ModelAndView setter | 支援單一、直接且常值的 setViewName；未知／條件 setter 維持未解析 | Go to Products 抵達清單；新增產品的原表單／成功回清單兩分支皆可選 |
| WF-005：產品詳情連結 | literal 路徑與動態 query 分開推導，巢狀按鈕繼承外層連結 | 從產品清單按 Details 到產品詳情，保留 INFERRED 與原始運算式 |
| WF-006：數量及購物車 AJAX | 未知 JSP 參數不阻止獨立 DOM 效果；pathname 前綴保留符號；API 與 callback 分支分開呈現 | Order Now 顯示數量；POST addToCart／GET removeFromCart 顯示正確 API，實際選成功／失敗後出現來源對應訊息 |
| WF-007：Web Flow 結帳 | 解析登錄、狀態與具名 submitter；有界追蹤 action-state 後的可能畫面，不執行服務 | Check out、Continue、Back、Confirm、Cancel 均正確；C02 包含加入／移除購物車及完整結帳 |
| WF-008：醫院 view 對應 | 讀取 properties resolver，將合法 prefix/view/suffix 組合連到 JSP；同頁 POST 按目前已知路徑解析 | 32 個重複 SCREEN 收斂為 16 個實體 JSP；註冊／登入／房型／病患／分配床位的分支及 C03 皆通過 |
| WF-009：背景圖阻止封裝 | inline CSS 的 web-root URL 對應到安全複製的 output assets；保留原有資源邊界檢查 | CLI exit 2 改為 0，成功生成完整報表；原本被阻擋的 11 項操作全數可驗證，包括列印 |

## 驗收內容

- C01：登入頁 → 註冊 → 送出回註冊頁，通過。
- C02：首頁 → 產品 → 詳情 → 顯示數量 → 加入購物車／選取成功與失敗提示 → 購物車 → 移除商品／選取成功與失敗提示 → 結帳寄送 → 付款 → 確認 → 完成，通過。返回及取消另有獨立操作檢查。
- C03：首頁 → 醫院登入 → 註冊 → 房型設定 → 登入 → 工作台 → 新增病患 → 床位分配 → 工作台，通過。
- 每個表單／分支均依原始碼的預期目的集合核對，不以「仍在同一頁」代替成功。日期選擇核對實際回填值、清除核對七欄值；AJAX 核對 HTTP 方法、路徑及點選分支後的訊息。
- 列印測試僅攔截工具頁自己的 `window.print` 計數，驗證使用者點擊後有呼叫，未執行原始 onclick。Print CSS 限定目前聚焦的靜態預覽。
- 三份真實報表的 pageerror 與 HTTP(S) 請求均為 0；測試沒有啟動或執行目標 Java、JSP、JavaScript、Maven／Gradle 或資料庫。
- 所有可導頁案例的 graph 路徑符合來源預期；API 兩項有對應呼叫路徑；四項純 UI 效果由實際操作驗證。沒有修改 GraphIntegrityValidator 或來源解析狀態來消除失敗。

## 回歸結果

| 檢查 | 結果 |
|---|---|
| Maven `verify` | 405 項，404 通過、1 跳過、0 失敗／錯誤 |
| JavaScript analyzer | 66／66 |
| Preview capture | 54／54 |
| Viewer 單元測試 | 105／105 |
| Viewer 瀏覽器 E2E | 84／84，使用預設並行設定 |
| 公開專案真實操作 | 32／32 |
| 完整使用旅程 | 3／3 |
| 兩輪輸出決定性 | 3／3 專案，76 個 JSON／HTML 檔案一致 |

新增的遺失 flow／循環 flow 負向測試先驗證失敗，再補上診斷；既有測試斷言未放寬。第一次完整回歸抓到「未設定 context path 卻推導標準 context expression」的回歸，已修正為只保留新 pathname 前綴符號的 INFERRED 推導，原有 context 測試維持不變。

## 逐項前後對照

| 案例 | 原始碼預期操作 | 修正前 | 修正後 |
|---|---|---|---|
| O01 | 登入頁→註冊 | 失敗 | 通過 |
| O02 | 登入頁→忘記密碼 | 失敗 | 通過 |
| O03 | 登入成敗候選與選擇成功頁 | 局部流程一致 | 通過 |
| O04 | 註冊送出→原註冊頁 | 局部流程一致 | 通過 |
| O05 | 新增書籍送出→原表單 | 局部流程一致 | 通過 |
| O06 | 填入七欄後清除 | 失敗 | 通過 |
| O07 | 開啟日期選擇器 | 失敗 | 通過 |
| E01 | 首頁→產品清單 | 失敗 | 通過 |
| E02 | 產品清單→新增產品 | 局部流程一致 | 通過 |
| E03 | 產品清單→產品詳情 | 失敗 | 通過 |
| E04 | 新增產品錯誤／成功兩分支 | 失敗 | 通過 |
| E05 | 產品詳情→購物車 | 局部流程一致 | 通過 |
| E06 | Order Now 顯示數量欄位 | 失敗 | 通過 |
| E07 | Add to Cart AJAX 與成功提示 | 前置失敗 | 通過 |
| E08 | Remove AJAX／提示／重新載入 | 失敗 | 通過 |
| E09 | 購物車→結帳寄送 | 失敗 | 通過 |
| E10 | 寄送 Continue→付款 | 失敗 | 通過 |
| E11 | 付款 Back→寄送 | 失敗 | 通過 |
| E12 | 付款 Continue→訂單確認 | 失敗 | 通過 |
| E13 | Confirm→完成 | 失敗 | 通過 |
| E14 | Cancel→取消訂單 | 失敗 | 通過 |
| H01 | 首頁→醫院登入 | 報表未生成 | 通過 |
| H02 | 登入頁→醫院註冊 | 報表未生成 | 通過 |
| H03 | 註冊→原頁／房型設定 | 報表未生成 | 通過 |
| H04 | 房型設定→原頁／登入 | 報表未生成 | 通過 |
| H05 | 登入成敗兩分支 | 報表未生成 | 通過 |
| H06 | 工作台→新增病患 | 報表未生成 | 通過 |
| H07 | 新增病患→原頁／床位分配 | 報表未生成 | 通過 |
| H08 | 分配床位→原頁／工作台 | 報表未生成 | 通過 |
| H09 | 城市搜尋→結果頁 | 報表未生成 | 通過 |
| H10 | 醫院清單→床位清單 | 報表未生成 | 通過 |
| H11 | 帳單列印 | 報表未生成 | 通過 |

## 產物與證據

- 本機報表（位於受 `/analyze/` ignore 規則排除的目錄，不隨 repository 保存）：OLMS `analyze/workflows-20261018/MyStrutsApp/report/screentrace-report.html`、eBazaar `analyze/workflows-20261018/eBazaar/report/screentrace-report.html`、醫院 `analyze/workflows-20261018/Hospital-Bed-Availability-Management-System/report/screentrace-report.html`
- [逐項實際操作／三條旅程](workflows-20261018/after/ui-results.json)、[graph 核對](workflows-20261018/after/graph-results.json)、[固定來源與預期](workflows-20261018/baseline.json)
- [提交版本、CLI exit code、來源不變與產物雜湊](workflows-20261018/after/run-metadata.json)、[兩輪輸出比較](workflows-20261018/after/repeat-results.json)
- 截圖：[清除欄位](workflows-20261018/after/images/O06-after.png)、[日期回填](workflows-20261018/after/images/O07-after.png)、[產品詳情](workflows-20261018/after/images/E03-after.png)、[購物車](workflows-20261018/after/images/E07-after.png)、[結帳前進](workflows-20261018/after/images/E10-after.png)、[病患登記](workflows-20261018/after/images/H07-after.png)
- [Maven 日誌](workflows-20261018/after/workflow-maven-verify.log)、[capture](workflows-20261018/after/workflow-capture-full.log)、[JS](workflows-20261018/after/workflow-js-full.log)、[viewer unit](workflows-20261018/after/workflow-viewer-full.log)、[viewer E2E](workflows-20261018/after/workflow-viewer-e2e.log)、[公開專案操作](workflows-20261018/after/workflow-ui-after.log)
- 設計與安全界線：[ADR 0091](../adr/0091-public-workflow-restoration.md)

從 ScreenTrace 根目錄重現（固定來源 checkout 路徑與版本見原實測報告）：

```sh
npm --prefix screentrace-viewer run build
mvn -B verify
python3 docs/reports/workflows-20261018/analyze.py
python3 docs/reports/workflows-20261018/graph-audit.py --after
node docs/reports/workflows-20261018/workflows.mjs --after
```

操作腳本只補足觀測與加入更完整的來源行為檢查：讀取畫面中的 API 呼叫清單、選取實際 callback 提示、日期回填與列印計數。Graph audit 修正跨行 href 的標籤起始行對應。預期路徑、HTTP 方法與目的畫面集合未放寬。

驗收涵蓋來源能證明的**離線操作示意**。成功／失敗仍由使用者選取，沒有驗證真實帳密、資料庫寫入、庫存、計價、付款或服務回應；日期控制還原可選日期與回填功能，不宣稱外觀與原日曆逐像素一致。其他未知腳本保持明確提示，沒有將這三份來源的成功結果宣稱為支援任意 JS 系統。
