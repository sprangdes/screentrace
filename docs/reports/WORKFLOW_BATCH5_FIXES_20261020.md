# WP76 — 第五批公開專案問題修正

日期：2026-10-20。分支：`fix/workflow-restoration`。沿用 [WP75 原始驗收](COMPLETENESS_BATCH5_20261020.md) 的固定來源、失敗證據與斷言；重測沒有換專案。

| 專案 | 固定 commit | 此次修正 |
|---|---|---|
| [DXChaos/Materials-Program-Management](https://github.com/DXChaos/Materials-Program-Management) | `d40fb7eb6a757519bed650b1853a3dba6c2394a2` | GB18030、Spring Action 代理、繼承驗證 forward、command 精確目的、相對資源／請求、選取與必填檢核、with-form 提交 |
| [atankit/Student-Management-system](https://github.com/atankit/Student-Management-system) | `9bd13c7583eb2af2d18e539ec615718584a62fd4` | RedirectView setter、空白 EL、相對參數連結、側欄 class 切換 |
| [mohamed0sawy/Expenses-Tracker-WebApp](https://github.com/mohamed0sawy/Expenses-Tracker-WebApp) | `c6b93fe58655af5047f0be2df62c2173fbbd4a9d` | 具名片段與參數、display 切換、否定確認取消、Security 入口、DTO scalar 示範資料回顯 |

## 修正與來源操作證據

| 問題 | 結果與驗證 |
|---|---|
| WF-039 宣告編碼未解碼 | GB18030 graph／HTML 正確解碼；Y01 中文標籤、Y02 原始登入按鈕值通過。來源位元組未改。 |
| WF-040 代理／繼承／dispatch 目的集合錯誤 | 唯一 Spring bean 綁定、繼承 execute 與字面 command 精確解析；四個 Struts handler 目的集合全部正確，M02 登入仍顯示來源兩個可能結果。 |
| WF-041 相對請求與未知 query 斷鏈 | M03–M09 新增／修改／上傳／返回／檢核全部通過；未知 query 值保留樣板，不猜測資料值。 |
| WF-042 WebRoot 資源缺失 | 五個物料本地 CSS 全部內嵌且連結正確；本地 script 引用可由來源請求目錄定位。 |
| WF-043 RedirectView setUrl 未解析 | S04 提交回首頁、S06 刪除重載清單、S07 更新提交通過；保留 setter／return 行列證據。 |
| WF-044 空白 EL 與參數連結 | S05 修改與 S06 刪除目的正確；不以 redirect handler URL 當成回傳頁面的相對基準。 |
| WF-045 toggleClass 未回放 | S03 側欄開啟、關閉及 class 還原通過。 |
| WF-046 原生 display 切換未回放 | E03 面板開啟／關閉與 E09 filter 提交入口通過；filter 的 SQL 結果沒有宣稱重建。 |
| WF-047 具名 Thymeleaf 片段未組合 | E01 登入、E02 註冊、E13 登出入口通過；依圖中片段範圍組合並保留參數／分支證據。 |
| WF-048 否定 confirm 未阻止預設動作 | E07 取消不改畫面或資料、E08 確認後進入來源目的通過。 |
| WF-049 Security DSL 入口缺失 | 兩個額外 processor endpoint 均找到；E11、E13 通過。登入未知結果仍保留，沒有驗證或模擬真實帳密。 |
| NC-006 DTO／entity 提交資料未回顯 | Y05 新增後清單顯示 `520`／`Trace expense 520`；Y07 連續新增→選列修改→提交後顯示 `521`／`Updated expense 520`。只回放來源直接 scalar 複製。 |
| WF-050 巢狀候選無法直接選取（此次新發現） | 未解析的保留事件與已知 dispatch 結果並存時，原選單只顯示外層；現在可直接選取所有目的，未知分支與來源條件仍保留。M04／M05／M07／M09 通過。 |

## 原始 oracle 保留與更正

- S01／S02 的 href 尾碼及 S08 依賴錯誤，沿用 WP75 的 X01／X02／X03，原 FAIL 不覆寫。
- M01 用 `body.innerText` 要求包含 input 的 `value=登录`；瀏覽器不把 input value 放進 body.innerText。原 M01 保留 FAIL，Y01 驗實際文字，Y02 另驗 inputValue；沒有為通過斷言新增來源文字。
- 具名頁首還原後，E04／E06 的第一個 `input[type=submit]` 是來源登出按鈕。原案例確實前往登入頁，其 FAIL 保留；Y03／Y04 以來源實際 form 的 th:action 範圍選取，E12 依賴的資料檢查以 Y05 另驗。
- Y04 檢查直接開啟更新頁、未選定示範列時的明確限制提示；旅程中先選列更新使用 Y06，不能把未選列提示套在已選列情境。先前錯套提示的失敗 JSON／log 保留於 `after/final/before-journey-context-fix-*`。
- 沒有更動既有 Java／JS／viewer／E2E 斷言或 WP75 原始 expected／source oracle。

## 驗收數字

- 21／21 頁面與片段、21／21 Controller／Struts 路由、153／153 控制項皆找到；額外 Security 入口由 0／2 改為 2／2。盤點節點都有來源證據。
- handler 目的頁集合由 17／21 改為 21／21；本地 CSS 由 7／12 改為 12／12。33 個外部資源參照未抓取。
- 原 30 案例：23 PASS／7 FAIL。七個錯誤 selector／文字預期的結果保留，沒有改成 PASS。來源更正及新增資料檢查共 32 項：31 PASS／1 FAIL（X03）；三條有效旅程全部 PASS。M01 拆成文字與按鈕值兩項，另新增選列更新後實際資料回顯 Y07，分母與 WP75 的 30 項不同。
- 曾在並行建置與 suite 重疊時發生一次 CLI symlink 報表位元組不一致；停止並行建置後完整 Java suite 全通過，失敗 log 保留於 after/regression。沒有改動斷言，也沒有宣稱已確認該次歷史失敗的根因。
- 標準套件：810 項，809 PASS／既有 1 SKIP；Java 448（447 PASS／1 SKIP）、JS 84、capture 76、viewer 116、Chromium E2E 86。沒有刪除既有測試。
- 兩次獨立分析各 41 份 graph／preview／report／截圖產物完全相同；受測 377 檔未改，WP75 原始 41 份產物未改，操作實際使用的 graph／report 雜湊另驗一致。

## 未解決與驗證限制

**NC-007：學生自訂 Hibernate DAO 資料回顯仍失敗。** X03 現在能完成新增頁→提交回首頁→清單，但清單沒有 `Trace Student 520`／`Static Analysis`。來源 `studentcurd/dao/studentDao.java` 使用 HibernateTemplate.saveOrUpdate／loadAll；目前沒有此路徑的示範契約，不能因導覽已修正而宣告新增資料成功。這是提交阻塞解除後才實際到達的資料驗證，WP75 的 X03 原本停在 S04。

支出 DTO 示範僅涵蓋直接複製的 amount／description／dateTime 及本機集合身分。category、client、session、日期／時間顯示計算、filter 的動態 JPQL、認證與真實持久化不等同已還原。直接開啟更新頁而未選列時，只顯示來源正常回傳路徑及「未回放更新資料」提示。外部 CSS／字型未抓取，版面不能宣稱與線上系統像素等價。

前批 WF-035／036 未在此次修復。原專案 checkAll、resetItem、重複引號等來源缺陷仍與分析器缺口分開，不修改受測程式。此次結果不代表所有功能完整等價。

## 證據與重現

- [最終驗證摘要](completeness-batch5-20261020/after/validation-summary.json)、[問題狀態](completeness-batch5-20261020/after/findings.json)
- [原始操作重測](completeness-batch5-20261020/after/final/ui-results.json)、[來源修正後操作與資料檢查](completeness-batch5-20261020/after/final/corrected-results.json)
- [完整來源盤點](completeness-batch5-20261020/after/final/census-results.json)、[目的集合](completeness-batch5-20261020/after/final/return-results.json)、[樣式](completeness-batch5-20261020/after/final/style-results.json)
- [決定性](completeness-batch5-20261020/after/determinism.json)、[來源完整性](completeness-batch5-20261020/after/source-integrity.json)、[原產物完整性](completeness-batch5-20261020/after/original-artifact-integrity.json)、[操作產物身分](completeness-batch5-20261020/after/tested-artifact-identity.json)
- [固定補驗案例](completeness-batch5-20261020/after/verification-baseline.json)、[設計邊界](../adr/0095-public-batch5-workflow-repairs.md)

重現須先建置 ScreenTrace 自身（viewer build、Maven package），然後設定 `ST_BATCH5_OUTPUT` 指向獨立 repaired 目錄、`ST_BATCH5_RESULTS` 指向新的證據目錄，執行原批 `analyze.py`／`audit-census.py`／`audit-returns.py`／`audit-styles.py`。執行 workflows.mjs 原案例及 `ST_BATCH5_BASELINE=after/verification-baseline.json` 補驗案例；兩者輸出檔名分開。`after/determinism.py` 與 `after/verify-integrity.py` 使用上述固定 repaired／final 位置。目標應用不建置、不啟動；外部 HTTP 請求封鎖，來源 iframe 不允許 scripts。
