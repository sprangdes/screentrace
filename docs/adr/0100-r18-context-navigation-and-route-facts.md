# ADR 0100：R18 第二次驗收補正——Context 導覽投影與固定路由事實

## 背景

第二次驗收發現：常值 Link 未依來源身分選擇目的變體，且 canonical graph 共用元件時，投影鍵未涵蓋 targetScreens，造成後續畫面沿用第一次記錄的導覽。固定路由中的 useLocation pathname 與字面陣列 includes 尚未求值，亦妨礙全站 Guard 的矛盾判斷。前次宣稱全綠只依本機測試，漏掉 repo 外暫存連結造成的 CI 失敗。

## 決定

- 所有導覽共用目的變體投影。比較來源 audience 與行為 guard、目的 audience；只有同一 Context 值、同一 hook、唯一可定位 Provider 的原子可建立跨畫面同一性。不同 Context、不同 hook、重複或未知 Provider 不因名稱相同而修剪。每個被排除的變體保存來源／目的條件、原因與來源行號。
- 從觸發至導向，若呼叫該 Context setter 或已證明的 writer 函式，舊 audience 不沿用。涵蓋專案函式、Context 公開函式、直接 setter、目的地引數與 Link onClick；分支各自追蹤，合流保守合併可能寫入。修改後只按既有 OQ-037 窄規則使用回傳值的已證明條件；不做一般別名或資料流分析。
- 若來源身分與該網址的視覺變體均矛盾，但與 EntryPoint 的非視覺導向分支相容，保留該分支的實際目的畫面與 INFERRED 證據，不新增假畫面。例如非管理身分的根路由分支導向其既有頁面。
- 共用元件投影鍵納入目的變體及每個目的的條件摘要；不含行號。相同投影仍共用，不同投影各自記錄行為，防止跨身分共用錯誤目的地。
- react-router useLocation 取得的原始 pathname 只在不含參數／splat 的固定路由中為常值；字面陣列 includes(常值) 靜態求值。經字串串接、插值、方法或其他轉換後保持自由變數。參數路由與 splat 不求值。
- 條件中的純單一 return 常值判別函式，沿既有 WP80 參數綁定展開成相應分支條件；Boolean 的標準布林轉換保存為雙重否定，不依名稱推測業務意義。含副作用或無法解析的分支不展開。
- audience 使用已知路由下的等價條件；完整原式、來源與合併分支的各個來源行號保留在 attributes.audienceOriginal 及 evidence。顯示可化簡析取合取中已被其他條件蘊含的分支；一般原子與來源證據不刪除。
- 每個保留目的以 ReactAudienceTarget evidence 記錄 targetId、條件與來源。模擬的選擇清單顯示該條件，不執行目標程式。callback 例外由來源條件結構推出，未硬編碼查詢鍵、hook、角色或目標路徑。
- 需求方確認五個認證頁的 callback 例外仍保留多個根路由變體；各筆列具體 callback 條件及來源。獨立 callback 畫面另列 OQ-038 OPEN，本輪不拆分。

## CI 與相容性

CI run 40074957166 的 node-dependency-audit 因報告的本機暫存 Markdown 連結失敗。修正為行內程式碼後，run 40076517246（8d6ed56）三個 job 全通過。最終補正仍須通過其自身 PR CI，報告列 run 編號與驗證 SHA；本機結果不再代替 CI。

未更動 schema 2.3 的欄位定義：新增內容只使用既有 attributes／evidence 擴充點。沒有修改任何既有測試期望值，未使用數量型期望值修改授權；JSP／Struts／Spring MVC、md v1、決策保存鍵與 D4／D5 斷言不變。新增合成 fixture 與失敗測試提交可由 R18 報告追溯。實測完整圖及逐筆對照來源資料留在 repo 外。

## 結果與限制

只移除可證明矛盾的目的，不由名字猜身分。來源不具身分限制、Context 不唯一、寫入後不符 OQ-037、callback 明確允許已登入身分者，仍保留可成立候選與原因。實際數字及尚存多變體逐筆列於 [R18 報告](../reports/R18.md)。完成後停於 WP80，等待需求方重新驗收。
