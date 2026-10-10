# ADR 0081：R16 WP59 Struts 重新稽核與文件邊界

- 狀態：已採納
- 日期：2026-10-11

## 背景

WP56–WP58 擴充 Struts Validator／dispatch 分析、訊息 bundle 與 Action 分類、以及 JSF 混合模組提醒。WP59 要求以 R15 的八個 Apache Struts 1.3.10 模組人工基準重新分析，對照報表中的「可能已經沒在用」項目，並實際檢視 mailreader、examples、faces-example2 的首頁、逐頁確認與 API 頁。

## 決定

1. 只把沒有靜態入口證據視為待人工確認的線索；不推論可刪除。逐頁 source audit 搜尋 `.jsp`、`.jspf`、`.tag`、`.html`、`.htm`、`.js`、`.java`、`.xml`、`.properties`，排除 JSP／HTML 註解、escaped markup、`<pre>`／`<code>` 內的文件範例。逐列命中的檔案與行號、文件／程式參照分類及判讀記錄在 `docs/reports/R16.md`。
2. 不為了匹配 R15 數字修改分析規則。`Welcome.jsp` 的 forward、index 靜態連結、模組 route、Tiles、JSF／Struts-Faces 等人工證據均照實記錄；無命中只表示目前搜尋未證明入口，外部直接 URL 或排程仍未知。
3. JSF／Struts-Faces 維持 OQ-026 的範圍：只產生診斷與受影響畫面提醒，不把元件或其行為計為已解析。Viewer 使用「JSF 元件未分析」警語，逐頁只提示受影響畫面。
4. Struts 邏輯 action path 與 servlet 公開 URL 保持單一 endpoint 身分；別名列在技術細節。沒有解析到畫面的 Action 顯示「Struts 動作」。
5. WP59 瀏覽器觀察只用背景 headless Chromium 與本機 `file://` 報表，尺寸為 1440×900；不使用 Safari、不切換桌面。截圖留在 repo 外。隔離環境阻擋 capture 子程序啟動 Chromium時，報表預覽如實顯示未取得，不將其寫成成功捕獲。
6. WP59 實測保留 R15 基準與每個模組的 graph／API 狀態數字，eMusicStore 兩種 context path 與 PetClinic 的 graph SHA-256 必須與 R16 基準逐位元組相同。

## 影響

PRODUCT_SPEC、ARCHITECTURE、USER_GUIDE、ROADMAP 與 R16 報告已更新，清楚區分圖上的未解析／無入口線索與「確定未使用」。本 ADR 不授權 WP59 以外的 analyzer 修正；發現的新分析缺口交由後續決定。
