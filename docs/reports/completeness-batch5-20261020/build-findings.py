"""Record observed failures with exact source lines; never changes assertions or product output."""
from pathlib import Path
import json
H=Path(__file__).resolve().parent;B=json.loads((H/'baseline.json').read_text());C=json.loads((H/'source-census.json').read_text());findings=[]
M='Materials-Program-Management';S='Student-Management-system';E='Expenses-Tracker-WebApp';m='WebRoot/WEB-INF/jsp/basedata/';s='src/main/webapp/WEB-INF/views/';e='src/main/resources/templates/';ej='src/main/java/com/SpringBootMVC/ExpensesTracker/'
def source(project,file,needle):
 text=(Path(B['projects'][project]['sourceRoot'])/file).read_text(encoding=B['projects'][project]['sourceEncoding']);return dict(file=file,line=next(i for i,line in enumerate(text.splitlines(),1) if needle in line),needle=needle)
def add(id,project,title,cases,file,needle,observed,acceptance,category='CORRECTNESS',priority='P1'):
 findings.append(dict(id=id,project=project,title=title,status='OPEN',category=category,priority=priority,cases=cases,source=source(project,file,needle),observed=observed,acceptance=acceptance))
add('WF-039',M,'GB18030 來源被當成 UTF-8，中文畫面與標籤毀損',['M01'],'WebRoot/index.jsp','pageEncoding="GB18030"','來源可嚴格 GB18030 解碼，預覽與標題卻有替代字元；五個必要中文字串皆缺失。','依來源宣告決定解碼並保留證據；重新驗證原始中文字串及圖名稱，不轉寫來源。',priority='P2')
add('WF-040',M,'Struts/Spring 代理沒有連到真實 Action、Dispatch 與共用登入攔截',['M02'],'src/applicationContext-actions.xml','class="com.bjsxt.drp.web.itemmgr.actions.ItemAction"','HANDLER 仍是 DelegatingActionProxy.execute；沒有 command 方法分派。登入目的集合漏 index，且將 list 的 redirect 擴成四個不相符的 dispatch 畫面。','按 XML bean 名稱與 action path 證明代理目標；保留 BaseAction 未登入分支與 command 對應，不混合其他方法的 forwards。')
add('WF-041',M,'WebRoot 相對表單／window.self.location 與 EL 查詢沒有還原目的',['M02','M03','M04','M05','M07','M09'],m+'item_maint.jsp','window.self.location = "additem.do','新增、返回、修改及上傳都沒有到來源可證明的目的；登入的相對 user/login.do 另成未解析 endpoint。','字面路徑與未知 query 值分離；依可證明的 request base 連到路由與方法，未知列值保留未知。')
add('WF-042',M,'五個存在的本地 CSS 與五個本地腳本參照沒有按請求目錄解析',[],m+'item_maint.jsp','href="../style/drp.css"','WebRoot/style/drp.css 存在但五個畫面都沒封裝；../script/windows.js 與四個 client_validate.js 參照皆產生找不到唯一來源診斷。','以 /basedata/item.do 的來源 render 證據解析 ../style、../script，且只封裝同專案安全路徑；外部 CDN 不抓取。',priority='P2')
add('WF-043',S,'RedirectView.setUrl 的 request.getContextPath 常見形狀未還原',['S04','S06','S07','X03'],'src/main/java/studentcurd/controller/MainController.java','redirectView.setUrl(request.getContextPath() + "/")','新增、更新與刪除仍留在原頁或顯示未知；兩個 handler 的目的集合缺失。同頁刪除未刷新文件。','證明同一 request 的部署相對 redirect，而非猜部署 context；回首頁及清單的目的完整，同頁回傳也須真的刷新。')
add('WF-044',S,'帶空白的 JSP EL 及相對 path-variable 連結維持未知',['S05','S07'],s+'studentlist.jsp','href="update/${s.id }"','updateForm 本身已知會渲染 updateform，但清單的 edit 點擊未知；帶 contextPath 空白的更新表單也無法前進。','正規化 EL 詞法空白，保留未知列值並匹配已知路由樣板；不能把未求值 id 寫成真實資料。')
add('WF-045',S,'jQuery toggleClass 已有 CONFIRMED 行為但沒有可回放操作',['S03'],'src/main/webapp/WEB-INF/resources/js/main.js',"toggleClass('active')",'圖中已有事件與 selector，但點兩次 sidebar/content 的 class 完全不變。','有來源證據的 class 操作以工具效果回放；兩個目標都要展開及收合，無來源 JS 執行。',priority='P2')
add('WF-046',E,'style.display 條件式篩選開關沒有改變可見狀態',['E03','E09'],e+'list-page.html','filterForm.style.display ===','初始 false、第一次點後 false、第二次點後 false；Apply 旅程因欄位仍隱藏而阻擋。','依有界來源操作重播 block/none 的選項，實際可見狀態收合→開啟→收合通過；再驗提交篩選。',priority='P2')
add('WF-047',E,'Thymeleaf fragment 呼叫及參數沒有組合到實際頁面',['E01','E02','E13'],e+'add-expense.html','th:replace="fragments/navbar','navbar.html 被當成獨立畫面，登入／註冊／支出／登出導覽沒有出現在呼叫頁。條件式與直接式 replace 均有影響。','圖與預覽要保留片段呼叫、參數與條件；在來源有證據的呼叫畫面可實際點擊導覽，不假設 session 狀態。')
add('WF-048',E,'if(!(confirm(...))) return false 沒有阻擋刪除',['E07','E08'],e+'list-page.html',"onclick=\"if(!(confirm('",'沒有出現確認視窗，也沒有可按的取消／確認控制；E07、E08 都失敗。','保留精確訊息，取消不得轉頁或改示範資料，確認才繼續已知來源目的。')
add('WF-049',E,'Spring Security DSL 的登入／登出請求入口未入圖',['E11','E13'],ej+'security/SecurityConfig.java','.loginProcessingUrl','21 個 Controller/Struts 路由都有，但 /authenticateTheUser、/logout 兩個配置入口皆不存在；登入送出顯示未知。','以來源證據表達 filter 入口與 custom success handler 的 /list 轉址；只列可證明結果，不假造登入或授權成功。',category='CAPABILITY_GAP')
add('NC-006',E,'DTO、session 與篩選 service 的示範資料鏈尚未支援',['E12'],ej+'controller/MainController.java','expenseService.save(expenseDTO)','新增可跳到清單，但 520 與 Trace expense 520 都沒回顯；整批沒有 simulationData 契約。','可證明的 scalar 傳遞可建立明示的本機示範狀態；session、關聯與計算未知值不猜測，不能以跳頁通過替代資料檢查。',category='CAPABILITY_GAP')
(H/'findings.json').write_text(json.dumps(findings,ensure_ascii=False,indent=2)+'\n')
# Raw case source ranges were handwritten; exact independent AST evidence is retained separately.
corrections=[]
for project,method,ids in [(S,'handleStudent',['S04','S07']),(S,'deleteStudent',['S06']),(S,'updateForm',['S05']),(E,'submitAdd',['E04','E12']),(E,'showUpdate',['E05']),(E,'update',['E06']),(E,'delete',['E08']),(E,'processFilter',['E09']),(E,'processRegistration',['E10'])]:
 for row in C[project]['java']:
  if row['kind']=='endpoint' and row['method']==method:corrections.append(dict(cases=ids,authoritativeSource=dict(file=row['file'],line=row['line'],method=method),note='Exact JavaParser method location; raw historical handwritten ranges are preserved'))
corrections.append(dict(cases=['E11'],authoritativeSource=source(E,ej+'controller/CustomeAuthenticationSuccessHandler.java','response.sendRedirect'),note='Source custom authentication success redirects to /list; initial source review incorrectly wrote line 44; actual statement is line 37'))
(H/'source-evidence-corrections.json').write_text(json.dumps(corrections,ensure_ascii=False,indent=2)+'\n')
print(len(findings),'OPEN findings')
