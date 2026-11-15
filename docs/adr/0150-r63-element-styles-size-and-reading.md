# ADR 0150：R63 元素樣式改為精簡 JSON、直接解析位元組，讀取上限提高為 256 MiB

## 背景

R62（[ADR 0149](0149-r62-hotspots-and-oversized-capture.md)）讓過大的 `element-styles.json` 不再使報表失敗，但 300 個畫面的合成專案仍因超過 32 MiB 而失去元素樣式與元件標示。量測 R62 之後的狀態：

- 檔案 70 MB 中約三成是 `JSON.stringify(…, null, 2)` 的縮排；它是只給報表步驟讀的中間檔。
- 以 32 MiB 為上限與報表本身的政策不一致：報表超過 100 MB 只發警告、仍完整產出。
- 讀到上限內後，`PreviewCaptureReader` 對每個擷取元素掃描全部 relationship 與全部節點，300 個畫面要 140 秒。

## 決定

- R63-1：capture 以精簡 JSON 寫出 `element-styles.json`（300 個畫面：70 MB → 48.7 MB）。
- R63-2：`PreviewCaptureReader` 以 `readBytesLimited` 讀位元組後直接交給 Jackson，不再先建立整份檔案的 `String`；上限改為 256 MiB，與 React 預覽資料一致，可用 `-Dscreentrace.preview.maxStyleBytes` 調整。超過上限時沿用 ADR 0149 的處理（產出報表、不含元素樣式、`PREVIEW_STYLES_TOO_LARGE`）。
- R63-3：每個畫面的 CONTAINS 元件與依 expansion anchor 分組的元件只建立一次，取代每個元素的全掃描，驗證規則不變。
- 取代 ADR 0149 的 R62-2 中「上限維持 32 MiB」的部分；超過上限時的處理方式不變。

## 後果

- 300 個畫面的合成專案：報表含完整元素樣式；報表步驟 140 秒 → 7.5 秒；完整 CLI 173 秒；報表 121 MB（會出現既有的「超過 100 MB」警告）。
- 記憶體：上述報表步驟在 `-Xmx1g` 不足、`-Xmx2g` 可完成。JVM 預設 heap 為實體記憶體的 1/4，8 GB 以上的機器可直接執行；更大的專案若記憶體不足，需自行加大 heap 或調低上限讓報表略過元素樣式。
- 驗證：以修改前後的讀取程式產生同一份擷取的報表與 `preview-model.json`，逐位元組相同；capture 97、Maven 全數通過。
