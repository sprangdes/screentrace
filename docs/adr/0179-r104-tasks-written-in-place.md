# ADR 0179：R104 直接寫在呼叫處的排程工作

## 背景

R96 認得 `TaskScheduler`、`ScheduledExecutorService` 等的程式排程，但交給它們的工作只認方法參照（`this::run`、`service::run`）與只有一個呼叫的 lambda。多行 lambda 與匿名 `Runnable`／`Callable`／`TimerTask` 沒有自己的方法名稱，原本整個略過。

## 決定

- `BackgroundJobs.localTask`：排程呼叫的工作是多行 lambda，或是含無參數 `run()`／`call()` 的匿名類別時，記為「寫在原處的工作」，以呼叫所在的方法與工作起始行表示。
- 作業節點：名稱為「`類別.方法()` 的排程工作（第 N 行）」，id 以方法簽章加 `task@行號` 產生，屬性 `taskLine` 記行號；`triggerNote` 說明工作直接寫在該方法第 N 行、沒有自己的方法名稱。執行時機沿用 R96 的讀法。
- `BackendCallChains`：作業帶 `taskLine` 時，只追蹤該 lambda 本體或匿名類別方法本體裡的呼叫與狀態寫入，不含排程呼叫前後的設定程式。推論原狀態時，往外找條件只到 lambda 或匿名類別方法為止，外層條件在工作執行時不一定成立。
- 工作先存成區域變數再交給排程（`Runnable r = …; scheduler.schedule(r, …)`）仍不認，避免追蹤變數的指派。

## 測試

- `R96MoreBackgroundJobsTest` 新增 1 個：多行 lambda 與匿名 `Runnable` 各成一個作業，後端呼叫只含工作本身。既有斷言不變。

## 後果

- reservio 沒有這類寫法，結果不變。
