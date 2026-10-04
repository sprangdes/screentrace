# ADR 0050：WP24 縮圖主體卡片與高解析 PNG

## 背景與選项

R6 要求縮圖主導總覽卡片且至少為顯示寬度的兩倍。原卡片 250×145、縮圖最大 180×65，capture／reader 上限 320px。PNG 無損且已有格式驗證；JPEG 可省容量但文字有損，WebP 非現有 Playwright screenshot 輸出，不能為此引入相依。

## 決定與後果

保留 PNG，capture 縮圖寬 640；保持既有 screenshot 寬高比與捕捉內容，不改原始 screenshot、元素對應、樣式或 graph。实际 capture 以靜態文件 scrollWidth／scrollHeight 截圖，並非所有頁面恰為第一屏；不另外裁去原本捕捉的內容。卡片維持寬250、增高220，縮圖容器176高（80%），object-fit:contain 不拉伸或裁圖，標題／URL在底部。無縮圖顯示「未取得重建預覽」，名稱只在底部出現一次。>150畫面使用 loading=lazy、decoding=async。

格距 y 240→315，卡片底部145→220、走廊180→255，保留横向340與流向排序；增加走廊幾何測試覆蓋完整220高卡片。reader上限同步640，PNG簽章／base64與範圍驗證保留，另測641被拒絕。沒有修改分析器／schema、md與決策。

真實容量量測：Petclinic 3,292,320→3,459,854（+5.09%）；eMusic 3,186,358→3,546,344（+11.30%）。均低於R6的25%，選PNG以保留文字清晰度；此數值為WP24階段，最終見R6報告。

## 授權修改的斷言（R6 §3）

- capture `captures every element with stable paths, all computed deltas and lossless style roundtrip`：PNG寬≤320→寬=640。僅直接鎖定被取代縮圖尺寸的斷言；元素／樣式／來源／決定性／安全斷言全數保留。
- `UI5 gutter routes choose nearby ports, never retrace and keep self loops distinct`：水平端口y132→170；向下出發y205→280；目的y300→375，合成目的卡片row同步300→375。均只反映新卡片尺寸／格距。所有不重複／不折返／反向線不同斷言不變。
- `UI5 long flows distribute across source gutters and enter the nearest vertical target port`：回程目的底部y205→280，合成row300→375。其他路徑／分散走廊斷言不變。

失敗測試b58f537證明舊320與舊卡片16.6%不符合；更新後兩個路由測試在還原舊overview.ts時都失敗，紀錄/private/tmp/wp24-updated-routes-red.log，之後恢復新實作。新增Java測試最初匯入錯誤已於69329aa修正，語意失敗為reader拒絕640px（/private/tmp/wp24-reader-red.log），不是把編譯失敗當功能證明。
