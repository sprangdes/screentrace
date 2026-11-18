# ADR 0171：R96 背景作業：XML 排程、程式排程、Quartz、@Async 與 Struts 管線

## 背景

R81（[ADR 0159](0159-r81-background-jobs.md)）只認 Spring 的 `@Scheduled`、事件監聽與啟動時程式，且只在 Spring 管線套用。

## 決定

- `SpringBackgroundJobs` 與 `ScheduleText` 移到 `screentrace-parser-jsp`（`BackgroundJobs`，evidence parser 改為 `BackgroundJobs`），Spring 與 Struts 管線都在 `BackendCallChains` 之前套用；Spring 的外部登入讀值器改用它的設定讀取。
- 新增來源（都對應到被執行的方法，ID 規則不變）：
  - **XML**：`<task:scheduled ref="…" method="…" cron|fixed-delay|fixed-rate="…">`；`ref` 先找同檔 `<bean id|name>` 的 class，否則視為元件掃描的預設名稱（首字大寫的類別名）。出現 `scheduled-tasks` 即視為已啟用排程。
  - **程式排程**：在型別為 `TaskScheduler`／`ScheduledExecutorService`／`…Scheduler` 的欄位上呼叫 `schedule`、`scheduleAtFixedRate`、`scheduleWithFixedDelay`；工作須為方法參考（`this::m`、`service::m`）或只呼叫一個方法的 lambda。時間取自 `new CronTrigger("…")`、`Duration.ofX(n)`、毫秒數或 `TimeUnit`；其他寫法為 UNRESOLVED。
  - **Quartz**：繼承 `QuartzJobBean`（`executeInternal`）或實作 `Job`（`execute(JobExecutionContext)`）的類別；同一方法內有 `JobBuilder.newJob(X.class)` 時讀 `cronSchedule("…")` 或 `withIntervalIn…(n)`，否則寫「依 Quartz 觸發設定執行（時間無法確定）」（UNRESOLVED）。同一方法有多個來源時，時間已知的優先。
  - **@Async**：新觸發種類 `ASYNC`（「被呼叫後在背景另外執行，呼叫端不等它完成」）；找不到 `@EnableAsync` 時降為 INFERRED 並註明。
- 由別處排程的作業，`triggerNote` 註明排程設定所在的檔案與行號。
- viewer：`ASYNC` 標為「非同步」，排在最後。md §12 的標題不變，內容包含非同步作業。

## 測試

- Java `R96MoreBackgroundJobsTest`（2）、`R96StrutsBackgroundJobsTest`（1）；viewer `r81-jobs.test` 新增 1 個。`R81BackgroundJobsTest` 只改 parser 常數的引用位置。

## 後果

- reservio 不受影響（仍為 6 個排程）。
- 工作內容是匿名類別、或在 lambda 中做多件事的程式排程不列入；Quartz 觸發器設定在 XML 或資料庫時，時間無法確定。
