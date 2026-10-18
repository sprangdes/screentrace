"""Explicit source-derived expectations, independent of generated graph/preview."""
from pathlib import Path
import json,hashlib,subprocess
ROOT=Path(__file__).resolve().parents[3];BASE=Path('/private/tmp/screentrace-workflows-20261018/sources');HERE=Path(__file__).parent
projects={
 'MyStrutsApp':{'repo':'ranveer5289/OLMS','root':BASE/'OLMS/MyStrutsApp','checkout':BASE/'OLMS','web':'web/'},
 'eBazaar':{'repo':'bradd-pandey/eBazaar','root':BASE/'eBazaar','checkout':BASE/'eBazaar','web':'src/main/webapp/WEB-INF/views/'},
 'Hospital-Bed-Availability-Management-System':{'repo':'RahulDahekar/Hospital-Bed-Availability-Management-System','root':BASE/'Hospital-Bed-Availability-Management-System','checkout':BASE/'Hospital-Bed-Availability-Management-System','web':'src/main/webapp/WEB-INF/views/'}
}
cases=[]
def case(id,p,view,selector,needle,dests=(),route=None,kind='navigate',sources=(),**kw):
 project=projects[p];view=project['web']+view
 lines=(project['root']/view).read_text(errors='replace').splitlines();matches=[i for i,l in enumerate(lines,1) if needle in l];assert matches,(id,needle)
 evidence=[{'file':view,'line':matches[0],'excerpt':lines[matches[0]-1].strip()}]
 for file,needle2 in sources:
  ls=(project['root']/file).read_text(errors='replace').splitlines();idx=next(i for i,l in enumerate(ls,1) if needle2 in l)
  evidence.append({'file':file,'line':idx,'excerpt':ls[idx-1].strip()})
 cases.append(dict(id=id,project=p,sourceView=view,selector=selector,triggerLine=matches[0],kind=kind,expectedViews=[project['web']+v if not v.startswith('src/') and not v.startswith('web/') else v for v in dests],expectedRoute=route,sourceEvidence=evidence,**kw))
o='MyStrutsApp';s='web/WEB-INF/struts-config.xml'
case('O01',o,'login.jsp','a:has-text("REGISTER YOURSELF")','REGISTER YOURSELF',['Registration.jsp'])
case('O02',o,'login.jsp','a:has-text("Forget Password")','ForgetPassword.jsp',['ForgetPassword.jsp'])
case('O03',o,'login.jsp','input[type="submit"][value="Login"]','<html:form',['WEB-INF/success.jsp','login.jsp'],'/login.do',sources=[(s,'path="/login"'),('src/java/com/myapp/struts/LoginAction.java','return mapping.findForward(FAILURE)'),('src/java/com/myapp/struts/LoginAction.java','return mapping.findForward(SUCCESS)')],choose='WEB-INF/success.jsp')
case('O04',o,'Registration.jsp','input[type="submit"][value="Register"]','<html:form',['Registration.jsp'],'/Registration.do',sources=[(s,'path="/Registration"')])
case('O05',o,'AddBook.jsp','input[type="submit"][value="save"]','<html:form',['AddBook.jsp'],'/AddBook.do',sources=[(s,'path="/AddBook"')])
case('O06',o,'AddBook.jsp','button[value="clear"],input[value="clear"]','value = "clear"',kind='clear',sources=[('web/clearform.js',"getElementsByName('ISBNNumber')")],fields=['ISBNNumber','title','author','publication','edition','category','price'])
case('O07',o,'login.jsp','a:has-text("Select Date")',"javascript:showCal('Calendar3')",kind='calendar',sources=[('web/cal2.js','function showCal')])
e='eBazaar';c='src/main/java/waa/project/controller/';flow='src/main/webapp/WEB-INF/flow/orderFlow.xml'
# The concrete flow filename is selected from source files, not generated output.
flow=str(next((projects[e]['root']/'src/main/webapp/WEB-INF/flow').glob('*.xml')).relative_to(projects[e]['root']))
case('E01',e,'welcome.jsp','button:has-text("Go to Products")','Go to Products',['products.jsp'],'/product',sources=[(c+'ProductController.java','setViewName("products")')])
case('E02',e,'products.jsp','button:has-text("Add Product")','Add Product',['productForm.jsp'],'/product/addProduct',sources=[(c+'ProductController.java','return "productForm"')])
case('E03',e,'products.jsp','button:has-text("Details")','<button>Details',['productDetails.jsp'],'/product/productDetail',sources=[(c+'ProductController.java','return "productDetails"')])
case('E04',e,'productForm.jsp','input[value="Add Product"]','<form:form',['productForm.jsp','products.jsp'],'/product/addProduct',sources=[(c+'ProductController.java','return "redirect:/product"')],choose='products.jsp')
case('E05',e,'productDetails.jsp','button:has-text("Show Cart")','Show Cart',['myCart.jsp'],'/order/showCart',sources=[(c+'OrderController.java','return "myCart"')])
case('E06',e,'productDetails.jsp','button:has-text("Order Now")','Order Now',kind='reveal',sources=[('src/main/webapp/resources/js/cart.js','$("#pQuantity").show()')],reveal='#pQuantity')
case('E07',e,'productDetails.jsp','button:has-text("Add to Cart")','Add to Cart',kind='api',route='/order/addToCart',sources=[('src/main/webapp/resources/js/cart.js',"url: contextRoot + '/order/addToCart'"),(c+'OrderController.java','value="/addToCart"')],prerequisite='E06',method='POST',expectedFeedback='Product successfully added to the cart!',expectedFailureFeedback='Error!')
case('E08',e,'myCart.jsp','button:has-text("Remove")','removeProduct(',kind='api',route='/order/removeFromCart',sources=[('src/main/webapp/resources/js/cart.js',"url: contextRoot + '/order/removeFromCart'"),('src/main/webapp/resources/js/cart.js','location.reload()')],method='GET',expectedFeedback='Product successfully removed from the cart!',expectedFailureFeedback='Remove operation is failed!')
case('E09',e,'myCart.jsp','button:has-text("Check out")','Check out',['src/main/webapp/WEB-INF/flow/jsp/shippingDetails.jsp'],'/orderFlow',sources=[(flow,'id="shippingDetailsView"')])
for id,view,selector,needle,to,event in [
 ('E10','shippingDetails','input[value="Continue"]','name="_eventId_shippingDetails"','paymentDetails','on="shippingDetails"'),
 ('E11','paymentDetails','button#back','name="_eventId_backToshippingDetails"','shippingDetails','on="backToshippingDetails"'),
 ('E12','paymentDetails','input[value="Continue"]','name="_eventId_paymentDetails"','orderConfirmation','on="paymentDetails"'),
 ('E13','orderConfirmation','button:has-text("Confirm")','name="_eventId_orderConfirmation"','thanks','to="thankCustomer"'),
 ('E14','shippingDetails','button#btnCancel','name="_eventId_cancel"','cancelOrder','id="cancelOrder"')]:
 case(id,e,'../flow/jsp/'+view+'.jsp',selector,needle,['src/main/webapp/WEB-INF/flow/jsp/'+to+'.jsp'],sources=[(flow,event)])
h='Hospital-Bed-Availability-Management-System';c='src/main/java/com/app/controller/'
case('H01',h,'index.jsp','a:has-text("Hospital Admin")',"value='/hospital/login'",['hospital/login.jsp'],'/hospital/login',sources=[(c+'HospitalController.java','return "/hospital/login"')])
case('H02',h,'hospital/login.jsp','a:has-text("Sign up now")','Sign up now',['hospital/register.jsp'],'/hospital/register',sources=[(c+'HospitalController.java','return "/hospital/register"')])
case('H03',h,'hospital/register.jsp','button:has-text("Proceed")','<form:form',['hospital/register.jsp','roomtype/form.jsp'],'/hospital/register',sources=[(c+'HospitalController.java','return "redirect:/roomtype/form"')],choose='roomtype/form.jsp')
case('H04',h,'roomtype/form.jsp','button:has-text("Register")','<form:form',['roomtype/form.jsp','hospital/login.jsp'],'/roomtype/form',sources=[(c+'RoomTypeController.java','return "redirect:/hospital/login"')],choose='hospital/login.jsp')
case('H05',h,'hospital/login.jsp','button:has-text("Login")','<form method="post">',['hospital/login.jsp','hospital/welcome.jsp'],'/hospital/login',sources=[(c+'HospitalController.java','return "redirect:/hospital/login"'),(c+'HospitalController.java','return "redirect:/hospital/welcome"')],choose='hospital/welcome.jsp')
case('H06',h,'hospital/welcome.jsp','a:has-text("Add a")',"value='/patient/register'",['patient/register.jsp'],'/patient/register',sources=[(c+'PatientController.java','return "/patient/register"')])
case('H07',h,'patient/register.jsp','button:has-text("Proceed to allocate room")','<form:form',['patient/register.jsp','room/allocate.jsp'],'/patient/register',sources=[(c+'PatientController.java','return "redirect:/room/allocate"')],choose='room/allocate.jsp')
case('H08',h,'room/allocate.jsp','button:has-text("Allocate")','<form:form',['room/allocate.jsp','hospital/welcome.jsp'],'/room/allocate',sources=[(c+'RoomController.java','return "redirect:/hospital/welcome"'),(c+'RoomController.java','return "redirect:/room/allocate"')],choose='hospital/welcome.jsp')
case('H09',h,'user/enduserlist.jsp','button:has-text("Search")','<form method="post">',['user/enduserlist.jsp'],'/user/enduserlist',sources=[(c+'UserController.java','return "redirect:/user/enduserlist"')])
case('H10',h,'user/enduserlist.jsp','a:has-text("Show")',"value='/user/bedlist?hid=",['user/bedlist.jsp'],'/user/bedlist',sources=[(c+'UserController.java','return "/user/bedlist"')])
case('H11',h,'bill/generatedbill.jsp','a:has-text("Print")','window.print()',kind='print')
descriptions=['登入頁→註冊', '登入頁→忘記密碼', '登入成敗候選與選擇成功頁', '註冊送出→原註冊頁', '新增書籍送出→原表單', '填入七欄後清除', '開啟日期選擇器', '首頁→產品清單', '產品清單→新增產品', '產品清單→產品詳情', '新增產品錯誤／成功兩分支', '產品詳情→購物車', 'Order Now 顯示數量欄位', 'Add to Cart AJAX 與成功提示', 'Remove AJAX／提示／重新載入', '購物車→結帳寄送', '寄送 Continue→付款', '付款 Back→寄送', '付款 Continue→訂單確認', 'Confirm→完成', 'Cancel→取消訂單', '首頁→醫院登入', '登入頁→醫院註冊', '註冊→原頁／房型設定', '房型設定→原頁／登入', '登入成敗兩分支', '工作台→新增病患', '新增病患→原頁／床位分配', '分配床位→原頁／工作台', '城市搜尋→結果頁', '醫院清單→床位清單', '帳單列印']
for row,description in zip(cases,descriptions):
 row['description']=description
 # Normalize source-relative paths, preserving exact repo provenance.
 row['sourceView']=str(Path(row['sourceView']));row['sourceView']=str((projects[row['project']]['root']/row['sourceView']).resolve().relative_to(projects[row['project']]['root']))
 for ev in row['sourceEvidence']:ev['file']=str((projects[row['project']]['root']/ev['file']).resolve().relative_to(projects[row['project']]['root']))
manifest={'projects':{},'cases':cases,'chains':[
 {'id':'C01','project':o,'steps':['O01','O04'],'description':'登入頁→註冊頁→送出註冊回原頁'},
 {'id':'C02','project':e,'steps':['E01','E03','E06','E07','E05','E08','E09','E10','E12','E13'],'description':'首頁→產品→詳情→購物車→寄送→付款→確認→完成'},
 {'id':'C03','project':h,'steps':['H01','H02','H03','H04','H05','H06','H07','H08'],'description':'首頁→醫院登入→註冊→房型→登入→新增病患→分配床位→工作台'}]}
for name,project in projects.items():
 manifest['projects'][name]={'repository':'https://github.com/'+project['repo'],'commit':subprocess.check_output(['git','-C',str(project['checkout']),'rev-parse','HEAD'],text=True).strip(),'sourceRoot':str(project['root'])}
manifest['sourceHashes']={}
for case in cases:
 for ev in case['sourceEvidence']:
  f=projects[case['project']]['root']/ev['file'];manifest['sourceHashes'][case['project']+'/'+ev['file']]=hashlib.sha256(f.read_bytes()).hexdigest()
(HERE/'baseline.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(f'{len(cases)} independent source expectations, {len(manifest["chains"])} complete journeys')
