# ADR 0130：R39 Java 原始碼以 google-java-format 排版並由 CI 檢查

## 背景

2026-11-11 的程式健檢（[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-001）發現 Java 程式碼過度壓縮：主程式 1.65M 字元只有約 1.9 萬行；`StrutsProjectAnalyzer.java` 163 KB、最長一行 1,463 字元；`SpringServerValidation.java` 63 行 16 KB。專案沒有任何格式化工具，PR diff 幾乎無法逐行審查。R34（PR #85）與 R38（PR #84）合併後已經沒有未合併的分支，可以一次重新排版。

## 決定

- R39-1：使用 Spotless Maven plugin 2.43.0 + google-java-format 1.24.0（Google 風格，2 格縮排、每行 100 字元）。範圍只有各模組的 `src/main/java/**/*.java` 與 `src/test/java/**/*.java`；`fixtures/`、測試資源與目標專案範例都不排版，因為它們的行號是分析結果的一部分。
- R39-2：plugin 只設定在根目錄 `pom.xml` 的 `pluginManagement`，不綁定任何 lifecycle phase，與 dependency-check 相同。一般的 `mvn verify` 不會下載或執行它；以完整座標呼叫：`mvn com.diffplug.spotless:spotless-maven-plugin:apply` 重新排版，`…:check` 檢查。
- R39-3：CI 的 `build-and-test` job 在「Build and test Java modules」之前加上「Check Java formatting」；格式不符時 CI 失敗。
- R39-4：一次重新排版全部 220 個 Java 檔案，只有排版改變。格式化工具只改空白、換行與 import 排序，不改語法樹；驗證方式見「後果」。
- R39-5：TypeScript／JavaScript（`screentrace-js`、`screentrace-capture`、`screentrace-viewer`）的格式化與大型檔案的拆分不在本段範圍，留在 HC-001 的後續工作。
- R39-6：在 `.git-blame-ignore-revs` 記錄重新排版的 commit，`git blame` 可以略過它（`git config blame.ignoreRevsFile .git-blame-ignore-revs`；GitHub 會自動套用）。

## 後果

- 220 個檔案、約 1.08 萬行變為 3.84 萬行；最長一行從 1,506 字元降為約 160 字元（剩下超過 100 字元的行，大多是 google-java-format 不會拆開的長字串常數）。
- 驗證：Maven 582 個測試全部通過；以排版前（main `808293b`）與排版後的 CLI 分析 reservio、spring-framework-petclinic、eMusicStore、demo-struts1、insure 與 `fixtures/` 的 struts、struts-spring、spring-boot-jsp、spring-mvc-jsp，9 個專案共 327 個產物檔案，只有 petclinic 的 `static-preview/element-styles.json` 不同；差異只來自兩個輸出目錄的絕對路徑不同（見 HEALTH_CHECK HC-009），把路徑正規化後內容相同。
- 之後修改 Java 時要先執行 `apply`；Codex sandbox 無法下載這個 plugin 時，由需求方在 sandbox 外排版後再交付 patch。
