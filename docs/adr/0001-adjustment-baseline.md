# ADR 0001 — 調整需求優先序與基線界線

## 背景

附件版本 1.0 擴大原本 V1 的 JSON POC 範圍，要求靜態 JSP / JS 行為分析、離線單一 HTML 與 review md。原 AGENTS.md §7 僅以 Application Graph JSON 為 V1 成功標準，§8 暫緩完整 UI；PRODUCT_SPEC 的示範資料與既有 JSON review 也不是新的完成標準。

## 選項

1. 保留 POC 清單與新需求並行，會使完成狀態不明。
2. 依使用者指定附件執行，保留既有程式行為作為基線，逐工作包替換。

## 決定

採用選項 2。附件存為 docs/CODEX_INSTRUCTIONS.md，§1、§2 原文存為 REQUIREMENTS.md；ROADMAP 只追蹤 WP0–WP10 / M1–M4。ARCHITECTURE 區分實際模組與規劃模組。WP0 不修改 runtime、schema、依賴或既有測試斷言；基線失敗如實記錄。來源檔案依附件 C1 維持唯讀。

附件與 AGENTS.md 的範圍衝突依附件 §0.2 採附件規則：新的交付標準為單一 HTML 與 md；JSON 是目前基線行為，預計 WP7/WP8 取代。附件自身 WP1 §4 / C4 的衝突尚未決定，登記 OQ-001，不在本 ADR 擅自採用例外。

## 後果

既有 CLI localhost、review JSON、示範動態值仍保留到對應工作包。不能宣稱現況已符合 C1–C10 的全部新驗收。M1 必須包含 WP1/WP2；WP0 提交不代表 M1 完成。無新增套件，也沒有放寬或刪除既有斷言。
