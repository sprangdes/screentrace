import test from 'node:test';import assert from 'node:assert/strict';import {analyze} from '../analyzer.mjs';
const dom=[{id:'go',componentId:'go',tag:'button',attrs:{id:'go'},parent:null},{id:'field',componentId:'field',tag:'input',attrs:{name:'code'},parent:null},{id:'panel',componentId:'panel',tag:'div',attrs:{id:'panel'},parent:null}];
test('unknown JSP argument does not prevent proving a constant DOM effect',()=>{
 const r=analyze({sources:[{file:'functions.js',screenId:'s',code:'function reveal(id){$("#panel").show();}'},{file:'a.jsp',screenId:'s',triggerId:'go',event:'click',code:'reveal(${item.id}); return false;'}],dom});
 assert.ok(r.behaviors.some(b=>b.operation==='show'&&b.selector==='#panel'&&b.status==='CONFIRMED'));
});
test('literal DOM value assignments keep field/index/value without evaluating scripts',()=>{
 const r=analyze({sources:[{file:'a.js',screenId:'s',code:`document.getElementsByName('code')[0].value='';`}],dom});
 assert.ok(r.behaviors.some(b=>b.operation==='setValue'&&b.value===''&&b.status==='CONFIRMED'));
});
test('context pathname prefix remains symbolic while API suffix and callbacks survive',()=>{
 const r=analyze({sources:[{file:'a.js',screenId:'s',code:`var ctx='/' + window.location.pathname.split('/')[1]; $.ajax({url:ctx+'/cart',type:'POST',success:function(){alert('saved');},error:function(){alert('failed');}});`}],dom});
 assert.equal(r.behaviors.find(b=>b.type==='CALL_API').url,'{pathname.segment1}/cart');
 assert.ok(r.behaviors.some(b=>b.event==='error'&&b.message==='failed'));
});

test('recognized legacy calendar declarations become inert date selection metadata',()=>{
 const r=analyze({sources:[{file:'widget.js',screenId:'s',code:'// Popup Calendar(Window) yxscripts.com\nvar calFormat="yyyy/mm/dd";'}, {file:'config.js',screenId:'s',code:'addCalendar("invoice", "Choose", "code", "form");'}, {file:'a.jsp',screenId:'s',triggerId:'go',event:'click',code:'showCal("invoice");'}],dom});
 assert.ok(r.behaviors.some(b=>b.operation==='datePicker'&&b.selector==='[name="code"]'&&b.status==='CONFIRMED'));
});

test('JSP unknown arguments cannot capture a user-defined placeholder variable',()=>{
 const r=analyze({sources:[{file:'a.jsp',screenId:'s',triggerId:'go',event:'click',code:'const _$="/wrong";fetch(${request.url});'}],dom});
 assert.equal(r.behaviors.find(b=>b.type==='CALL_API').url,null);
});
test('a shadowed location object cannot supply an inferred runtime URL prefix',()=>{
 const r=analyze({sources:[{file:'a.js',screenId:'s',code:"const window={location:{pathname:'/other'}};const x='/' + window.location.pathname.split('/')[1];fetch(x+'/cart');"}],dom});
 assert.equal(r.behaviors.find(b=>b.type==='CALL_API').url,null);
});
test('fail chain retains request and guarded text feedback through immutable jQuery alias',()=>{
 const r=analyze({sources:[{file:'a.js',screenId:'s',triggerId:'go',event:'click',code:`const msg=$('#panel'); $.ajax({url:'/check'}).done(function(result){if(result==='NG')msg.text('duplicate');else msg.text('available');}).fail(function(){msg.text('failed');});`}],dom});
 assert.ok(r.behaviors.some(b=>b.type==='CALL_API'&&b.url==='/check'));
 for(const value of ['duplicate','available','failed'])assert.ok(r.behaviors.some(b=>b.operation==='setText'&&b.value===value&&b.selector==='#panel'),value);
});
test('binding trace stores the callee and source position without duplicating the handler body',()=>{
 const code=`$('#go').on('click',function(){/*${'source comment '.repeat(5000)}*/fetch('/api');});`;
 const r=analyze({sources:[{file:'a.js',screenId:'s',code}],dom});
 const b=r.behaviors.find(b=>b.type==='CALL_API');assert.equal(b.trace[0].callee,"$('#go').on");assert.equal(b.trace[0].source.file,'a.js');assert.ok(JSON.stringify(r).length<4000);
});
test('switch on an immutable DOM alias emits conditional style metadata',()=>{
 const r=analyze({sources:[{file:'a.js',screenId:'s',code:`const choice=document.querySelector('#go');const panel=document.querySelector('#panel');choice.addEventListener('change',()=>{switch(choice.value){case 'deposit':panel.style.display='block';break;case 'other':panel.style.display='none';break;}});`}],dom});
 assert.ok(r.behaviors.some(b=>b.operation==='setStyle'&&b.selector==='#panel'&&b.when?.value==='deposit'&&b.when.selector==='#go'&&b.triggerId==='go'));
});
test('shadowed DOM and jQuery factories do not authorize native alias effects',()=>{
 for(const code of [`function $(){return custom;}const message=$('#panel');message.text('unsafe');`,`const document=custom;const panel=document.querySelector('#panel');panel.style.display='block';`]){
  const r=analyze({sources:[{file:'a.js',screenId:'s',code}],dom});assert.ok(!r.behaviors.some(b=>['setText','setStyle'].includes(b.operation)));
 }
});
test('adjacent request object redeclarations keep each call URL and method without scalar reassignment guessing',()=>{
 const r=analyze({sources:[{file:'a.js',screenId:'s',code:`var request={url:'/one',type:'POST'};$.ajax(request);var request={url:'/two',type:'GET'};$.ajax(request);`}],dom});
 assert.deepEqual(r.behaviors.filter(b=>b.type==='CALL_API').map(b=>[b.url,b.method]),[['/one','POST'],['/two','GET']]);assert.ok(r.behaviors.filter(b=>b.type==='CALL_API').every(b=>b.status==='INFERRED'));
 for(const code of [`var request={url:'/one'};mutate(request);$.ajax(request);request={url:'/later'};`,`var request={url:'/one'};if(flag)request={url:'/other'};$.ajax(request);`]){const x=analyze({sources:[{file:'a.js',screenId:'s',code}],dom});assert.ok(x.behaviors.filter(b=>b.type==='CALL_API').every(b=>b.status==='UNRESOLVED'&&b.url===null));}
});
