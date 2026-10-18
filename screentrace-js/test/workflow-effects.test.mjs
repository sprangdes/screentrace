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
