# ADR 0099：R18 第一階段驗收補正

## 決定與範圍

需求方選定 OQ-035 A、OQ-036 A、OQ-037 的窄版 B，並補充 R18-C 顯示規則。本次仍停在 WP80，不實作 WP81 或一般狀態可達性／別名／資料流分析。

- 拆分畫面的 `supersedesScreenId` 保存拆分前 ID。匯入時舊決策仍保留為 orphan，顯示「此網址已依身分拆分，請重新標記」，不複製到任何變體。單一畫面 ID、review 容器、暫存與複合決策鍵、md v1 位元組不變。
- 獨立狀態控制的偏好面板及 API 保留，WP79 該項驗收改為「保留，附 OQ-036 說明」。跨事件狀態可達性列後續。
- URL 三元運算式逐支附條件；回傳路徑函式的參數依 AST 綁定替換為呼叫引數。handler、Navigate 與 Link 共用候選解析；未知引數／回傳參數維持保守，不升級 INFERRED。引數含未解析呼叫等不具穩定身分的運算式時，其返回條件只供證據顯示，不用於修剪；即使來源文字相同也不視為同一次求值。
- Context 同一性只接受：唯一可定位的 Provider、value 物件字面值（可由 useMemo 回傳）同時公開 state 值 X 與 F；F 在每條回傳路徑將同一區域變數送入 useState setter 並回傳該變數；呼叫端由同 Context 解構 F，使用 `const u = await F()`。直接 useContext 及直接回傳該 Context 的包裝 hook 可定位。catch 的 null 回傳只接受同一路徑確實 setter(null)，不產生非 null 物件猜測。
- 轉換 setter 引數、不同回傳變數、setter 經 props／其他函式、重複或未知 Provider、可變區域值、finally 覆寫、不同來源 Context 均不建立同一性。目的地畫面的 X 也須由同一 Context 取得；比較使用內部 Context 綁定識別，不靠欄位名稱相同。
- 顯示條件先去重，再以既有原子矛盾規則檢查其他條件是否蘊含該子句，只省略已證明冗餘的析取子句，普通原子保留。原始完整 audience 與來源仍保留，且加入 SCREEN evidence；`audienceSummary` 僅供顯示，不參與 ID 或判斷。報表同時提供簡化條件及可展開的原式。

## 驗證與相容性

補正前所有未提交工作已先提交 `22f093e`。新增失敗回歸提交 `1f5584e`、`da8b042`、`032d0ef`、`377eb87`、`7d6fb51`、`35a4f16`，合成 fixture 的身分與角色名稱均不同於實測對象。沒有修改任何既有 JSP／Struts／Spring MVC 斷言、D4／D5、保存鍵或 md golden；沒有使用數量型期望值修改授權。新增欄位均在 schema 2.3 已定義的 attributes／evidence 擴充點內，沒有再次變更 schema。

實測、測試數、效能、所有畫面出口對照見 [R18 報告](../reports/R18.md)。
