# ADR 0159：R81 沒有畫面的系統自動作業（排程、事件、啟動時）

## 背景

[reservio 評估（2026-11-18）](../RESERVIO_EVALUATION_20261118.md) P1：預約結束自動完成、預約前提醒、通知寄送、LINE 事件處理與資料清理都由排程執行，沒有畫面，報表與 md 完全看不到。需求方於 2026-11-18 決定（OQ-056）：

| 問題 | 決定 |
|---|---|
| 呈現位置 | API 頁新增「系統自動作業」分組，md 新增一章；維持「畫面、API 兩大類」 |
| 偵測範圍 | `@Scheduled`（含 `@Schedules`）、`@EventListener`／`@TransactionalEventListener`、`ApplicationRunner`／`CommandLineRunner` |

## 決定

### Java（`SpringBackgroundJobs`，Spring adapter）

- 在 `SpringProjectAnalyzer` 兩條管線分析完成後、`BackendCallChains` 之前套用，所以作業自動取得後端呼叫鏈（ADR 0156）。
- 每個作業是一個 HANDLER，ID 沿用 `StableGraphIds.handler(檔案, 類別全名, 方法簽章)`；同一方法已是 Controller 處理程式時只加 attributes。attributes：`class`、`method`、`trigger`（`SCHEDULE`／`EVENT`／`STARTUP`）、`triggerText`（白話執行時機）、`triggerExpression`（原始宣告）、選填 `triggerNote`、`triggerProperty`、`eventType`、`eventPublishers`（JSON：`from`、`source`）。evidence parser 為 `SpringBackgroundJobs`。不新增節點或邊類型，schema 不變。
- 執行時機（`ScheduleText`）：
  - cron 只翻譯下列形狀：每 n 秒、每 n 分鐘、每分鐘、每小時第 m 分、每 n 小時、每天 HH:MM、每週（`MON-FRI`、`1-5`、清單）HH:MM、每月 d 日 HH:MM，以及 Spring 巨集與 `-`（停用）。其他形狀寫成「依排程規則 `<原文>` 執行」，不猜測。`zone` 附在句尾。
  - `fixedRate`／`fixedDelay`（含 `*String`、`timeUnit`、ISO-8601、整數字面值的加減乘）寫成「每 X 執行一次」／「上一次執行完成後隔 X 再執行」，`initialDelay` 附「啟動後先等 X」。
  - 設定佔位 `${key:default}`：基礎設定檔（`application.properties`／`.yml`，不含 profile）有字面值或 `${ENV:預設}` 時採用，否則用程式碼中的預設值；結果為 INFERRED，`triggerNote` 說明來源，並列出其他設定檔對同一 key 的設定。沒有可確定的值、常數參照或字串串接為 UNRESOLVED，`triggerText` 寫「無法確定」並附原文。
  - 專案中找不到 `@EnableScheduling` 或 XML `<task:annotation-driven>` 時，排程降為 INFERRED 並註明可能沒有啟用。
- 事件：事件類型取自 `value`／`classes` 或唯一參數型別；`ApplicationReadyEvent`、`ApplicationStartedEvent`、`ContextRefreshedEvent` 視為啟動時。`@TransactionalEventListener` 依 `phase` 加「交易提交後／前、回復後、結束後」。發布來源只認 `publishEvent(new 事件類別(...))`，記錄所在方法與行號；其他寫法不推論。

### viewer 與 md

- `shared/jobs.ts` 的 `backgroundJobs(graph)` 讀上述 attributes，排序為排程、事件、啟動時，再依名稱與 ID。
- API 頁在 API 群組之後列「系統自動作業」：列顯示觸發種類、執行時機與方法；詳情列執行時機、說明、`triggerNote`、原始設定與來源、事件的發布來源、後端呼叫（`backendCalls`）。作業不計入 API 數量與狀態比例，只在「全部」篩選與搜尋時顯示；不可標注保留／移除，`deriveApiUsage` 不變。
- md 新增 §12 系統自動作業（所有版本都輸出；沒有作業時寫「未偵測到…」），表格欄位：作業、觸發、執行時機、原始設定、解析、備註、來源。format_version 不變。

## 測試

- Java `R81BackgroundJobsTest`（6）：cron／fixed／ISO／timeUnit／zone、佔位與設定檔、UNRESOLVED、事件與發布來源、啟動時、後端呼叫鏈、未啟用排程、無作業時不變。
- viewer `r81-jobs.test`（2）、`r81-jobs.e2e`（1）。
- 修改的既有斷言：`golden/review.md`、`golden/malicious-review.md`、`golden/review-v4.md` 在附錄 A 前多出 §12；刪去 §12 後與修改前逐位元組相同（以腳本逐檔比對）。`wp40-md-decision-equivalence` 的整份 md 雜湊更新，刪去 §12 後的雜湊等於原值 `0f6b19eb…`。其他斷言不變。

## 後果

- 只看 Spring 註解與介面；XML `<task:scheduled>`、Quartz、`TaskScheduler` 程式化排程、`@Async` 不在範圍，Struts 管線也不套用。
- 作業類別是否真的是 Spring bean 不檢查；執行時機以原始碼與基礎設定為準，正式環境的 profile 或環境變數可能不同，報表與 md 都會註明。
