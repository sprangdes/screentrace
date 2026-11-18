# ADR 0170：R95 前端對同一狀態的多種寫法全部列出

## 背景

R82（[ADR 0160](0160-r82-state-changes.md)）在前端各處寫法不一致時只顯示常數名，reservio 的 PENDING（「待確認」「等待店家確認」）與 CANCEL_REQUESTED（「取消申請中」「取消申請處理中」）因此沒有中文。需求方於 2026-11-18 改為列出所有寫法（OQ-058）。

## 決定

- `StateLabels` 不再因寫法不同而捨棄：同一常數的每種寫法依第一次出現的位置（檔案、行號）排序，以全形「／」串接成顯示文字；`stateChanges` 的 `label` 與 `labels` 為串接後的文字，另以 `labelWords`（`text`、`source`）列出每種寫法與來源。對照是否屬於某個列舉的規則不變。
- viewer 狀態詳情在值有多種寫法時加一行「前端有 N 種寫法：「…」（檔案:行）…」。md §13 說明加上「前端各處寫法不同時以「／」依出現位置列出全部」。

## 測試

- 修改的既有斷言（需求方決定的新行為）：`R82StateChangesTest.frontendWordsAreUsedOnlyWhereEveryGroupAgrees` 改名為 `frontendWordsAreKeptAndDisagreementsListEveryWord`，PENDING 由「沒有中文」改為「等待店家確認／待確認」，並驗證 `labelWords` 的來源順序。`r82-states.e2e` 增加多種寫法的檢查。三份 md golden 只有 §13 說明句不同（以腳本換回後逐位元組相同），`wp40-md-decision-equivalence` 雜湊更新。

## 後果

- reservio：PENDING「待確認／等待店家確認」、CANCEL_REQUESTED「取消申請中／取消申請處理中」，其他三個狀態只有一種寫法。
- 寫法順序依檔案路徑與行號，不代表哪個較正式。
