# ADR 0011：共用 URL 對應與明確 context path

## 背景與選項

WP5 要求 Spring／Struts 使用相同 URL 規則，並讀取 properties／YAML context 設定。現有路由比對會挑最高分候選。可沿用各 adapter 各自的猜測，或抽出共用引擎並保留全部候選。

## 決定

UrlResolution 放於兩種 adapter 已共用的 parser 模組，輸入端點、HTTP method、context 候選與來源證據。去 query／fragment／jsessionid；只按明確 context 值且路徑邊界匹配時剝除。精確 CONFIRMED、{var}／*／**／明確 servlet 副檔名映射 INFERRED；全部方法相容候選保留，多個 AMBIGUOUS，不以分數選一。方法缺省 GET，明示未知方法不得默認 GET。完整外部 URL、路徑逃逸、未知前綴不推測。

context 取 application properties／yml／yaml 與工作區明確設定；不啟動 profile 或讀環境變數。不同設定是候選，不決定啟用哪個 profile；全部列出。沒有設定診斷 CONTEXT_PATH_UNSPECIFIED，不猜 WAR 名稱。JS 的標準 pageContext contextPath 或來源證明的別名才能使用 context 前綴；actual context 無值保持未解析。

## 相依

新增 org.yaml:snakeyaml **2.4**，Apache-2.0，解析 YAML 必須使用 SafeConstructor，只建立純資料，不載入目標類別。版本／授權以 [發行 POM](https://central.sonatype.com/artifact/org.yaml/snakeyaml/2.4) 及 [原始碼](https://github.com/snakeyaml/snakeyaml) 確認。必要性：避免 regex 作為 YAML 結構解析器。LoaderOptions 限制 aliases、巢狀深度及 code points，duplicate keys 禁止；來源走 SafeProjectFiles。properties 使用 Java Properties。CI Dependency-Check 與 npm audit 必須通過。

## 後果

重疊精確／樣板路由不會被悄悄丟棄；信心、原始 URL、正規化候選及設定證據可回溯。配置不可讀／動態／重複／不安全時產生診斷，不用任意預設替代。
