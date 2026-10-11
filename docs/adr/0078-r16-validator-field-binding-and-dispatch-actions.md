# ADR 0078: R16 Validator 欄位關聯與 DispatchAction 分派

## 狀態

已採用。

## 決定

- Struts Validator rule 保留欄位名稱，並補上由同名 form-bean、Action mapping、表單欄位元件及所屬畫面構成的可證明關聯。圖欄位不唯一或無法證明時，規則仍保留，關聯欄位保持未解析並產生 `VALIDATION_RULE_UNRESOLVED` 診斷。
- `DispatchAction`、`LookupDispatchAction`、`MappingDispatchAction` 與 `EventDispatchAction` 的 submit 控制項保留各自的常值分派值，對應到可驗證的方法簽章，建立分派方法處理器與 endpoint。動態值仍維持未解析。
- Struts fixture 數量型 golden 依 OQ-031 更新；未改動其他既有測試或 fixture。

## 測試先行與授權 golden 變更

先提交 `c26495d`，新增手寫合成 fixture 測試 `validatorFieldsResolveToComponentsOnTheFormScreen` 與 `eventDispatchActionSubmitValueSelectsItsDeclaredMethod`。在實作前，Validator 規則只有欄位名稱、沒有畫面元件關聯；EventDispatchAction 沒有分派方法 handler。兩項新測試因此失敗。

依 OQ-031，`SyntheticProjectIntegrationTest.real source fixtures produce identical graph, packed HTML and shared-module md on consecutive runs` 所用的 `fixtures/wp10/struts1` 數量型 golden 僅有以下變更：

| 欄位 | 舊值 | 新值 | 原因與證據 |
|---|---:|---:|---|
| `behaviors_by_type.SUBMIT_FORM`（`struts1`） | 10 | 11 | `src/main/webapp/WEB-INF/views/page.jsp` 的 `/save.do` 表單有 `html:submit property="op" value="save"`，對應 `struts-config.xml` 中 `/save` 的 `synthetic.EditAction`、`parameter="op"`。舊實作在 addControl 中直接略過表單內 submit，未建立該分派行為；新實作建立一筆帶有靜態分派值的行為。新期望在舊實作上以 `synthetic-project.e2e.mjs` 的 golden 比對及先行的分派測試失敗。 |
| `behaviors_by_type.SUBMIT_FORM`（`struts1-spring`） | 12 | 16 | `src/main/webapp/WEB-INF/views/page.jsp` 的 `/save.do`、`/lookup.do`、`/mapping.do` 三個表單內含分派 submit，分別對應 `DispatchAction`、`LookupDispatchAction`、`MappingDispatchAction`；`struts-config.xml` 的 `parameter` 與 `getKeyMethodMap()` 提供常值方法證據。舊實作略過這些表單內 submit，未為其建立方法分派行為；修正後實際多出四筆可證明 submit 行為。新期望在舊實作上以 `synthetic-project.e2e.mjs` 的 golden 比對失敗。 |

其他 golden 欄位與 fixture 均未變更；`SUBMIT_FORM` 的增加代表可證明的分派行為被補回，不是既有來源遺失或斷言放寬。

## 驗證

完整 R14 §5 驗證結果記於 [R16 報告](../reports/R16.md)。
