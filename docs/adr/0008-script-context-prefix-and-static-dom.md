# ADR 0008：script src 的 context 前綴例外與靜態 DOM

## 背景

OQ-003：`${ctx}` 未定義時，部署 URL 與專案實體檔案的對應無法直接證明。需求方選擇受限制的方案 B，其他情況走 A。

## 選項

未知前綴全部 UNRESOLVED；或僅對 script src 授權不透明部署前綴與 web root 檔案比對。

## 決定

只接受開頭單一 `${var}` 或 `${pageContext.request.contextPath}`／`${pageContext.servletContext.contextPath}`，後面為不含另一個運算式的 / 路徑。專案任何來源的同名 EL 變數定義使預設假設失效：JSP／XML 標籤 var 定義與 Java 的 setAttribute／addAttribute／addObject 來源列為定義證據，未知／重新賦值保持 UNRESOLVED。Java 定義檢查沿用已釘選的 JavaParser 3.26.1（Apache-2.0／LGPL 雙授權，採 Apache-2.0），只新增 parser-jsp 對既有相依的使用，無新增版本。

同來源 c:set 字面值定義可用定義處來源組成 script src 的實體路徑，不將其当作部署前綴剝除；無法找到該字面路徑時 UNRESOLVED。c:url／spring:url 沿用 v1.2 的來源與作用域例外。跨來源定義只阻止不透明前綴假設，不借用其他頁面的值。

只匹配 inventory 中 web root（src/main/webapp、WebContent、WebRoot、webapp、web）內的安全檔案。單一候選 INFERRED；多個 AMBIGUOUS 全部列出，無候選 UNRESOLVED 並診斷；不分析歧義候選。中間變數、完整 URL／協定相對 URL、多變數均排除。不將此規則用於 API URL，WP5 未開始。

Java 以既有 MarkupTag 提供原始靜態 DOM／事件／script 來源，Node AST 解析事件註冊。CSS 選擇器支援 ID、class、name、tag、後代與 this；動態、不支援或無匹配維持 UNRESOLVED。DOM 結構包含非互動祖先，觸發者使用既有來源 component ID；選擇器比對不創造確定的動態元件。

## 後果

加上來源與反例測試，保留原文、定義證據、全部候選與實際檔案位置。scope 無法證明時不使用定義。所有新增讀取沿用 SafeProjectFiles，未執行目標 Java／JS。原有測試斷言不變。

Java 整合補充：標準 context path 的本地 c:set 別名保留定義證據；Java model／request 定義（含 @ModelAttribute）參與矛盾檢查。靜態普通 DOM 容器只有被事件匹配時才投影為 OTHER 元件；條件／迴圈來源保留，動態元素不提升信心。
