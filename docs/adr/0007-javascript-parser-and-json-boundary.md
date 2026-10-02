# ADR 0007：JavaScript AST 與 JSON 邊界

## 背景

WP4 必須解析 ES5 至解析器目前支援的 ECMAScript 語法、module 與錯誤來源，不得執行目標程式。Java adapter 消費獨立 Node 模組的 JSON。

## 選項

Acorn 搭配 acorn-loose；或 Babel parser 的 errorRecovery。Babel 的不可恢復語法仍會拋錯，另需明確處理。

## 決定

新增 screentrace-js，釘選 acorn 8.18.0 與 acorn-loose 8.5.2（兩者 MIT，與本專案相容），lockfile 同時釘選間接相依。Acorn 正常解析使用 ecmaVersion latest；遇語法錯誤先記錄原始位置診斷，再由 loose AST 取得可恢復結構，該來源的語意解析結果保持 UNRESOLVED，不將修復 AST 視為確定證據。標準 ECMAScript 為範圍；非標準方言產生診斷。

解析器與授權依據：[官方專案](https://github.com/acornjs/acorn)、[Acorn 說明](https://github.com/acornjs/acorn/blob/master/acorn/README.md)。版本與 license 由 npm registry 查核（2026-10-03）。

只 import 本工具及釘選解析器；目標文字僅傳給 parse，禁止 eval、Function、vm、require 或 import 目標。來源读取沿用 screentrace-capture/safe-files.mjs 的 8 MiB 上限與路徑／符號連結限制；錯誤及超限必須診斷。工具 JSON stdin/stdout 不直接接受目標模組為 Node 入口。

## 後果

新增兩個相依，CI 對此模組執行 npm ci、所有測試、npm audit；Dependency-Check 保留 root aggregate，新增模組 lockfile 在掃描範圍。解析與渲染分離，WP6 的 JS 關閉規則不變。增量一只提供 AST、診斷與 JSON 邊界；事件／語意／Java 圖整合由後續 WP4 增量加入。
