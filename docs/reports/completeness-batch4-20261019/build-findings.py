from pathlib import Path
import json
H=Path(__file__).resolve().parent;B=json.loads((H/'baseline.json').read_text());findings=[]
def add(id,p,title,cases,file,needle,observation,kind='COVERAGE_GAP',priority='P1'):
 m=B['projects'][p];root=Path(m['sourceRoot']);lines=(root/file).read_text().splitlines();line=next(i for i,s in enumerate(lines,1) if needle in s);relative=str((root/file).relative_to(Path(m['checkoutRoot'])))
 findings.append(dict(id=id,project=p,title=title,cases=cases,kind=kind,priority=priority,status='OPEN',source=dict(file=file,line=line,excerpt=lines[line-1].strip(),url=m['repository']+'/blob/'+m['commit']+'/'+relative+'#L'+str(line)),observation=observation))
L='App1Assignment5';S='demo-struts1';T='Hotel-Management-System-Spring-Boot'
add('WF-024',L,'只有 suffix 的 Java ViewResolver 未採用預設空 prefix',['L02','L04','L05','L06','L08','L09','L10'],'src/main/java/com/config/MyMvcConfig.java','resolver.setSuffix','實體 JSP 已發現，但七個回傳出現 No JSP source found；建立 AddBook、EditBook、bookListing、login 四個分離的 logical SCREEN。')
add('WF-025',L,'相對 redirect 未連到存在的 public JSP',['L01'],'src/main/java/com/controller/RegisterController.java','return "redirect:register.jsp"','redirect:login.jsp 與 redirect:register.jsp 保持未解析，註冊入口不能走到實體 register.jsp。保留未知比猜 URL 正確，但操作覆蓋仍不足。')
add('WF-026',L,'已初始化 ModelAndView 的分支 setViewName 仍缺回傳',['L03'],'src/main/java/com/controller/LoginController.java','mv.setViewName("bookListing")','兩個 return mv 都未解析；這是 WF-016 已初始化 alias 的新反例，與前輪未初始化再賦值的語法不同。')
add('WF-027',S,'條件 form action 的有限分支沒有串到既有路由',['S07','S09','H07'],'src/main/webapp/WEB-INF/view/spotifyInit.jsp','<c:set var="actionUrl"','Struts c:set 分支 create/update/delete 及旅館 th:action ternary add/update 都未形成可操作請求集合；既有路由存在。包含已知 c:set 支援邊界，不把 unresolved 當成錯誤 CONFIRMED。')
add('WF-028',T,'Thymeleaf 連結的確認與導覽分裂到不同 component ID',['H08'],'src/main/resources/templates/admin/rooms.html','onclick="return confirm','實際 Delete 沒有開確認。相同行號的第一個 component 只有 NAVIGATE，第二個才有 OPEN_DIALOG；畫面上的控制項使用第一個。',kind='CORRELATION_DEFECT')
add('WF-029',S,'DOMContentLoaded 裡的原生 classList.toggle 沒有重播',['S05'],'src/main/webapp/WEB-INF/view/common/loadScript.jsp',"document.body.classList.toggle('sb-sidenav-toggled')",'側欄按鈕可點，但 body class 前後相同；顯示無法確定目的頁。',priority='P2')
add('WF-030',L,'inline keypress 的數字過濾未還原',['L07'],'src/main/webapp/AddBook.jsp','onkeypress=','依序輸入 12a3 後實際值為 12a3，來源 return /[0-9]/i.test(event.key) 預期 123。',priority='P2')
add('WF-031',T,'入住日變更沒有更新退房日 min',['X02'],'src/main/resources/templates/visitor/booking-form.html',"setAttribute('min', d.toISOString()",'入住 2026-11-01 後退房 min 仍為 null；來源指定最早隔日 2026-11-02。不測需要當天時間的初始 today 值。')
add('WF-032',T,'存在於來源的 CSS 沒有封裝到單檔頁面',['X01'],'src/main/resources/templates/visitor/home.html','th:href="@{/css/Home.css}"','旅館 11 個 Thymeleaf CSS 引用、圖書管理 2 個相對 CSS 引用均缺失。實測 body 背景透明、font 為 Times；來源 Home.css 為 --bg #f5f7fb 與 system-ui。外部 CDN 另列。',priority='P2')
add('WF-033',T,'th:if 的初始錯誤區塊沒有依 model 狀態呈現',['H03'],'src/main/resources/templates/admin/login.html','th:if="${error}"','GET loginPage 未加 error，原型仍直接顯示 Invalid username or password；不是一次失敗登入後的回饋。')
add('NC-004',T,'跳到確認頁卻沒有帶入訂房輸入資料',['H11','X03'],'src/main/resources/templates/visitor/booking-success.html',"#temporals.format(booking.checkInDate",'H10 導覽通過；正確電話與 dd-MM-yyyy 日期補驗 X03 仍失敗，顯示模板示例電話／2024 日期。H11 的日期預期錯誤與姓名分支限制另列，不用它們證明產品缺陷。',kind='STATE_SUPPORT_GAP')
add('NC-005',T,'無法辨識示範資料列時阻斷來源已知的訂房頁路徑',['H09'],'src/main/resources/templates/visitor/home.html','th:href="@{/book/{id}','Book Now 顯示「示範資料無法確認操作的資料列或欄位」，未到 booking-form；來源 /book/{roomId} 有明確目的頁。可維持 ID 未知，但目前無法展示該流程。',kind='STATE_SUPPORT_GAP')
add('EXT-001',S,'只有外部字型圖示的控制項在離線頁面沒有點擊區域',['S03','S06','S08'],'src/main/webapp/WEB-INF/view/common/header.jsp','font-awesome','來源 Bootstrap／SB Admin／Font Awesome／DataTables 都在外部 CDN；新增、編輯及 dropdown 圖示控制項沒有可見尺寸。仍保留操作 FAIL，與 parser 路由缺陷分開。',kind='EXTERNAL_DEPENDENCY',priority='P2')
add('SRC-001',T,'Controller 回傳三個 repository 中不存在的模板',[],'src/main/java/com/hotel/management/controller/VisitorController.java','return "visitor/cancel-booking"','visitor/cancel-booking.html、visitor/cancel-success.html、visitor/my-bookings.html 在 src 模板及 tracked target 模板都不存在；單獨分類 SOURCE_MISSING_VIEW，不算工具漏掉三個實體頁。',kind='SOURCE_ISSUE',priority='P2')
(H/'findings.json').write_text(json.dumps(findings,ensure_ascii=False,indent=2)+'\n');print(len(findings),'records')
