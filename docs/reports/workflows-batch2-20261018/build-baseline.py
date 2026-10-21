"""Source-reviewed expectations, fixed before running ScreenTrace."""
from pathlib import Path
import json,subprocess,hashlib
HERE=Path(__file__).parent;BASE=Path('/private/tmp/screentrace-batch2-20261018/sources')
repos={'struts1_CRUD_ProductManagement':'NguyenHuyHoangCodeGym-C0718L01/struts1_CRUD_ProductManagement','ShoppingCart':'mbitiutskyi/ShoppingCart','Employee-Management-System':'murthyns18/Employee-Management-System','hotel-reservation-springmvc':'mjstewart/hotel-reservation-springmvc'}
projects={p:{'repository':'https://github.com/'+r,'commit':subprocess.check_output(['git','-C',str(BASE/p),'rev-parse','HEAD'],text=True).strip(),'sourceRoot':str(BASE/p),'scope':'unsupported Thymeleaf negative control' if p.startswith('hotel') else 'supported JSP workflow'} for p,r in repos.items()}
cases=[]
def add(id,p,v,selector,line,targets,desc,evidence,**kw):
 c=dict(id=id,project=p,sourceView=v,selector=selector,triggerLine=line,kind='navigate',expectedViews=targets,expectedRoute=None,description=desc,sourceEvidence=[])
 for f,n in [(kw.get('sourceComponentFile',v),line)]+evidence:
  c['sourceEvidence'].append(dict(file=f,line=n,excerpt=(BASE/p/f).read_text().splitlines()[n-1]))
 c.update(kw);cases.append(c)
p='struts1_CRUD_ProductManagement';w='src/main/webapp/';x=w+'WEB-INF/struts-config.xml';j='src/controller/ProductAction.java'
for id,v,sel,line,t,desc,ev in [
 ('P01','home.jsp','a:has-text("Create new Product")',13,'addProduct.jsp','商品列表→新增',[(x,15),(x,17),(j,22)]),
 ('P02','home.jsp','a:has-text("Edit")',32,'editProduct.jsp','商品列表→編輯',[(x,27),(x,29),(j,33)]),
 ('P03','home.jsp','a:has-text("Delete")',32,'home.jsp','確認刪除→列表',[(x,23),(x,25),(j,91)]),
 ('P04','addProduct.jsp','a:has-text("Return home page")',13,'home.jsp','新增頁→列表',[(x,11),(x,13)]),
 ('P05','editProduct.jsp','button:has-text("Edit Product"),input[type="submit"]',19,'home.jsp','儲存編輯→列表',[(x,31),(x,33),(j,75)]),
 ('P06','editProduct.jsp','a:has-text("Return home page")',16,'home.jsp','編輯頁→列表',[(x,11),(x,13)])]:add(id,p,w+v,sel,line,[w+t],desc,ev)
add('P07',p,w+'addProduct.jsp','button:has-text("Add new Product"),input[type="submit"]',19,[],'原專案錯誤：.do 不符合 *.html 映射',[(w+'WEB-INF/web.xml',20)],kind='unresolved',sourceDefect=True)
add('P08',p,w+'home.jsp','a:has-text("Delete")',32,[w+'home.jsp'],'功能檢查：刪除前出現確認與取消',[(j,78)],kind='confirmation')
p='ShoppingCart';w='src/main/webapp/WEB-INF/pages/';h=w+'template/header.jsp';j='src/main/java/com/mbit/mediashop/controller/'
add('S01',p,w+'home.jsp','a:has-text("Catalog")',42,[w+'catalog.jsp'],'首頁→商品目錄',[(j+'CatalogController.java',27),(j+'CatalogController.java',33)],sourceComponentFile=h)
add('S02',p,w+'catalog.jsp','td a',29,[w+'catalog.jsp'],'加入購物車→目錄',[(j+'CartController.java',29),(j+'CartController.java',32)])
add('S03',p,w+'catalog.jsp','a:has-text("Cart:")',46,[w+'cart.jsp'],'目錄→購物車',[(j+'CartController.java',22),(j+'CartController.java',26)],sourceComponentFile=h)
add('S04',p,w+'cart.jsp','td a',29,[w+'cart.jsp'],'移除商品→購物車',[(j+'CartController.java',36),(j+'CartController.java',39)])
add('S05',p,w+'cart.jsp','a:has-text("Clear Cart")',48,[w+'cart.jsp'],'清空購物車→購物車',[(j+'CartController.java',42),(j+'CartController.java',45)])
add('S06',p,w+'cart.jsp','a:has-text("Continue shopping")',47,[w+'catalog.jsp'],'繼續購物→目錄',[(j+'CatalogController.java',27),(j+'CatalogController.java',33)])
add('S07',p,w+'cart.jsp','a:text-is("Home")',41,[w+'home.jsp'],'購物車→首頁',[(j+'HomeController.java',21),(j+'HomeController.java',25)],sourceComponentFile=h)
p='Employee-Management-System';w='src/main/webapp/WEB-INF/views/';j='src/main/java/com/main/controller/EmployeeController.java'
for id,v,sel,line,t,desc,ev in [
 ('M01','employee-list.jsp','a:has-text("Add Employee")',14,'add-employee.jsp','員工列表→新增',[(j,25),(j,29)]),
 ('M02','add-employee.jsp','button:has-text("Save Employee")',14,'employee-list.jsp','填表儲存→列表',[(j,32),(j,35)]),
 ('M03','employee-list.jsp','a:has-text("Update")',42,'edit-employee.jsp','員工列表→編輯',[(j,38),(j,42)]),
 ('M04','edit-employee.jsp','button:has-text("Update Employee")',14,'employee-list.jsp','填表更新→列表',[(j,32),(j,35)]),
 ('M05','employee-list.jsp','a:has-text("Delete")',43,'employee-list.jsp','刪除員工→列表',[(j,45),(j,48)]),
 ('M06','add-employee.jsp','a:has-text("Back to Employee List")',29,'employee-list.jsp','新增頁取消返回',[(j,19),(j,22)]),
 ('M07','edit-employee.jsp','a:has-text("Back to Employee List")',60,'employee-list.jsp','編輯頁取消返回',[(j,19),(j,22)])]:
  kw={'inputs':{'name':'ScreenTrace Batch2 Employee','email':'batch2@example.test','department':'Quality'}} if id in ['M02','M04'] else {}
  add(id,p,w+v,sel,line,[w+t],desc,ev,**kw)
add('M08',p,w+'add-employee.jsp','button:has-text("Save Employee")',14,[w+'employee-list.jsp'],'功能檢查：新增員工後列表出現填入值',[(j,34),(j,21)],kind='createRecord',inputs={'name':'ScreenTrace Batch2 Employee','email':'batch2@example.test','department':'Quality'},expectedText='ScreenTrace Batch2 Employee')
p='hotel-reservation-springmvc';w='src/main/resources/templates/';j='src/main/java/com/demo/hotel/'
add('T01',p,w+'hotel/search.html','#searchGoButton',21,[w+'hotel/hotels.html'],'不支援技術負對照：搜尋旅館',[(w+'hotel/search.html',28),(j+'HotelSearchController.java',32),(j+'HotelSearchController.java',39)])
add('T02',p,w+'hotel/hotels.html','a:has-text("Rooms")',97,[w+'hotel/rooms.html'],'不支援技術負對照：查看房間',[(j+'HotelSearchController.java',42),(j+'HotelSearchController.java',48)])
chains=[dict(id='PRODUCT-EDIT',project='struts1_CRUD_ProductManagement',steps=['P02','P05','P01','P04']),dict(id='SHOPPING',project='ShoppingCart',steps=['S01','S02','S03','S04','S05','S06']),dict(id='EMPLOYEE',project='Employee-Management-System',steps=['M01','M02','M03','M04','M05']),dict(id='EMPLOYEE-DATA',project='Employee-Management-System',steps=['M01','M08']),dict(id='HOTEL-NEGATIVE',project='hotel-reservation-springmvc',steps=['T01','T02'])]
hashes={p:{str(f.relative_to(BASE/p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in (BASE/p).rglob('*') if f.is_file() and '.git' not in f.relative_to(BASE/p).parts} for p in projects}
(HERE/'baseline.json').write_text(json.dumps(dict(projects=projects,cases=cases,chains=chains,sourceHashes=hashes),ensure_ascii=False,indent=2))
print('source-reviewed cases',len(cases))
