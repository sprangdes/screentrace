# ADR 0151：R64 預覽擷取依截止時間停止，已完成的畫面照常寫出

## 背景

[CODE_REVIEW_20261114](../CODE_REVIEW_20261114.md) 的 RV-105：CLI 等待 `capture-static-jsp.mjs` 的上限（ADR 0143）一到就結束程序，而擷取腳本在全部畫面完成後才寫出 manifest 與樣式檔，所以只要超過上限，所有畫面的預覽一起消失。RV-104：結束時只停掉直接的 `node` 程序，Chromium 與版本管理工具的子程序可能繼續寫入輸出。

## 決定

- R64-1：擷取腳本接受 `--deadline=<epoch 毫秒>`。過了截止時間後不再開始新畫面；進行中的畫面照常完成（每頁已有 5 秒／3 秒的逾時），所有結果檔照常寫出。未開始的畫面在 `element-styles.json` 標為 `skipped`，診斷 `PREVIEW_CAPTURE_DEADLINE`，`diagnostics.json` 加上 `CAPTURE_DEADLINE_REACHED` 與數量。
- R64-2：CLI 傳入的截止時間為「上限 − 預留時間」，預留 `max(15, 上限/5)` 秒給進行中的畫面與寫檔。原本的上限仍保留作為最後手段。
- R64-3：最後手段觸發時，先強制結束整個子程序樹（`process.descendants()`），再結束擷取程序本身。
- 未設定 `--deadline` 時行為與修改前相同。

## 後果

- 大型專案在上限內完成的畫面都有預覽，其餘畫面在報表中明確標為「預覽擷取時間已用完」，不再整批消失。
- 驗證：capture 新增 2 個測試（截止時間已過時不擷取任何畫面但仍寫出全部結果檔；`runChains` 在 `mayStart` 回答否後不再開始新工作並回傳未處理項目），都已確認在修改前失敗；`CaptureTimeoutTest` 新增預留時間的檢查；既有「多頁擷取與單頁輸出逐位元組相同」的測試仍通過；capture 99、Maven 全數通過。
