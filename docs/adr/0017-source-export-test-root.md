# ADR 0017：原始碼匯出中的測試根目錄

## 背景與選項

ProductionSchemaTest 的兩個靜態檢查向上尋找 .git，在原始碼匯出／部分 worktree 的 .git 非目錄時會走到 null。需求方指定以同時含 pom.xml 與 screentrace-core 目錄判定。

## 決定

共用 sourceRoot helper 向上尋找這兩個檔案系統標記，找到即回傳；走到根仍未找到則明確失敗。所有 fixture、斷言與掃描範圍不變，無新增相依。

## 後果與驗證

在 /tmp 建立完整來源副本，排除 .git、target、node_modules，確認副本不存在 .git。修改前在副本執行下列兩個測試：2 tests、2 NullPointerException；修改後同一副本／命令為 2 tests、0 failure／error／skip。一般 checkout 同命令亦通過。

```sh
mvn -q test '-Dtest=ProductionSchemaTest#onlyDeprecatedHistoricalReportAndExportEntriesWriteReports+productionSourcesNeverCallHistoricalConstructorsOrCreateSchemaOne' -Dsurefire.failIfNoSpecifiedTests=false
```

遠端全綠後才開始 WP6；WP7／WP8 不在本輪。
