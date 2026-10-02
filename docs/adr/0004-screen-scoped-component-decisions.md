# ADR 0004 — 元件決策依畫面與元件複合鍵保存

## 背景

CODEX_INSTRUCTIONS.md v1.1 的 WP1 §7 明定，共用 include 的同一元件在不同畫面可有不同決策。原 ApiUsage 接受單一 ID map，將元件 REMOVE 套用到所有畫面，可能誤判 API 為可移除。

## 選項

1. 以字串拼接 screenId / componentId，需另定跳脫規則。
2. 以 ComponentKey(screenId, componentId) 型別與獨立 screen/component maps 表達決策。

## 決定

採用選項 2，derive(graph, screenDecisions, componentDecisions)。畫面 map 使用 screenId；元件 map 使用 ComponentKey。純函式讀取兩個 map，不改寫使用者決策。load 來源仍只受畫面決策影響；父/子行為繼承的元件來源也依其 caller 的畫面查詢。

更新 ApiUsageTest 的原 54 組窮舉案例為 162 組：load × screen1 × screen2 × component(screen1) × component(screen2)。原狀態、caller 數量、未使用 API、輸入不變斷言保留，只將已由需求方修訂的決策鍵與期望公式改為各畫面獨立。另新增不同決策、缺省決策、子回呼與畫面移除覆蓋的案例。這是 v1.1 新語意的必要測試更新，沒有放寬斷言。

附件 v1.1 位元組原樣覆蓋 docs/CODEX_INSTRUCTIONS.md；需求 §1/§2 原文保持不變。

## 後果

呼叫者必須提供 scoped component map；移除原二參數 API，避免舊呼叫靜默使用全域元件決策。目前 repo 的 derive 呼叫者只有 ApiUsageTest，全部更新。後續檢視器與 md 匯出使用同一契約。M2 須在本修正推送後、該 commit 的遠端 CI 全綠才開始。
