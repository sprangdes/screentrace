"""Source-reviewed expectations; runtime results never define expected outcomes."""
import json
from pathlib import Path
H=Path(__file__).resolve().parent;cases=[];chains=[]
def case(id,p,v,selector,kind='navigate',targets=None,**kw):
 cases.append(dict(id=id,project=p,sourceView=v,selector=selector,kind=kind,expectedViews=targets or [],**kw));return id
p='contract-management-system';pre='src/main/webapp/'
case('C01',p,pre+'input.jsp','a[href="contractList.do"]',targets=[pre+'list.jsp'],sourceLine=190)
case('C02',p,pre+'list.jsp','a[href="input.jsp"]',targets=[pre+'input.jsp'],sourceLine=86)
case('C03',p,pre+'input.jsp','input[type=submit],button[type=submit]','navigate',[pre+'result.jsp',pre+'input.jsp'],inputs={'[name=contractorName]':'ScreenTrace Test','[name=age]':'33'},choose=pre+'result.jsp',sourceLine=227)
case('C04',p,pre+'result.jsp','a[href="input.jsp"]',targets=[pre+'input.jsp'],sourceLine=122)
case('C05',p,pre+'input.jsp','button[onclick]','feedback',inputs={'[name=contractorName]':'ScreenTrace Test'},expectedText=['登録されています','登録可能','通信エラー'],sourceLine=207)
case('C06',p,pre+'input.jsp','[name=contractorName]','attribute',attribute='id',value='contractorNameField',sourceLine=204)
case('C07',p,pre+'list.jsp','a[href*="contractDelete"]','confirmation',sourceLine=103)
chains.append(dict(id='CJ1',project=p,steps=['C01','C02','C03','C04']))
p='Fintech-Finance-Banking-Application';pre='src/main/webapp/WEB-INF/jsp/'
case('B01',p,pre+'index.jsp','a[href="/register"]',targets=[pre+'register.jsp'],sourceLine=41)
case('B02',p,pre+'register.jsp','a[href="/login"]',targets=[pre+'login.jsp'],sourceLine=107)
case('B03',p,pre+'login.jsp','a[href="/"]',targets=[pre+'index.jsp'],sourceLine=120)
case('B04',p,pre+'login.jsp','button','navigate',[pre+'login.jsp',pre+'error.jsp',pre+'dashboard.jsp'],inputs={'[name=email]':'test@example.invalid','[name=password]':'ScreenTrace123!'},sourceLine=105)
case('B05',p,pre+'dashboard.jsp','a[href="/app/payment_history"]',targets=[pre+'paymentHistory.jsp'],sourceFile=pre+'components/incl/header.jsp',sourceLine=19)
case('B06',p,pre+'dashboard.jsp','button#add-account-btn','reveal',reveal='#offcanvasRight',sourceFile=pre+'components/accounts_display.jsp',sourceLine=8)
case('B07',p,pre+'dashboard.jsp','button#transact-btn','reveal',reveal='#offcanvasExample',sourceFile=pre+'components/accounts_display.jsp',sourceLine=13)
case('B08',p,pre+'dashboard.jsp','#transact-type','selectReveal',value='deposit',reveal='#deposit-card',sourceFile=pre+'components/transact_offcanvas.jsp',sourceLine=18)
case('B09',p,pre+'register.jsp','button','feedback',inputs={'[name=first_name]':'Test','[name=last_name]':'User','[name=email]':'test@example.invalid','[name=password]':'abc123','[name=confirm_password]':'different'},expectedText=['passwords do not match'],sourceLine=98)
chains.append(dict(id='BJ1',project=p,steps=['B01','B02','B03']))
p='SpringMVC-IMS';pre='web/WEB-INF/jsp/'
case('I01',p,pre+'index.jsp','a[href="loginform"]',targets=[pre+'loginform.jsp'],sourceLine=36)
case('I02',p,pre+'loginform.jsp','#loginBtn',targets=[pre+'dashboard.jsp',pre+'loginform.jsp'],inputs={'#userid':'test','#password':'test'},selects={'#usertype':'1'},choose=pre+'dashboard.jsp',sourceLine=88)
for id,route,line in [('I03','dashboard',25),('I04','customers',32),('I05','suppliers',38),('I06','brand',44),('I07','category',50),('I08','model',56),('I09','product',62)]:
 case(id,p,pre+'dashboard.jsp',f'a[href="{route}"]',targets=[pre+route+'.jsp',pre+'loginform.jsp'],sourceFile=pre+'menu.jsp',sourceLine=line)
case('I10',p,pre+'category.jsp','button[title="Insert New Category"]','reveal',reveal='#insertCategoryModal',sourceLine=23)
case('I11',p,pre+'category.jsp','#searchCategory','request',inputs={'#searchCategory':'test'},event='keyup',expectedRoute='searchCategory',sourceFile='web/resources/JS/categoryHandaler.js',sourceLine=63)
case('I12',p,pre+'category.jsp','a[title="Edit"]','reveal',reveal='#editCategoryPopUp',sourceLine=94)
case('I13',p,pre+'category.jsp','a[title="Delete"]','reveal',reveal='#deleteCategoryPopUp',sourceLine=95)
chains.append(dict(id='IJ1',project=p,steps=['I01','I02','I07']))
p='airline_system';pre='src/main/resources/templates/'
for id,view,route,target in [('A01','index','/flights','flights'),('A02','flights','/passengers','passengers'),('A03','passengers','/reservations','reservations'),('A04','reservations','/','index')]:case(id,p,pre+view+'.html',f'a[href="{route}"]',targets=[pre+target+'.html'])
for id,view,field in [('A05','passengers','passengerId'),('A06','passengers','firstName'),('A07','passengers','lastName'),('A08','flights','flightNumber'),('A09','flights','seatCapacity')]:case(id,p,pre+view+'.html','#'+field,'attribute',attribute='name',value=field)
case('A10',p,pre+'passengers.html','button[type=submit]','record',[pre+'passengers.html'],inputs={'#passengerId':'ST-BATCH3','#firstName':'ScreenTrace','#lastName':'Completeness'},expectedText=['ST-BATCH3','ScreenTrace','Completeness'],sourceLine=65)
case('A11',p,pre+'flights.html','button[type=submit]','record',[pre+'flights.html'],inputs={'#flightNumber':'ST-318','#departure':'Taipei','#destination':'Tokyo','#departureTime':'2026-11-01T10:00','#seatCapacity':'180'},expectedText=['ST-318','Taipei','Tokyo'],sourceLine=73)
case('A12',p,pre+'reservations.html','select[name=flightNumber]','options',minimum=1,sourceLine=55)
chains.append(dict(id='AJ1',project=p,steps=['A01','A02','A03','A04']))
chains.append(dict(id='AJ2',project=p,steps=['A02','A10','A03','A12']))
(H/'workflow-baseline.json').write_text(json.dumps(dict(cases=cases,chains=chains),indent=2,ensure_ascii=False)+'\n');print(len(cases),'cases',len(chains),'journeys')
