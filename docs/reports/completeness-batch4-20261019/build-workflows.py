"""Source-reviewed expectations, frozen before analysis. No generated output is read."""
from pathlib import Path
import json
H=Path(__file__).resolve().parent;cases=[]
def c(id,p,view,selector,kind='navigate',targets=(),**rest):cases.append(dict(id=id,project=p,sourceView=view,selector=selector,kind=kind,expectedTargets=list(targets),**rest))
S='demo-struts1';sp='src/main/webapp/WEB-INF/view/';tile=lambda x:'tile:tiles.'+x;f=lambda x:'file:'+sp+x+'.jsp'
c('S01',S,tile('logon'),'form button[type=submit]',targets=[tile('dashboard'),tile('logon'),f('login')],inputs={'#inputUsername':'trace_user','#inputPassword':'trace_test'},choose=tile('dashboard'),sourceFile=sp+'login.jsp',sourceLine=11)
c('S02',S,tile('dashboard'),'a[href="/spotify-pagination.do"]',targets=[tile('spotify.list.pagination'),tile('logon')],choose=tile('spotify.list.pagination'),sourceFile=sp+'common/sideNav.jsp',sourceLine=24)
c('S03',S,tile('spotify.list.pagination'),'a[href="/spotify-init.do?action=create"]',targets=[tile('spotify.init'),tile('logon')],choose=tile('spotify.init'),sourceFile=sp+'spotifyListPagination.jsp',sourceLine=17)
c('S04',S,tile('spotify.init'),'a[href="/spotify-pagination.do"]',targets=[tile('spotify.list.pagination'),tile('logon')],choose=tile('spotify.list.pagination'),sourceFile=sp+'spotifyInit.jsp',sourceLine=92)
c('S05',S,tile('dashboard'),'#sidebarToggle','toggleClass',className='sb-sidenav-toggled',target='body',sourceFile=sp+'common/loadScript.jsp',sourceLine=16)
c('S06',S,tile('dashboard'),'#navbarDropdown','dropdown',target='.dropdown-menu',sourceFile=sp+'common/loadScript.jsp',sourceLine=70)
c('S07',S,tile('spotify.init'),'form','requests',expectedRequests=['/spotify-create.do','/spotify-update.do','/spotify-delete.do'],sourceFile=sp+'spotifyInit.jsp',sourceLine=22)
c('S08',S,tile('spotify.list.pagination'),'a[href*="action=edit"]',targets=[tile('spotify.init'),tile('logon')],choose=tile('spotify.init'),sourceFile=sp+'spotifyListPagination.jsp',sourceLine=47)
c('S09',S,tile('spotify.init'),'form button[type=submit]','record',[tile('spotify.list.pagination'),tile('spotify.init'),tile('logon')],inputs={'#inputArtistName':'ST Artist 419','#inputTrackName':'ST Track 419','#inputGenre':'Test','#inputPopularity':'42'},choose=tile('spotify.list.pagination'),expectedText=['ST Artist 419','ST Track 419'],sourceFile=sp+'spotifyInit.jsp',sourceLine=36)
L='App1Assignment5';lp='src/main/webapp/';lf=lambda x:'file:'+lp+x+'.jsp'
c('L01',L,lf('login'),'a[href="Register"]',targets=[lf('register')],sourceFile=lp+'login.jsp',sourceLine=58)
c('L02',L,lf('register'),'input[type=submit]',targets=[lf('login')],inputs={'#uname':'trace_user','#pass':'trace_test'},sourceFile=lp+'register.jsp',sourceLine=39)
c('L03',L,lf('login'),'input[type=submit]',targets=[lf('login'),lf('bookListing')],inputs={'#uname':'trace_user','#pass':'trace_test'},choose=lf('bookListing'),sourceFile=lp+'login.jsp',sourceLine=39)
c('L04',L,lf('bookListing'),'form[action=Add] button',targets=[lf('AddBook')],sourceFile=lp+'bookListing.jsp',sourceLine=43)
c('L05',L,lf('bookListing'),'form[action=Edit] button',targets=[lf('EditBook')],sourceFile=lp+'bookListing.jsp',sourceLine=72)
c('L06',L,lf('AddBook'),'form[action=Addbook] button',targets=[lf('bookListing')],inputs={'#bookCode':'419','#bookName':'ScreenTrace 419'},sourceFile=lp+'AddBook.jsp',sourceLine=42)
c('L07',L,lf('AddBook'),'#bookCode','keypress',typed='12a3',expectedValue='123',sourceFile=lp+'AddBook.jsp',sourceLine=46)
c('L08',L,lf('AddBook'),'form[action=Addbook] button','record',[lf('bookListing')],inputs={'#bookCode':'419','#bookName':'ScreenTrace 419'},expectedText=['419','ScreenTrace 419'],sourceFile='src/main/java/com/controller/AddController.java',sourceLine=60)
c('L09',L,lf('bookListing'),'form[action=Delete] button',targets=[lf('bookListing')],sourceFile='src/main/java/com/controller/DeleteController.java',sourceLine=26)
c('L10',L,lf('bookListing'),'form[action=Logout] input',targets=[lf('login')],sourceFile='src/main/java/com/controller/Logout.java',sourceLine=14)
T='Hotel-Management-System-Spring-Boot';tp='src/main/resources/templates/';tf=lambda x:'file:'+tp+x+'.html'
c('H01',T,tf('visitor/home'),'a[href="/admin/login"]',targets=[tf('admin/login')],sourceFile=tp+'visitor/home.html',sourceLine=16)
c('H02',T,tf('admin/login'),'button[type=submit]',targets=[tf('admin/login'),tf('admin/dashboard')],inputs={'#username':'trace_user','#password':'trace_test'},choose=tf('admin/dashboard'),sourceFile='src/main/java/com/hotel/management/controller/AdminController.java',sourceLine=20)
c('H03',T,tf('admin/login'),'.alert-error','initialHidden',sourceFile=tp+'admin/login.html',sourceLine=17)
c('H04',T,tf('admin/dashboard'),'a[href="/admin/rooms"]',targets=[tf('admin/rooms'),tf('admin/login')],choose=tf('admin/rooms'),sourceFile='src/main/java/com/hotel/management/controller/RoomController.java',sourceLine=26)
c('H05',T,tf('admin/rooms'),'a[href="/admin/rooms/add"]',targets=[tf('admin/room-form'),tf('admin/login')],choose=tf('admin/room-form'),sourceFile='src/main/java/com/hotel/management/controller/RoomController.java',sourceLine=37)
c('H06',T,tf('admin/room-form'),'#roomNumber','attribute',attribute='name',expectedValue='roomNumber',sourceFile=tp+'admin/room-form.html',sourceLine=46)
c('H07',T,tf('admin/room-form'),'form','requests',expectedRequests=['/admin/rooms/add','/admin/rooms/update/{id}'],sourceFile=tp+'admin/room-form.html',sourceLine=35)
c('H08',T,tf('admin/rooms'),'a[onclick]','cancelConfirm',sourceFile=tp+'admin/rooms.html',sourceLine=77)
c('H09',T,tf('visitor/home'),'a.book-btn',targets=[tf('visitor/booking-form')],sourceFile=tp+'visitor/home.html',sourceLine=62)
c('H10',T,tf('visitor/booking-form'),'button[type=submit]',targets=[tf('visitor/booking-success')],inputs={'[name=guestName]':'Trace Guest 419','[name=guestPhone]':'0700419419','[name=guestEmail]':'trace@example.invalid','#checkInDate':'2026-11-01','#checkOutDate':'2026-11-03','[name=numberOfGuests]':'2'},sourceFile='src/main/java/com/hotel/management/controller/VisitorController.java',sourceLine=47)
c('H11',T,tf('visitor/booking-form'),'button[type=submit]','record',[tf('visitor/booking-success')],inputs={'[name=guestName]':'Trace Guest 419','[name=guestPhone]':'0700419419','[name=guestEmail]':'trace@example.invalid','#checkInDate':'2026-11-01','#checkOutDate':'2026-11-03','[name=numberOfGuests]':'2'},expectedText=['Trace Guest 419','0700419419','2026-11-01','2026-11-03'],sourceFile='src/main/java/com/hotel/management/controller/VisitorController.java',sourceLine=58)
c('H12',T,tf('admin/dashboard'),'a[href="/admin/logout"]',targets=[tf('admin/login')],sourceFile='src/main/java/com/hotel/management/controller/AdminController.java',sourceLine=43)
journeys=[dict(id='SJ1',project=S,steps=['S01','S02','S03','S04']),dict(id='LJ1',project=L,steps=['L01','L02','L03','L04']),dict(id='LJ2',project=L,steps=['L04','L08']),dict(id='HJ1',project=T,steps=['H01','H02','H04','H05']),dict(id='HJ2',project=T,steps=['H09','H11'])]
sources=json.loads((H/'baseline.json').read_text())['projects']
anchors={'S01':"value='/postLogin.do'",'S02':"value='/spotify-pagination.do'",'S03':"value='/spotify-init.do?action=create'",'S04':'Cancel</a>','S05':"document.body.classList.toggle",'S06':"dropdownToggle.addEventListener",'S07':'<c:set var="actionUrl"','S08':"value='/spotify-init.do?action=edit",'S09':'<form action=',
'L01':'href="Register"','L02':'<form action="Register"','L03':'<form action="Login"','L04':'<form action="Add"','L05':'<form action="Edit"','L06':'<form action="Addbook"','L07':'onkeypress=', 'L08':'@PostMapping("/Addbook")','L09':'@PostMapping("/Delete")','L10':'@PostMapping("/Logout")',
'H01':'href="/admin/login"','H02':'public String login(','H03':'th:if="${error}"','H04':'public String getAllRooms(','H05':'public String addRoomForm(','H06':'th:field="*{roomNumber}"','H07':'th:action=', 'H08':"onclick=",'H09':'class="book-btn"','H10':'public String createBooking(','H11':'public String createBooking(','H12':'public String logout('}
for case in cases:
 lines=(Path(sources[case['project']]['sourceRoot'])/case['sourceFile']).read_text().splitlines();matches=[i for i,line in enumerate(lines,1) if anchors[case['id']] in line];assert matches,(case['id'],anchors[case['id']]);case['sourceLine']=matches[0];case['sourceExcerpt']=lines[matches[0]-1].strip();case['sourceAnchor']=anchors[case['id']]
(H/'workflow-baseline.json').write_text(json.dumps(dict(cases=cases,journeys=journeys),ensure_ascii=False,indent=2)+'\n');print(len(cases),'cases',len(journeys),'journeys')
