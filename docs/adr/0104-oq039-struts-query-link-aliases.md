# ADR 0104：Struts 直接連到 JSP 的導覽保留查詢字串 alias（OQ-039）

## 狀態

已採用。

## 背景

R16 已決定：CONFIRMED 導覽的元件 `target` 若帶查詢字串，目標畫面要把該原值登記為 route alias（aa8a9f8），GraphIntegrityValidator 才能比對。054cf0c（WP69）開始解析相對 `html:link`／`html-el:link` 目標後，`StrutsProjectAnalyzer.addControl` 中「路徑直接對應到 JSP 畫面」的分支只登記去除查詢字串的路徑，未登記元件 `target` 原值。Apache Struts 1 範例 cookbook、el-example、examples 中，例如 `exercise/` 底下的 `html:link page="bean-parameter.jsp?param1=value1&amp;param2=value2"`，因此產生 69、31、3 個「Navigation target does not match screen route or view」錯誤，CLI 以結束碼 1 停止。

## 決定

在該分支建立 CONFIRMED 導覽前，除了路徑外，也把元件節點的 `target` 屬性原值登記為目標畫面的 route alias。驗證規則不變；查詢字串與 `&amp;` 原樣保留，不做解碼或正規化。

## 驗證

- 新增 `StrutsQueryLinkAliasTest`：帶查詢字串的相對 `html:link` 在修正前驗證失敗、修正後通過，且目標畫面的 `routeAliases` 含元件 `target`；不帶查詢字串時 alias 仍只有路徑。
- Apache Struts 1（commit 02c9ff7485b1900515c6e0b32ed54ea46dd97d51）八個範例模組：cookbook、el-example、examples 恢復產出合格圖；blank、faces-example1、faces-example2、mailreader、scripting-mailreader 的 `application-graph.json` 與 `preview-model.json` SHA-256 與修正前相同。

## 後果

帶查詢字串的直接 JSP 連結可正常顯示為導覽；不影響 Spring 與 React 專案。
