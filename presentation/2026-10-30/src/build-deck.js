// ScreenTrace 技術分享簡報產生器（pptxgenjs）
// 用法：node src/build-deck.js [輸出檔]；環境變數 DECK_FONT 可覆寫中文字型（QA 用）
const path = require("path");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] || path.join(ROOT, "ScreenTrace-技術介紹.pptx");
const IMG = (f) => path.join(ROOT, "assets", f);

const F = process.env.DECK_FONT || "Microsoft JhengHei";
const CODE = "Consolas";
const C = {
  ink: "12263A", ink2: "1C3A50", teal: "1B7F8E", tealSoft: "E3F1F3",
  amber: "E9A23B", amberSoft: "FCF1DE", text: "1F2933", muted: "5B6B7A",
  tint: "F1F5F7", line: "C9D4DA", white: "FFFFFF",
  ok: "2E7D4F", okSoft: "E2F2E8", inf: "3A6EA5", infSoft: "E4ECF6",
  amb: "B7791F", ambSoft: "FBEFD9", unr: "B5473A", unrSoft: "F8E4E1",
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.title = "ScreenTrace 技術介紹";
pres.subject = "後端技術分享 2026-10-30";
pres.theme = { headFontFace: F, bodyFontFace: F };

pres.defineSlideMaster({ title: "COVER", background: { color: C.ink }, objects: [] });
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.white },
  margin: [0.5, 0.6, 0.5, 0.6],
  objects: [
    { text: { text: "ScreenTrace · 後端技術分享", options: { x: 0.6, y: 7.0, w: 5, h: 0.3, fontFace: F, fontSize: 10, color: C.muted, margin: 0 } } },
    { placeholder: { options: { name: "kicker", type: "body", x: 0.6, y: 0.32, w: 8, h: 0.32, fontFace: F, fontSize: 13, bold: true, color: C.teal, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.66, w: 12.1, h: 0.8, fontFace: F, fontSize: 30, bold: true, color: C.ink, margin: 0, valign: "top", align: "left" }, text: "" } },
  ],
  slideNumber: { x: 12.25, y: 7.0, w: 0.5, h: 0.3, fontFace: F, fontSize: 10, color: C.muted, align: "right" },
});

// ---------- helpers ----------
const T = (s, text, o) =>
  s.addText(text, Object.assign({ fontFace: F, fontSize: 16, color: C.text, margin: 0, valign: "top", isTextBox: true }, o));
const box = (s, x, y, w, h, fill, o = {}) =>
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: o.lineColor || fill, width: o.lineWidth || 0.75 } });
const circle = (s, x, y, d, fill, label, o = {}) => {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: o.ring || fill, width: o.ring ? 2 : 0.75 } });
  T(s, label, { x, y, w: d, h: d, align: "center", valign: "middle", color: o.color || C.white, bold: true, fontSize: o.size || 16 });
};
const arrow = (s, x1, y1, x2, y2, color = C.teal, width = 1.5) =>
  s.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1, line: { color, width, endArrowType: "triangle" },
  });
const code = (s, text, x, y, w, h, size = 14) => {
  box(s, x, y, w, h, C.ink);
  T(s, text, { x: x + 0.25, y: y + 0.2, w: w - 0.5, h: h - 0.4, fontFace: CODE, fontSize: size, color: "E6EEF2", lineSpacingMultiple: 1.15 });
};
const LV = { CONFIRMED: [C.okSoft, C.ok], INFERRED: [C.infSoft, C.inf], AMBIGUOUS: [C.ambSoft, C.amb], UNRESOLVED: [C.unrSoft, C.unr] };
const badge = (s, label, x, y, kind) => {
  const [bg, fg] = LV[kind];
  const w = 0.13 * label.length + 0.3;
  box(s, x, y, w, 0.3, bg);
  T(s, label, { x, y, w, h: 0.3, fontFace: CODE, fontSize: 11, bold: true, color: fg, align: "center", valign: "middle" });
  return w;
};
const shot = (s, file, x, y, w, h) => {
  s.addShape(pres.shapes.RECTANGLE, { x: x - 0.02, y: y - 0.02, w: w + 0.04, h: h + 0.04, fill: { color: C.line }, line: { color: C.line }, shadow: { type: "outer", blur: 6, offset: 2, angle: 90, color: "000000", opacity: 0.18 } });
  s.addImage({ path: IMG(file), x, y, w, h });
};
// 截圖上的編號標記：fx、fy 為截圖內相對位置（0–1）
const pins = (s, x, y, w, h, list) =>
  list.forEach(([fx, fy], i) => circle(s, x + fx * w - 0.2, y + fy * h - 0.2, 0.4, C.amber, String(i + 1), { color: C.ink, size: 14, ring: C.white }));
const legend = (s, items, x, y, w, gap = 0.9, numFill = C.amber) => {
  items.forEach(([head, body], i) => {
    const yy = y + i * gap;
    circle(s, x, yy, 0.4, numFill, String(i + 1), { color: numFill === C.amber ? C.ink : C.white, size: 14 });
    T(s, head, { x: x + 0.58, y: yy - 0.02, w: w - 0.58, h: 0.36, bold: true, fontSize: 16, color: C.ink });
    if (body) T(s, body, { x: x + 0.58, y: yy + 0.36, w: w - 0.58, h: gap - 0.4, fontSize: 13, color: C.muted });
  });
};
const banner = (s, runs, y = 6.0, h = 0.7, dark = false) => {
  box(s, 0.6, y, 12.1, h, dark ? C.ink : C.amberSoft);
  T(s, runs, { x: 0.9, y, w: 11.6, h, valign: "middle", fontSize: 16, bold: true, color: dark ? C.white : C.ink });
};
const bullets = (items) => items.map((t, k) => ({ text: t, options: { bullet: { indent: 18 }, breakLine: k < items.length - 1 } }));

let section = "";
const content = (title, kicker, notes) => {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(kicker, { placeholder: "kicker" });
  s.addText(title, { placeholder: "title" });
  if (notes) s.addNotes(notes);
  return s;
};
const divider = (num, title, sub, notes) => {
  const s = pres.addSlide({ masterName: "COVER", sectionTitle: section });
  T(s, num, { x: 0.8, y: 2.3, w: 3, h: 1.0, fontSize: 54, bold: true, color: C.amber, fontFace: "Arial" });
  T(s, title, { x: 0.8, y: 3.35, w: 11.5, h: 0.9, fontSize: 38, bold: true, color: C.white });
  T(s, sub, { x: 0.8, y: 4.35, w: 11.5, h: 0.6, fontSize: 20, color: "C9DCE3" });
  if (notes) s.addNotes(notes);
};

// ================= 1. 封面 =================
section = "開場";
pres.addSection({ title: section });
{
  const s = pres.addSlide({ masterName: "COVER", sectionTitle: section });
  T(s, "後端技術分享 · 2026.10.30", { x: 0.8, y: 1.45, w: 8, h: 0.4, fontSize: 16, bold: true, color: C.amber });
  T(s, "ScreenTrace", { x: 0.8, y: 1.95, w: 11, h: 1.2, fontSize: 60, bold: true, color: C.white, fontFace: "Arial" });
  T(s, "從原始碼重建畫面、流程與 API 的關係", { x: 0.8, y: 3.2, w: 11, h: 0.6, fontSize: 26, color: "C9DCE3" });
  const chain = ["畫面", "按鈕", "API", "Controller", "下一個畫面"];
  const cw = 1.95, gap = 0.5, y = 5.35;
  chain.forEach((t, i) => {
    const x = 0.8 + i * (cw + gap);
    box(s, x, y, cw, 0.7, C.ink2, { lineColor: "2F5873" });
    T(s, t, { x, y, w: cw, h: 0.7, align: "center", valign: "middle", fontSize: 17, bold: true, color: C.white });
    if (i < chain.length - 1) arrow(s, x + cw + 0.06, y + 0.35, x + cw + gap - 0.06, y + 0.35, C.amber, 2);
  });
  s.addNotes("開場（1 分鐘）。今天分三段：先介紹 ScreenTrace 是什麼、能做什麼、怎麼用；再看它的技術架構；最後拿 reservio 專案的一個真實畫面「編輯服務」，一步一步看 ScreenTrace 怎麼從原始碼找出這個畫面怎麼來的、上面有什麼按鈕、按下去打哪支 API、又會去到哪裡。範例都是自有專案 reservio，不含公司程式碼。");
}

// ================= Part 1 =================
section = "認識 ScreenTrace";
pres.addSection({ title: section });
divider("01", "認識 ScreenTrace", "它要解決什麼問題、能做什麼、怎麼使用",
  "第一段約 10 分鐘：目的 → 功能 → 實際操作。");

// ---- 為什麼 ----
{
  const s = content("接手舊系統時，最常卡住的三件事", "目的",
    "約 1.5 分鐘。這是專案動機，不是量測過的工時改善（docs/REQUIREMENTS.md、docs/PRODUCT_SPEC.md）。一顆按鈕的去向，常要跨 JSP／JSX、JavaScript、設定檔與 Controller 才追得出來；畫面一多就只能靠人記。");
  const cards = [
    ["接", "接手舊系統", "文件早已過時，畫面和程式的對應只留在原開發者腦中"],
    ["盤", "功能盤點", "需求方用畫面溝通，後端用 URL 與 Controller，雙方缺少共同語言"],
    ["改", "決定改版範圍", "要先知道哪些畫面、按鈕、API 還在用，才能決定遷移什麼"],
  ];
  const w = 3.83, gap = 0.3;
  cards.forEach(([g, h, b], i) => {
    const x = 0.6 + i * (w + gap);
    box(s, x, 1.75, w, 3.55, C.tint);
    circle(s, x + 0.35, 2.1, 0.8, C.teal, g, { size: 24 });
    T(s, h, { x: x + 0.35, y: 3.1, w: w - 0.7, h: 0.5, bold: true, fontSize: 21, color: C.ink });
    T(s, b, { x: x + 0.35, y: 3.65, w: w - 0.7, h: 1.5, fontSize: 16, color: C.text, lineSpacingMultiple: 1.2 });
  });
  banner(s, "目標：把「人工追程式」變成可重現、每一步都能回到原始碼的分析結果", 5.7, 0.95, true);
}

// ---- 是什麼：輸入→輸出 ----
{
  const s = content("ScreenTrace 是什麼", "目的",
    "約 1.5 分鐘。輸入只有專案原始碼資料夾；一個指令就產出三樣東西：給人看的離線 HTML 報表、給程式與 AI 用的 application-graph.json、以及需求方標記後下載的決策 md。三個原則來自 AGENTS.md §2：唯讀、可追溯、不默默猜測。");
  // input
  box(s, 0.6, 1.9, 2.9, 2.3, C.tint);
  T(s, "輸入", { x: 0.85, y: 2.05, w: 2.4, h: 0.35, fontSize: 13, bold: true, color: C.teal });
  T(s, "專案原始碼", { x: 0.85, y: 2.45, w: 2.4, h: 0.5, fontSize: 21, bold: true, color: C.ink });
  T(s, "JSP、Java、XML、\nJS／TS、React", { x: 0.85, y: 3.05, w: 2.4, h: 0.9, fontSize: 14, color: C.muted });
  arrow(s, 3.6, 3.05, 4.25, 3.05, C.teal, 2.5);
  // engine
  box(s, 4.35, 1.9, 3.1, 2.3, C.ink);
  T(s, "ScreenTrace", { x: 4.6, y: 2.05, w: 2.6, h: 0.35, fontSize: 13, bold: true, color: C.amber });
  T(s, "./bin/screentrace\n<專案路徑>", { x: 4.6, y: 2.45, w: 2.7, h: 0.9, fontSize: 16, bold: true, color: C.white, fontFace: CODE });
  T(s, "靜態分析，不啟動系統", { x: 4.6, y: 3.5, w: 2.6, h: 0.4, fontSize: 14, color: "C9DCE3" });
  // outputs
  const outs = [
    ["離線 HTML 報表", "畫面地圖、預覽、試操作、API 頁"],
    ["application-graph.json", "畫面、按鈕、API 的關係與來源"],
    ["決策 md", "保留／移除的標記與分析限制"],
  ];
  outs.forEach(([h, d], i) => {
    const y = 1.75 + i * 0.9;
    arrow(s, 7.55, 3.05, 8.05, y + 0.37, C.teal, 1.5);
    box(s, 8.1, y, 4.6, 0.75, i === 0 ? C.amberSoft : C.tealSoft);
    T(s, h, { x: 8.3, y: y + 0.06, w: 4.3, h: 0.35, fontSize: 15, bold: true, color: C.ink });
    T(s, d, { x: 8.3, y: y + 0.39, w: 4.3, h: 0.3, fontSize: 12, color: C.muted });
  });
  // principles
  const ps = [["讀", "唯讀", "不啟動、不執行、不連資料庫、不改原始碼"], ["溯", "可追溯", "每條關係都記錄 file:line 與來源 parser"], ["證", "不猜測", "證明不了就標成推導、歧義或未解析"]];
  const w = 3.83, gap = 0.3;
  ps.forEach(([g, h, b], i) => {
    const x = 0.6 + i * (w + gap);
    box(s, x, 4.85, w, 1.8, C.white, { lineColor: C.line });
    circle(s, x + 0.3, 5.1, 0.6, C.ink, g, { size: 18 });
    T(s, h, { x: x + 1.1, y: 5.15, w: w - 1.3, h: 0.5, valign: "middle", bold: true, fontSize: 19, color: C.ink });
    T(s, b, { x: x + 0.3, y: 5.85, w: w - 0.6, h: 0.7, fontSize: 14, color: C.text });
  });
}

// ---- 主要功能 ----
{
  const s = content("它能幫你回答什麼", "功能",
    "約 1.5 分鐘。六個功能各自對應報表上的一個區塊，下一頁開始實際操作。最後兩項是給後端最常用的：從 API 反查哪些畫面在用，以及把畫面標記移除後，API 是否還有人用。");
  const fs = [
    ["畫面地圖", "有哪些畫面？彼此怎麼連？", "依網址分組的畫布"],
    ["畫面預覽", "不啟動系統，也能看到畫面長相", "靜態重建＋截圖"],
    ["按鈕去向", "這顆按鈕按下去會到哪個畫面？", "右側按鈕清單"],
    ["API 呼叫", "這個畫面、這顆按鈕打了哪些 API？", "呼叫的 API"],
    ["API 反查與契約", "這支 API 被誰呼叫？參數是什麼？", "API 頁"],
    ["保留／移除決策", "標記後哪些 API 變成可移除？", "標記＋下載 md"],
  ];
  const w = 3.83, h = 2.05, gx = 0.3, gy = 0.3;
  fs.forEach(([t, q, where], i) => {
    const x = 0.6 + (i % 3) * (w + gx), y = 1.75 + Math.floor(i / 3) * (h + gy);
    box(s, x, y, w, h, i >= 4 ? C.tealSoft : C.tint);
    T(s, String(i + 1).padStart(2, "0"), { x: x + 0.3, y: y + 0.22, w: 1, h: 0.45, bold: true, fontSize: 22, color: C.amber, fontFace: "Arial" });
    T(s, t, { x: x + 0.3, y: y + 0.7, w: w - 0.6, h: 0.45, bold: true, fontSize: 19, color: C.ink });
    T(s, q, { x: x + 0.3, y: y + 1.17, w: w - 0.6, h: 0.4, fontSize: 14, color: C.text });
    T(s, "報表位置：" + where, { x: x + 0.3, y: y + 1.6, w: w - 0.6, h: 0.3, fontSize: 12, color: C.teal });
  });
}

// ---- 使用 1：執行分析 ----
{
  const s = content("使用步驟 ①：一個指令完成分析", "怎麼使用",
    "約 1.5 分鐘。第一次執行 setup 會檢查並安裝 Java 17+、Maven 3.9+、Node 18+、Playwright 與 Chromium（macOS 用 Homebrew、Windows 用 winget），需要網路。之後一個指令就完成分析並自動用 Chrome／Edge 開啟報表。結果寫入 <ScreenTrace>/analyze/<專案名稱>/，或 config 設定的分析結果根目錄。不帶參數執行會出現選單。來源：README.md、docs/ANALYST_GUIDE.md。");
  code(s, [
    "# 第一次：安裝與檢查環境",
    "./bin/screentrace setup",
    "",
    "# 分析專案並開啟報表",
    "./bin/screentrace ~/projects/reservio",
    "",
    "# Windows",
    ".\\bin\\screentrace.cmd C:\\projects\\reservio",
  ].join("\n"), 0.6, 1.8, 6.6, 3.6, 15);
  T(s, "產出位置", { x: 7.7, y: 1.8, w: 5, h: 0.4, fontSize: 17, bold: true, color: C.ink });
  box(s, 7.7, 2.3, 5.0, 3.1, C.tint);
  T(s, [
    { text: "analyze/reservio/", options: { bold: true, breakLine: true } },
    { text: "├─ report/", options: { breakLine: true } },
    { text: "│   └─ screentrace-report.html", options: { color: C.teal, bold: true, breakLine: true } },
    { text: "├─ application-graph.json", options: { color: C.teal, bold: true, breakLine: true } },
    { text: "├─ screenshots/", options: { breakLine: true } },
    { text: "└─ static-preview/", options: {} },
  ], { x: 7.95, y: 2.5, w: 4.6, h: 2.7, fontFace: CODE, fontSize: 14, color: C.text, lineSpacingMultiple: 1.3 });
  banner(s, [
    { text: "報表是單一 HTML 檔：", options: { color: C.teal } },
    { text: "可以直接寄給需求方，雙擊用瀏覽器開啟，不需要伺服器或網路", options: {} },
  ], 5.85, 0.8);
}

// ---- 使用 2：報表總覽 ----
{
  const s = content("使用步驟 ②：先看整個系統有哪些畫面", "怎麼使用",
    "約 1.5 分鐘。這是 reservio 的報表首頁。① 左側清單可用網址或畫面名稱搜尋；② 畫布依網址分組，41 個畫面縮圖之間的線是可以互相前往的關係；③ 上方切換「畫面」與「API」兩個頁籤；④ 右上角是確認進度與下載 md。點一下畫面看關聯，點兩下打開。");
  const x = 0.6, y = 1.75, w = 7.9, h = 4.94;
  shot(s, "rv-canvas.png", x, y, w, h);
  pins(s, x, y, w, h, [[0.17, 0.2], [0.55, 0.3], [0.2, 0.035], [0.86, 0.085]]);
  legend(s, [
    ["畫面清單與搜尋", "輸入網址或名稱，快速找到畫面"],
    ["畫面地圖", "依網址分組；線代表畫面之間的去向"],
    ["畫面／API 頁籤", "從畫面看，或從 API 反查"],
    ["進度與下載 md", "已確認幾個畫面、匯出決策"],
  ], 8.95, 1.9, 3.8, 1.15);
}

// ---- 使用 3：打開一個畫面 ----
{
  const s = content("使用步驟 ③：打開畫面，看按鈕與 API", "怎麼使用",
    "約 2 分鐘。點兩下「編輯服務」打開。① 中間是靜態重建的預覽，可以點按鈕試操作，ScreenTrace 會依分析結果帶到下一個畫面（資料都是「示例值」）；② 保留／移除／未確認是需求方的決定；③ 展開按鈕清單，每顆按鈕都寫出會打的 API 與前往的畫面；④ 這個畫面會呼叫的 API；⑤ 從哪些畫面可以來到這裡。這個畫面就是第三段要拆解的例子。");
  const x = 0.6, y = 1.75, w = 7.9, h = 4.94;
  shot(s, "rv-edit.png", x, y, w, h);
  pins(s, x, y, w, h, [[0.4, 0.55], [0.975, 0.115], [0.9, 0.33], [0.975, 0.47], [0.93, 0.665]]);
  legend(s, [
    ["預覽與試操作", "點按鈕會依分析結果換頁"],
    ["保留／移除標記", "需求方對這個畫面的決定"],
    ["按鈕清單", "每顆按鈕的 API 與去向"],
    ["呼叫的 API", "這個畫面用到的所有 API"],
    ["從哪些畫面來", "反向的進入路徑"],
  ], 8.95, 1.85, 3.8, 0.97);
}

// ---- 使用 4：API 頁與交付 ----
{
  const s = content("使用步驟 ④：從 API 反查，最後交付 md", "怎麼使用",
    "約 1.5 分鐘。切到 API 頁：66 支 API 依 Controller 分組。點 POST /api/businesses/services/{id}/modify：處理程式 BusinessApiController.modifyServiceItem()（:394），呼叫來源是「編輯服務」畫面的兩顆按鈕，展開 Request／Response 可以看到 DTO 欄位。三種狀態依標記即時推導（viewer review.ts deriveApiUsage()）。所有標記可下載成 md，裡面包含決策與分析限制，可交給工程或 AI 接手。");
  const sts = [
    ["使用中", "至少一個呼叫來源仍保留或未確認", C.ok, C.okSoft],
    ["可移除", "所有呼叫來源都已標記移除", C.amb, C.ambSoft],
    ["未被使用", "畫面中找不到呼叫來源（外部系統仍可能使用）", C.unr, C.unrSoft],
  ];
  sts.forEach(([h, b, fg, bg], i) => {
    const y = 1.8 + i * 1.2;
    box(s, 0.6, y, 4.3, 1.02, bg);
    T(s, h, { x: 0.85, y: y + 0.1, w: 3.9, h: 0.4, bold: true, fontSize: 18, color: fg });
    T(s, b, { x: 0.85, y: y + 0.5, w: 3.9, h: 0.45, fontSize: 13, color: C.text });
  });
  box(s, 0.6, 5.5, 4.3, 1.15, C.ink);
  T(s, "下載 md", { x: 0.85, y: 5.6, w: 3.9, h: 0.4, bold: true, fontSize: 18, color: C.amber });
  T(s, "決策、來源與分析限制，交給工程或 AI 接手", { x: 0.85, y: 6.0, w: 3.9, h: 0.55, fontSize: 13, color: "D5E3E8" });
  shot(s, "rv-api-modify-crop.png", 5.3, 1.8, 7.4, 4.47);
  T(s, "reservio API 頁：處理程式、呼叫來源與 Request／Response", { x: 5.3, y: 6.38, w: 7.4, h: 0.3, fontSize: 13, color: C.muted });
}

// ---- 支援範圍 ----
{
  const s = content("支援範圍與邊界", "功能",
    "約 1 分鐘。來源：README.md、docs/ARCHITECTURE.md（ADR 0080 JSF 邊界、ADR 0092 Thymeleaf）。Struts 2 偵測到即以 UNSUPPORTED_FRAMEWORK 拒絕，不會產生半套結果。Angular、Spring Boot 4 是後續需求方向。");
  const cols = [
    ["支援", C.ok, C.okSoft, ["Struts 1", "Struts＋Spring", "Spring MVC（JSP）", "Spring Boot（JSP）", "Spring Boot＋React（react-router）"]],
    ["部分支援", C.amb, C.ambSoft, ["JSF 頁面：標記為未分析", "Thymeleaf：有限的 URL 與片段", "動態 URL、反射：保留為未解析"]],
    ["不在範圍", C.unr, C.unrSoft, ["Struts 2：直接拒絕分析", "Angular、Vue：後續方向", "自動轉換或修改程式碼"]],
  ];
  const w = 3.83, gap = 0.3;
  cols.forEach(([h, fg, bg, items], i) => {
    const x = 0.6 + i * (w + gap);
    box(s, x, 1.75, w, 3.75, bg);
    T(s, h, { x: x + 0.35, y: 1.95, w: w - 0.7, h: 0.5, bold: true, fontSize: 21, color: fg });
    T(s, bullets(items), { x: x + 0.35, y: 2.65, w: w - 0.6, h: 2.7, fontSize: 16, color: C.text, paraSpaceAfter: 10 });
  });
  banner(s, "原則：分析不了的部分明確標出來，不產生「看起來完整」的錯誤結果", 5.85, 0.8);
}

// ================= Part 2 =================
section = "技術架構";
pres.addSection({ title: section });
divider("02", "技術架構", "原始碼怎麼變成一張可追溯的圖", "第二段約 5 分鐘：模組、管線、Application Graph。");

// ---- 模組架構 ----
{
  const s = content("模組架構與資料流", "技術架構",
    "約 2 分鐘。根 pom.xml 有 7 個 Maven 模組：core、scanner、parser-jsp、adapter-struts、adapter-spring、report、cli；另有三個 Node 模組：screentrace-js（Acorn／Babel）、screentrace-capture（Playwright Chromium）、screentrace-viewer（報表前端）。core 不依賴 Spring、也沒有任何框架名詞，框架知識都放在 adapter（AGENTS.md §2.2）。reservio 這種 Spring Boot＋React 專案，後端由 adapter-spring 解析，前端由 screentrace-js 解析，最後在 core 合併。");
  const node = (x, y, w, h, title, sub, fill, fg = C.ink) => {
    box(s, x, y, w, h, fill, { lineColor: fill === C.white ? C.line : fill });
    T(s, title, { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.4, bold: true, fontSize: 15, color: fg, fontFace: CODE });
    if (sub) T(s, sub, { x: x + 0.15, y: y + 0.48, w: w - 0.3, h: h - 0.55, fontSize: 12, color: fg === C.white ? "C9DCE3" : C.muted });
  };
  node(0.6, 3.15, 1.9, 1.2, "原始碼", "目標專案（唯讀）", C.tint);
  arrow(s, 2.55, 3.75, 2.95, 3.75);
  node(3.0, 3.15, 1.9, 1.2, "scanner", "檔案探索、框架偵測、編碼", C.white);
  const px = 5.4, pw = 2.75;
  const parsers = [
    ["parser-jsp", "JSP 標記、Tag file、Tiles、include"],
    ["adapter-struts", "struts-config DOM、ActionForm、forward"],
    ["adapter-spring", "JavaParser AST、@Mapping、DTO"],
    ["screentrace-js", "Node：Acorn／Babel、React 路由與條件"],
  ];
  parsers.forEach(([t, d], i) => {
    const y = 1.75 + i * 1.08;
    const hl = i >= 2;
    node(px, y, pw, 0.92, t, d, i === 3 ? C.amberSoft : C.white);
    if (hl) s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: px - 0.06, y: y - 0.06, w: pw + 0.12, h: 1.04, rectRadius: 0.1, fill: { type: "none" }, line: { color: C.teal, width: 2, dashType: "dash" } });
    arrow(s, 4.95, 3.75, px - 0.08, y + 0.46, C.line, 1.25);
    arrow(s, px + pw + 0.08, y + 0.46, 8.6, 3.75, C.line, 1.25);
  });
  T(s, "虛線：reservio 用到的解析器", { x: 5.4, y: 6.12, w: 3.5, h: 0.3, fontSize: 12, color: C.teal });
  node(8.65, 3.0, 1.95, 1.5, "core", "Application Graph\n合併、驗證、穩定 ID", C.ink, C.white);
  arrow(s, 10.65, 3.75, 11.0, 2.55);
  arrow(s, 10.65, 3.75, 11.0, 3.75);
  arrow(s, 10.65, 3.75, 11.0, 4.95);
  node(11.05, 2.05, 1.65, 1.0, "graph.json", "正式產物", C.tealSoft);
  node(11.05, 3.25, 1.65, 1.0, "capture", "靜態預覽與截圖", C.amberSoft);
  node(11.05, 4.45, 1.65, 1.0, "report", "單一離線 HTML", C.tealSoft);
  box(s, 0.6, 6.45, 12.1, 0.45, C.tint);
  T(s, [
    { text: "screentrace-cli", options: { bold: true, fontFace: CODE, color: C.ink } },
    { text: "　協調整個流程：分析 → 預覽 → 封裝報表 → 開啟瀏覽器", options: { color: C.text } },
  ], { x: 0.9, y: 6.45, w: 11.5, h: 0.45, valign: "middle", fontSize: 14 });
  box(s, 8.65, 1.75, 0.3, 0.22, C.white, { lineColor: C.line });
  T(s, "Java 模組", { x: 9.05, y: 1.71, w: 1.2, h: 0.3, fontSize: 12, color: C.muted });
  box(s, 10.3, 1.75, 0.3, 0.22, C.amberSoft);
  T(s, "Node 模組", { x: 10.7, y: 1.71, w: 1.3, h: 0.3, fontSize: 12, color: C.muted });
}

// ---- 分析管線 ----
{
  const s = content("分析管線：五個階段", "技術架構",
    "約 1.5 分鐘。這是邏輯階段（ScreenTraceCli.analyze()、ProjectScanner、各 adapter、ApplicationGraphMerger、GraphIntegrityValidator、capture、SingleHtmlAnalysisWriter），不是五個獨立模組。每個解析器只貢獻節點與關係，由 core 合併，所以新增框架不必改核心。第三段的例子會依序走過第 2、3 步。");
  const st = [
    ["探索", "列出檔案\n偵測框架與技術訊號", "scanner"],
    ["解析", "XML、Java、JSP、\nJS／TS 各自解析", "parser／adapter"],
    ["關聯", "URL、method、view、\nforward 互相配對", "adapter"],
    ["驗證", "合併各解析結果\n檢查圖完整性與來源", "core"],
    ["重建與封裝", "靜態預覽、截圖\n打包成單一 HTML", "capture／report"],
  ];
  const w = 2.2, gap = 0.275;
  st.forEach(([h, b, m], i) => {
    const x = 0.6 + i * (w + gap);
    const dark = i === 2;
    box(s, x, 2.0, w, 3.3, dark ? C.ink : C.tint);
    T(s, String(i + 1).padStart(2, "0"), { x: x + 0.25, y: 2.2, w: 1, h: 0.5, fontSize: 24, bold: true, color: C.amber, fontFace: "Arial" });
    T(s, h, { x: x + 0.25, y: 2.8, w: w - 0.4, h: 0.5, bold: true, fontSize: 20, color: dark ? C.white : C.ink });
    T(s, b, { x: x + 0.25, y: 3.4, w: w - 0.4, h: 1.2, fontSize: 14, color: dark ? "D5E3E8" : C.text, lineSpacingMultiple: 1.15 });
    T(s, m, { x: x + 0.25, y: 4.75, w: w - 0.4, h: 0.35, fontSize: 12, fontFace: CODE, color: dark ? C.amber : C.teal });
    if (i < st.length - 1) arrow(s, x + w + 0.03, 3.65, x + w + gap - 0.03, 3.65, C.teal, 2);
  });
  banner(s, "關鍵在第 3 步：前端送出的 URL 要對上後端的 mapping，才成為一條完整流程", 5.75, 0.85);
}

// ---- Application Graph ----
{
  const s = content("Application Graph：所有輸出共用的一張圖", "技術架構",
    "約 2 分鐘。左邊是核心關係（screentrace-core ApplicationGraph.EdgeType），實際還有 CALLS、FORWARDS_TO、BINDS_TO 等。右邊是 reservio 圖中的一條真實關係（from／to 的穩定 ID 換成名稱）。報表的畫面地圖、按鈕清單、API 頁、md 都讀這同一張圖，所以每個結論都能回到 file:line。React 條件圖 schema 2.3。");
  const N = { SCREEN: [0.7, 1.95], COMPONENT: [4.0, 1.95], ENDPOINT: [4.0, 4.65], HANDLER: [0.7, 4.65] };
  const zh = { SCREEN: "畫面", COMPONENT: "按鈕／欄位", ENDPOINT: "API", HANDLER: "後端方法" };
  const nw = 2.3, nh = 0.85;
  Object.entries(N).forEach(([k, [x, y]]) => {
    const dark = k === "SCREEN";
    box(s, x, y, nw, nh, dark ? C.ink : C.tint, { lineColor: dark ? C.ink : C.line });
    T(s, k, { x, y: y + 0.08, w: nw, h: 0.4, align: "center", bold: true, fontFace: CODE, fontSize: 16, color: dark ? C.white : C.ink });
    T(s, zh[k], { x, y: y + 0.48, w: nw, h: 0.3, align: "center", fontSize: 12, color: dark ? "C9DCE3" : C.muted });
  });
  const lab = (t, x, y, w = 2) => T(s, t, { x, y, w, h: 0.3, fontFace: CODE, fontSize: 12, bold: true, color: C.teal, align: "center" });
  arrow(s, 3.05, 2.38, 3.95, 2.38); lab("CONTAINS", 2.5, 1.98);
  arrow(s, 5.15, 2.85, 5.15, 4.6); lab("TRIGGERS", 5.25, 3.55, 1.4);
  arrow(s, 3.95, 5.08, 3.05, 5.08); lab("HANDLED_BY", 2.5, 5.55);
  arrow(s, 1.85, 4.6, 1.85, 2.85); lab("RENDERS", 0.6, 3.55, 1.2);
  T(s, "COMPONENT ─NAVIGATES_TO→ SCREEN：按鈕前往的下一個畫面", { x: 0.7, y: 6.0, w: 5.8, h: 0.35, fontSize: 13, color: C.muted });
  const json = [
    "{",
    '  "type": "HANDLED_BY",',
    '  "from": "POST /api/businesses/',
    '           services/{id}/modify",',
    '  "to":   "BusinessApiController',
    '           .modifyServiceItem()",',
    '  "confidence": "CONFIRMED",',
    '  "evidence": [{',
    '    "source": { "file": "…/',
    '      BusinessApiController.java",',
    '      "line": 394 },',
    '    "parser": "SpringBootAnalyzer" }]',
    "}",
  ].join("\n");
  code(s, json, 7.0, 1.85, 5.7, 4.15, 13);
  T(s, "reservio 的實際關係（ID 已換成名稱）", { x: 7.0, y: 6.08, w: 5.7, h: 0.35, fontSize: 13, color: C.muted });
}

// ================= Part 3 =================
section = "實例：編輯服務";
pres.addSection({ title: section });
divider("03", "實例：拆解 reservio「編輯服務」", "ScreenTrace 怎麼從原始碼找出這個畫面的來龍去脈",
  "第三段約 10 分鐘，也可以邊講邊開 demo/react-reservio.html 對照。reservio 是 Spring Boot 後端＋React（react-router）前端的自有專案，共 41 個畫面、66 支 API。");

// ---- 例子總覽 ----
{
  const s = content("今天的例子：/service/:id/edit", "實例：編輯服務",
    "約 1 分鐘。商家在「服務管理」點某項服務的「編輯」，進到這個畫面修改服務名稱與時長，按「儲存服務」後回到服務管理。我們要用四個問題拆解它，每一題都會先看原始碼，再看 ScreenTrace 圖裡產生了什麼。截圖中的欄位內容是示例值。");
  shot(s, "rv-edit.png", 0.6, 1.75, 7.6, 4.75);
  const qs = [
    ["這個畫面怎麼來的？", "路由、身分條件、畫面元件"],
    ["畫面上有什麼？", "欄位、按鈕、連結"],
    ["按鈕打了哪支 API？", "前端呼叫 → 後端方法 → 參數"],
    ["從哪來、能去哪？", "進入路徑與離開路徑"],
  ];
  legend(s, qs, 8.6, 1.9, 4.1, 1.15, C.teal);
}

// ---- Q1 畫面怎麼來的 ----
{
  const s = content("① 這個畫面怎麼來的", "實例：編輯服務",
    "約 2 分鐘。screentrace-js 用 Babel 解析 App.tsx 的 JSX：第 273 行的 <Route path=\"/service/:id/edit\"> 產生一個 ENTRY_POINT（網址入口，CONFIRMED），它 RENDERS 一個 SCREEN。外面包的 RequireBusiness（第 107–114 行）是 Guard，ScreenTrace 把它的判斷式記成這個畫面的「適用條件」：必須是商家、已建立商家資料、且不需要強制改密碼。element 往下追到 ServiceEditorScaffold → ServiceEditorPage，就是畫面內容的來源檔。");
  code(s, [
    "// frontend/src/App.tsx",
    "function RequireBusiness({ children }) {        // L107",
    "  const { me, loading } = useAuth();",
    "  if (!me) return <Navigate to={loginPath}/>;",
    "  if (me.mustChangePassword",
    "      || me.role !== 'ROLE_BUSINESS'",
    "      || !me.business)                          // L112",
    "    return <Navigate …/>;",
    "  return children;",
    "}",
    "",
    "<Route path=\"/service/:id/edit\"                 // L273",
    "  element={<RequireAuth><RequireBusiness>",
    "    <ServiceEditorScaffold editing/> …}/>",
  ].join("\n"), 0.6, 1.75, 6.9, 4.95, 13);
  // results
  T(s, "ScreenTrace 產生", { x: 7.95, y: 1.75, w: 4.7, h: 0.4, bold: true, fontSize: 17, color: C.ink });
  const rs = [
    ["ENTRY_POINT", "/service/:id/edit", "App.tsx:273", "CONFIRMED"],
    ["SCREEN", "編輯服務", "RENDERS ← 入口", "INFERRED"],
    ["適用條件", "ROLE_BUSINESS、有 business、\n不需強制改密碼", "App.tsx:112", "INFERRED"],
    ["畫面元件", "ServiceEditorScaffold\n→ ServiceEditorPage.tsx", "SettingsPages.tsx:48", null],
  ];
  rs.forEach(([k, v, loc, lv], i) => {
    const y = 2.25 + i * 1.12;
    box(s, 7.95, y, 4.75, 1.0, i === 1 ? C.ink : C.tint);
    const dark = i === 1;
    T(s, k, { x: 8.15, y: y + 0.1, w: 2.2, h: 0.3, fontFace: CODE, fontSize: 12, bold: true, color: dark ? C.amber : C.teal });
    T(s, v, { x: 8.15, y: y + 0.4, w: 3.1, h: 0.58, fontSize: 13, bold: true, color: dark ? C.white : C.ink });
    T(s, loc, { x: 10.35, y: y + 0.1, w: 2.25, h: 0.3, fontFace: CODE, fontSize: 11, color: dark ? "C9DCE3" : C.muted, align: "right" });
    if (lv) badge(s, lv, 12.6 - (0.13 * lv.length + 0.3), y + 0.62, lv);
  });
}

// ---- Q2 畫面上有什麼 ----
{
  const s = content("② 畫面上有什麼", "實例：編輯服務",
    "約 1.5 分鐘。ServiceEditorPage.tsx 第 22 行回傳的 JSX 裡有：返回服務管理的 <Link>、兩個 <input>（service-name、service-duration）、以及 StickySaveBar 元件。Babel 會跟進 StickySaveBar.tsx，找出裡面的「儲存服務」「捨棄變更」兩顆按鈕；也會展開外層的 BusinessWorkspaceShell（側邊欄、頂部列、登出）。所以圖中這個畫面 CONTAINS 30 個元件，報表的按鈕清單顯示 27 個可操作項目。載入或儲存失敗時才出現的「重試」按鈕也會列出。");
  code(s, [
    "// ServiceEditorPage.tsx  L22（節錄）",
    "<SettingsPageHeader title=\"編輯服務\"",
    "  actions={<Link to=\"/service/manage\">",
    "             返回服務管理</Link>}/>",
    "<input id=\"service-name\" …/>",
    "<input id=\"service-duration\" type=\"number\"/>",
    "<StickySaveBar onSave={() => void save()}",
    "  onDiscard={form.discard}",
    "  primaryLabel={editing ? '儲存服務' : …}/>",
  ].join("\n"), 0.6, 1.75, 6.3, 3.9, 13);
  box(s, 0.6, 5.85, 6.3, 0.8, C.ink);
  T(s, [
    { text: "30", options: { fontFace: "Arial", fontSize: 28, bold: true, color: C.amber } },
    { text: "  個 COMPONENT（圖）／ 27 個按鈕與連結（報表）", options: { fontSize: 14, color: C.white } },
  ], { x: 0.85, y: 5.85, w: 5.9, h: 0.8, valign: "middle" });
  // component groups
  const groups = [
    ["本頁內容", ["服務名稱、服務時長（2 個欄位）", "儲存服務、捨棄變更", "返回服務管理（連結）"], C.amberSoft],
    ["共用外框", ["側邊欄：營運概覽、預約中心、服務、商家設定…", "頂部列：通知、帳號、登出"], C.tint],
    ["狀態元件", ["載入失敗時的「重試」", "登入逾時提醒的對話框"], C.tint],
  ];
  let y = 1.75;
  groups.forEach(([h, items, bg]) => {
    const hh = 0.62 + items.length * 0.42;
    box(s, 7.3, y, 5.4, hh, bg);
    T(s, h, { x: 7.55, y: y + 0.12, w: 4.9, h: 0.35, bold: true, fontSize: 16, color: C.ink });
    T(s, bullets(items), { x: 7.55, y: y + 0.52, w: 5.0, h: items.length * 0.42, fontSize: 14, color: C.text });
    y += hh + 0.25;
  });
}

// ---- Q3a 前端呼叫鏈 ----
{
  const s = content("③ 按下「儲存服務」，打了哪支 API", "實例：編輯服務",
    "約 2 分鐘。從按鈕往下追呼叫鏈：StickySaveBar 的 onSave 指向 save()（L19）；save() 呼叫 api.modifyServiceItem(id, payload)；api.ts 第 241 行用樣板字串組出 /api/businesses/services/${id}/modify，method POST；共用的 request() 在送 POST 前會先取 CSRF token，所以同時記錄 GET /api/csrf（api.ts:36）。儲存成功後再呼叫 businessServices() 重新讀取，並 navigate('/service/manage')。evidence 記為「跨函式呼叫：request」，因為網址是樣板組出來的，所以是 INFERRED。");
  const chain = [
    ["按鈕", "「儲存服務」", "StickySaveBar onSave", "ServiceEditorPage.tsx:22"],
    ["事件處理", "save()", "驗證表單後呼叫 API", "ServiceEditorPage.tsx:19"],
    ["API 函式", "api.modifyServiceItem(id, payload)", "", "ServiceEditorPage.tsx:19"],
    ["組出請求", "request(`/api/businesses/services/${id}/modify`,\n        { method: 'POST' })", "", "api.ts:241"],
  ];
  const y0 = 1.75, rh = 0.82, gap = 0.2;
  chain.forEach(([role, src, sub, loc], i) => {
    const y = y0 + i * (rh + gap);
    if (i < chain.length - 1) s.addShape(pres.shapes.LINE, { x: 0.83, y: y + 0.55, w: 0, h: rh + gap - 0.3, line: { color: C.line, width: 2 } });
    circle(s, 0.6, y + 0.17, 0.46, C.teal, String(i + 1), { size: 15 });
    T(s, role, { x: 1.25, y, w: 1.5, h: rh, valign: "middle", bold: true, fontSize: 15, color: C.ink });
    box(s, 2.8, y, 6.0, rh, C.tint);
    T(s, src, { x: 3.0, y, w: 5.7, h: rh, valign: "middle", fontFace: CODE, fontSize: 13, color: C.text });
    T(s, loc, { x: 8.95, y, w: 2.4, h: rh, valign: "middle", fontFace: CODE, fontSize: 11, color: C.teal });
  });
  // result box
  const ry = y0 + 4 * (rh + gap);
  box(s, 0.6, ry, 8.2, 0.95, C.ink);
  T(s, [
    { text: "TRIGGERS → ", options: { fontFace: CODE, color: C.amber, bold: true } },
    { text: "POST /api/businesses/services/{id}/modify", options: { fontFace: CODE, color: C.white, bold: true } },
  ], { x: 0.85, y: ry, w: 7.8, h: 0.95, valign: "middle", fontSize: 15 });
  badge(s, "INFERRED", 8.95, ry + 0.32, "INFERRED");
  // side notes
  box(s, 11.0, 1.75, 1.7, 4.95, C.white, { lineColor: C.line });
  T(s, "同一顆按鈕\n還記錄了", { x: 11.15, y: 1.9, w: 1.45, h: 0.7, fontSize: 13, bold: true, color: C.ink });
  T(s, [
    { text: "GET /api/csrf", options: { fontFace: CODE, bold: true, breakLine: true } },
    { text: "送 POST 前取 token", options: { color: C.muted, breakLine: true } },
    { text: " ", options: { breakLine: true } },
    { text: "GET …/services", options: { fontFace: CODE, bold: true, breakLine: true } },
    { text: "存完重新讀取", options: { color: C.muted, breakLine: true } },
    { text: " ", options: { breakLine: true } },
    { text: "→ 服務管理", options: { fontFace: CODE, bold: true, breakLine: true } },
    { text: "成功後換頁", options: { color: C.muted } },
  ], { x: 11.15, y: 2.7, w: 1.5, h: 3.8, fontSize: 11, color: C.text });
}

// ---- Q3b 前後端配對 ----
{
  const s = content("③ 前端的 URL，怎麼對上後端的方法", "實例：編輯服務",
    "約 2 分鐘。這是分析管線第 3 步「關聯」的實際樣子。前端樣板 /api/businesses/services/${id}/modify，RouteTemplateInference 把 ${id} 正規化成萬用段 /api/businesses/services/*/modify。後端由 adapter-spring 用 JavaParser 讀 BusinessApiController：類別上的 @RequestMapping(\"/api\")（L23）加上方法上的 @PostMapping(\"/businesses/services/{id}/modify\")（L394），組成 POST /api/businesses/services/{id}/modify。兩邊的 method 與路徑樣板對得上，就連成 TRIGGERS → HANDLED_BY。同時 ApiContractExtractor 從 @PathVariable、@RequestBody 與 ServiceItemRequest 擷取參數契約。");
  // frontend
  box(s, 0.6, 1.75, 3.9, 3.0, C.amberSoft);
  T(s, "前端（screentrace-js）", { x: 0.85, y: 1.9, w: 3.5, h: 0.35, fontSize: 13, bold: true, color: C.amb });
  T(s, "api.ts:241", { x: 0.85, y: 2.3, w: 3.5, h: 0.3, fontFace: CODE, fontSize: 11, color: C.muted });
  T(s, "POST\n/api/businesses/services/\n${id}/modify", { x: 0.85, y: 2.65, w: 3.5, h: 1.0, fontFace: CODE, fontSize: 13, bold: true, color: C.ink });
  T(s, "正規化 → /api/businesses/services/*/modify", { x: 0.85, y: 3.8, w: 3.5, h: 0.75, fontFace: CODE, fontSize: 11, color: C.text });
  // match
  circle(s, 4.75, 2.85, 0.8, C.teal, "=", { size: 26 });
  T(s, "method\n＋路徑樣板", { x: 4.55, y: 3.7, w: 1.2, h: 0.6, align: "center", fontSize: 11, color: C.muted });
  // backend
  code(s, [
    "// BusinessApiController.java",
    "@RequestMapping(\"/api\")                    // L23",
    "public class BusinessApiController {",
    "  @PostMapping(\"/businesses/services/{id}/modify\")",
    "  public ResponseEntity<ApiResponse<Void>>  // L394",
    "      modifyServiceItem(",
    "        @PathVariable Long id,",
    "        @RequestBody ServiceItemRequest request)",
  ].join("\n"), 5.95, 1.75, 6.75, 3.0, 12);
  // results row
  const res = [
    ["HANDLED_BY", "BusinessApiController\n.modifyServiceItem()", "CONFIRMED"],
    ["Request", "id: Long（PATH）\nname: String、duration: Integer", null],
    ["Response 200", "ApiResponse<Void>", null],
  ];
  res.forEach(([k, v, lv], i) => {
    const x = 0.6 + i * 4.13;
    box(s, x, 5.05, 3.85, 1.6, i === 0 ? C.ink : C.tint);
    const dark = i === 0;
    T(s, k, { x: x + 0.25, y: 5.18, w: 2.5, h: 0.35, fontFace: CODE, fontSize: 13, bold: true, color: dark ? C.amber : C.teal });
    T(s, v, { x: x + 0.25, y: 5.6, w: 3.4, h: 0.9, fontFace: CODE, fontSize: 13, color: dark ? C.white : C.ink });
    if (lv) badge(s, lv, x + 2.35, 5.2, lv);
  });
}

// ---- Q4 從哪來、去哪 ----
{
  const s = content("④ 從哪裡來，可以去到哪裡", "實例：編輯服務",
    "約 1.5 分鐘。進入：服務管理頁第 18 行的 <Link to={`/service/${encodeURIComponent(service.id)}/edit`}>「編輯」，網址是樣板組出來的，所以 NAVIGATES_TO 是 INFERRED。離開：「返回服務管理」<Link to=\"/service/manage\">（L22）與 save() 成功後的 navigate('/service/manage')（L19）都是字面值，CONFIRMED；側邊欄的連結來自共用外框；登出按鈕會打 POST /api/auth/logout 再到登入頁。另外，畫面一打開 load() 就會呼叫 GET /api/businesses/{businessId}/services 讀出要編輯的服務（L17 → api.ts:179）。");
  // center
  box(s, 4.85, 3.0, 3.6, 1.5, C.ink);
  T(s, "編輯服務", { x: 4.85, y: 3.12, w: 3.6, h: 0.55, align: "center", fontSize: 22, bold: true, color: C.white });
  T(s, "/service/:id/edit", { x: 4.85, y: 3.7, w: 3.6, h: 0.35, align: "center", fontFace: CODE, fontSize: 13, color: C.amber });
  T(s, "進入時 GET …/{businessId}/services", { x: 4.85, y: 4.6, w: 3.6, h: 0.35, align: "center", fontFace: CODE, fontSize: 11, color: C.muted });
  // incoming
  T(s, "從哪裡來", { x: 0.6, y: 1.75, w: 3.6, h: 0.4, bold: true, fontSize: 17, color: C.ink });
  box(s, 0.6, 3.0, 3.7, 1.5, C.tint);
  T(s, "服務管理「編輯」", { x: 0.8, y: 3.1, w: 3.3, h: 0.4, bold: true, fontSize: 15, color: C.ink });
  T(s, "<Link to={`/service/${id}/edit`}>", { x: 0.8, y: 3.5, w: 3.3, h: 0.35, fontFace: CODE, fontSize: 11, color: C.text });
  T(s, "ServiceManagementPage.tsx:18", { x: 0.8, y: 3.85, w: 3.3, h: 0.3, fontFace: CODE, fontSize: 10, color: C.teal });
  badge(s, "INFERRED", 0.8, 4.15 - 0.02, "INFERRED");
  arrow(s, 4.35, 3.75, 4.8, 3.75, C.teal, 2);
  // outgoing
  T(s, "可以去到哪裡", { x: 9.0, y: 1.75, w: 3.7, h: 0.4, bold: true, fontSize: 17, color: C.ink });
  const outs = [
    ["儲存服務 → 服務管理", "navigate('/service/manage') · L19", "CONFIRMED"],
    ["返回服務管理 → 服務管理", "<Link to=\"/service/manage\"> · L22", "CONFIRMED"],
    ["側邊欄 → 營運概覽、預約中心…", "DesktopWorkspaceSidebar.tsx:31", "CONFIRMED"],
    ["登出 → 登入", "POST /api/auth/logout · LogoutButton.tsx", "CONFIRMED"],
  ];
  outs.forEach(([h, d, lv], i) => {
    const y = 2.2 + i * 0.92;
    arrow(s, 8.5, 3.75, 8.95, y + 0.4, C.teal, 1.25);
    box(s, 9.0, y, 3.7, 0.8, C.tint);
    T(s, h, { x: 9.2, y: y + 0.07, w: 3.4, h: 0.35, bold: true, fontSize: 13, color: C.ink });
    T(s, d, { x: 9.2, y: y + 0.45, w: 3.4, h: 0.28, fontFace: CODE, fontSize: 10, color: C.teal });
  });
  banner(s, "樣板組出的網址標 INFERRED，字面值標 CONFIRMED：每條線都說明自己有多確定", 6.05, 0.6);
}

// ---- 合起來 ----
{
  const s = content("合起來：報表上看到的，就是這一整條線", "實例：編輯服務",
    "約 1.5 分鐘。把四個問題串起來：服務管理 →（編輯）→ 編輯服務 →（儲存服務）→ POST /api/businesses/services/{id}/modify → BusinessApiController.modifyServiceItem() → 回到服務管理。右邊是報表按鈕清單中「儲存服務」那一列：GET /api/csrf · POST …/modify · GET …/services · 前往「服務管理」，正好就是前面一步一步追出來的結果，而且每一段都能回到 file:line。可以現場打開 demo/react-reservio.html 對照。");
  const flow = [
    ["服務管理", "畫面", "ServiceManagementPage.tsx:18", C.tint, C.ink],
    ["編輯服務", "畫面 /service/:id/edit", "App.tsx:273", C.ink, C.white],
    ["儲存服務", "按鈕", "ServiceEditorPage.tsx:22", C.tint, C.ink],
    ["POST …/services/{id}/modify", "API", "api.ts:241", C.amberSoft, C.ink],
    ["modifyServiceItem()", "後端方法", "BusinessApiController.java:394", C.tint, C.ink],
    ["服務管理", "下一個畫面", "ServiceEditorPage.tsx:19", C.tint, C.ink],
  ];
  const edges = ["NAVIGATES_TO", "CONTAINS", "TRIGGERS", "HANDLED_BY", "NAVIGATES_TO"];
  const y0 = 1.75, rh = 0.62, gap = 0.27;
  flow.forEach(([t, k, loc, bg, fg], i) => {
    const y = y0 + i * (rh + gap);
    box(s, 0.6, y, 4.6, rh, bg, { lineColor: bg === C.tint ? C.line : bg });
    T(s, t, { x: 0.8, y, w: 2.9, h: rh, valign: "middle", fontFace: CODE, fontSize: 13, bold: true, color: fg });
    T(s, k, { x: 3.4, y, w: 1.7, h: rh, valign: "middle", align: "right", fontSize: 11, color: fg === C.white ? C.amber : C.muted });
    T(s, loc, { x: 5.35, y, w: 2.9, h: rh, valign: "middle", fontFace: CODE, fontSize: 10, color: C.teal });
    if (i < edges.length) {
      arrow(s, 1.1, y + rh + 0.02, 1.1, y + rh + gap - 0.02, C.teal, 1.5);
      T(s, edges[i], { x: 1.25, y: y + rh, w: 2, h: gap, valign: "middle", fontFace: CODE, fontSize: 10, color: C.muted });
    }
  });
  shot(s, "rv-edit-savebtn.png", 8.75, 1.75, 3.25, 4.97);
  T(s, "報表右側的按鈕清單", { x: 8.75, y: 6.78, w: 3.95, h: 0.25, fontSize: 12, color: C.muted });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.68, y: 4.92, w: 3.4, h: 0.95, rectRadius: 0.06, fill: { type: "none" }, line: { color: C.amber, width: 2.5 } });
}

// ---- 確定程度 ----
{
  const s = content("每條關係都標明「有多確定」", "實例：編輯服務",
    "約 1.5 分鐘。四種是解析狀態，不是機率。數字來自 analyze/reservio/application-graph.json：2,848 條關係中 CONFIRMED 2,520、INFERRED 294、AMBIGUOUS 34；無法證明的另外記成 5 筆診斷。AMBIGUOUS 例子：AuthShell.tsx:18 的「返回首頁」連到 /，但 / 依身分有訪客首頁與商家首頁兩個畫面，所以兩個都保留。UNRESOLVED 例子：SecurityConfig.java:104 的 LINE 登入導回路徑來自設定或運算式，ScreenTrace 不猜前端路由，記成 EXTERNAL_LOGIN_RETURN_UNRESOLVED。R17 起報表不直接顯示這些狀態，完整保留在圖與 md「分析限制」。");
  const lv = [
    ["CONFIRMED", "原始碼直接證明", "@PostMapping(…/modify)\n→ modifyServiceItem()", "2,520", "條關係"],
    ["INFERRED", "依明確規則推導", "`/api/…/${id}/modify`\n→ 修改 API", "294", "條關係"],
    ["AMBIGUOUS", "多個候選，全部保留", "「返回首頁」→ /\n訪客首頁或商家首頁", "34", "條關係"],
    ["UNRESOLVED", "無法證明，保留原文", "LINE 登入導回路徑\nSecurityConfig.java:104", "5", "筆診斷"],
  ];
  const w = 2.85, gap = 0.233;
  lv.forEach(([k, d, ex, n, unit], i) => {
    const x = 0.6 + i * (w + gap);
    const [bg, fg] = LV[k];
    box(s, x, 1.8, w, 4.85, bg);
    T(s, k, { x: x + 0.25, y: 2.0, w: w - 0.5, h: 0.4, fontFace: CODE, bold: true, fontSize: 16, color: fg });
    T(s, d, { x: x + 0.25, y: 2.45, w: w - 0.5, h: 0.4, bold: true, fontSize: 16, color: C.ink });
    T(s, ex, { x: x + 0.25, y: 3.0, w: w - 0.5, h: 1.0, fontFace: CODE, fontSize: 12, color: C.text });
    T(s, n, { x: x + 0.25, y: 4.45, w: w - 0.5, h: 1.0, fontFace: "Arial", bold: true, fontSize: 44, color: fg });
    T(s, "reservio · " + unit, { x: x + 0.25, y: 5.55, w: w - 0.5, h: 0.4, fontSize: 13, color: C.muted });
  });
}

// ================= 結語 =================
section = "結語";
pres.addSection({ title: section });
{
  const s = content("目前的限制，以及需要後端一起補的地方", "結語",
    "約 1.5 分鐘。來源：docs/ANALYST_GUIDE.md、docs/USER_GUIDE.md、docs/reports/R18.md、docs/ROADMAP.md。靜態預覽不等於原系統行為；目前只交付盤點範圍與 md，不自動轉換程式。");
  const L = [
    "反射、動態 SQL、執行期組出的 URL 無法保證還原",
    "預覽用示例資料；缺套件 CSS 或未解析邏輯會讓畫面有差異",
    "外部系統、排程、書籤、Webhook 的呼叫看不到",
    "只做盤點與決策交付，不自動轉換或修改程式",
  ];
  const R = [
    "核對 Controller 的回傳分支與導向是否完整",
    "補上外部呼叫來源：批次、其他系統、第三方回呼",
    "提供 context path 等部署設定，減少未解析 URL",
    "挑一條真實功能流程，一起驗證結果",
  ];
  const col = (x, title, items, fg, bg) => {
    box(s, x, 1.8, 5.9, 4.0, bg);
    T(s, title, { x: x + 0.35, y: 2.0, w: 5.2, h: 0.5, bold: true, fontSize: 20, color: fg });
    T(s, bullets(items), { x: x + 0.35, y: 2.7, w: 5.25, h: 2.95, fontSize: 16, color: C.text, paraSpaceAfter: 14, lineSpacingMultiple: 1.1 });
  };
  col(0.6, "靜態分析看不到的", L, C.unr, C.unrSoft);
  col(6.8, "需要後端同仁協助的", R, C.teal, C.tealSoft);
  banner(s, "靜態預覽是「示意」，不等於原系統行為；決策前仍需工程確認", 6.0, 0.65, true);
}
{
  const s = pres.addSlide({ masterName: "COVER", sectionTitle: section });
  T(s, "下一步", { x: 0.8, y: 1.2, w: 6, h: 0.4, fontSize: 16, bold: true, color: C.amber });
  T(s, "挑一個內部專案，驗證一條完整功能流程", { x: 0.8, y: 1.7, w: 11.7, h: 0.9, fontSize: 34, bold: true, color: C.white });
  const qs = ["畫面與按鈕的去向是否正確？", "Controller 的分支與 API 契約是否完整？", "有哪些外部入口需要補上？"];
  qs.forEach((q, i) => {
    const y = 3.2 + i * 0.95;
    circle(s, 0.8, y, 0.55, C.amber, String(i + 1), { color: C.ink, size: 16 });
    T(s, q, { x: 1.6, y, w: 10, h: 0.55, valign: "middle", fontSize: 22, color: "E6EEF2" });
  });
  T(s, "討論 · Q&A", { x: 0.8, y: 6.3, w: 6, h: 0.5, fontSize: 18, color: "8FB3C2" });
  s.addNotes("約 2–3 分鐘討論。建議收斂成一個具體行動：選一個內部專案、一條流程（入口 → 畫面 → 按鈕 → API → 後端方法 → 下一頁），由熟悉該系統的同仁核對結果。");
}

pres.writeFile({ fileName: OUT }).then((f) => console.log("wrote", f));
