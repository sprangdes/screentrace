import {test} from 'node:test';import assert from 'node:assert/strict';import {analyze} from '../analyzer.mjs';
const dom=[{id:'form',componentId:'form',tag:'form',attrs:{id:'form'},parent:null},{id:'save',componentId:'save',tag:'button',attrs:{id:'save'},parent:'form'},{id:'email',componentId:'email',tag:'input',attrs:{id:'email',name:'email'},parent:'form'}];
const run=(code,extra={})=>analyze({sources:[{file:'app.js',code,screenId:'screen',...extra}],dom});
test('declarations expressions and object methods trace arguments and guards',()=>{
 const a=run(`function send(url){ if(enabled){fetch(url);} } const action=function(){send('/decl');}; const obj={go(){action();}}; $('#save').on('click',function(){obj.go();});`);
 const b=a.behaviors.find(b=>b.type==='CALL_API');assert.equal(b.url,'/decl');assert.equal(b.triggerId,'save');assert.equal(b.guard,'enabled');assert.equal(b.source.file,'app.js');assert.equal(b.status,'CONFIRMED');
});
test('depth ten and configurable limit preserve unresolved call at boundary',()=>{
 const chain=Array.from({length:12},(_,i)=>`function f${i}(){${i===11?'fetch("/too-deep")':`f${i+1}();`}}`).join('');
 const a=run(chain+`$('#save').click(function(){f0();});`);assert.ok(a.diagnostics.some(d=>d.code==='JS_DEPTH_LIMIT'));assert.equal(a.behaviors.filter(b=>b.type==='CALL_API').length,0);assert.ok(a.behaviors.some(b=>b.status==='UNRESOLVED'));
 const b=analyze({sources:[{file:'app.js',screenId:'screen',code:`function a(){b();}function b(){fetch('/deep');}a();`}],dom,maxDepth:1});assert.ok(b.diagnostics.some(d=>d.code==='JS_DEPTH_LIMIT'));
});
test('recursive cycle terminates and retains unresolved evidence',()=>{
 const a=run(`function a(){b();}function b(){a();fetch('/once');}a();`);assert.ok(a.diagnostics.some(d=>d.code==='JS_CALL_CYCLE'));assert.equal(a.behaviors.filter(b=>b.type==='CALL_API').length,1);
});
test('ajax success done and then callbacks have parent behaviors',()=>{
 const a=run(`$.ajax({url:'/one',success:function(){location.href='/success';}}).done(function(){alert('done');});fetch('/two').then(function(){fetch('/child');});`);
 const children=a.behaviors.filter(b=>b.parentId);assert.equal(children.length,3);assert.ok(children.every(c=>a.behaviors.some(p=>p.id===c.parentId&&p.type==='CALL_API')));assert.deepEqual(children.map(c=>c.event),['success','done','then']);
});
test('single assignment constants objects concatenation templates and partial JSP values',()=>{
 const a=run("const base='/api';var suffix='/x';const config={url:base+suffix};fetch(config.url);fetch(`${base}/y`);fetch('/known/'+unknown);fetch('${ctx}/api/z');");
 const calls=a.behaviors.filter(b=>b.type==='CALL_API');assert.deepEqual(calls.map(b=>b.url),['/api/x','/api/y','/known/{unknown}','{ctx}/api/z']);assert.deepEqual(calls.map(b=>b.status),['CONFIRMED','CONFIRMED','INFERRED','INFERRED']);
});
test('reassignment computed property and input taint cannot resolve values',()=>{
 const a=run(`var url='/safe';url='/other';fetch(url);const cfg={url:'/safe'};fetch(cfg[key]);const input=document.querySelector('#email').value;fetch('/api/'+input);fetch('/api/'+$('#email').val());`);
 assert.equal(a.behaviors.filter(b=>b.type==='CALL_API').length,4);assert.ok(a.behaviors.filter(b=>b.type==='CALL_API').every(b=>b.status==='UNRESOLVED'&&b.url===null));
});
test('IIFE ready named handler and standalone external functions preserve load sources',()=>{
 const a=analyze({sources:[{file:'functions.js',code:`function named(){fetch('/named');}`,screenId:'screen'},{file:'form.jsp',code:`(function(){fetch('/iife');})();$(named);$('#missing').on('click',named);`,screenId:'screen'}],dom});
 const calls=a.behaviors.filter(b=>b.type==='CALL_API');assert.equal(calls.length,3);assert.ok(calls.every(b=>b.triggerId==='screen'));assert.equal(calls.at(-1).status,'UNRESOLVED');assert.equal(calls.at(-1).selector,'#missing');
});
test('custom validation preserves condition field message and CLIENT layer',()=>{
 const a=run(`function validateEmail(){if($('#email').val()===''){alert('必填');return false;}}$('#save').click(validateEmail);`);
 assert.ok(a.rules.some(r=>r.layer==='CLIENT'&&r.kind==='custom'&&r.fields.includes('email')&&r.message==='必填'));assert.ok(a.behaviors.some(b=>b.type==='VALIDATE'&&b.guard.includes("$('#email').val()")));
});
test('serialize uses static form fields and IDs survive unrelated comments',()=>{
 const code=`$('#save').click(function(){$.ajax({url:'/api',data:$('#form').serialize()});});`;
 const a=run(code),b=run('// unrelated\n'+code);assert.deepEqual(a.behaviors.filter(b=>b.type==='CALL_API')[0].dataFields,['email']);assert.deepEqual(a.behaviors.map(b=>b.id),b.behaviors.map(b=>b.id));
});
test('inline event units trace without recursively registering their own program',()=>{
 const a=analyze({sources:[{file:'app.js',code:`function send(){fetch('/sent');}`,screenId:'screen'},{file:'form.jsp',line:3,code:'send()',screenId:'screen',triggerId:'save',event:'click'}],dom});
 assert.equal(a.behaviors.filter(b=>b.type==='CALL_API').length,1);assert.equal(a.behaviors.find(b=>b.type==='CALL_API').triggerId,'save');
});
test('nested computed access is tainted even when surrounded by a literal',()=>{
 const a=run(`fetch('/api/'+obj[key].url);`);assert.equal(a.behaviors[0].status,'UNRESOLVED');assert.equal(a.behaviors[0].url,null);
});
test('relative module imports are parsed as data and imported aliases are traced',()=>{
 const a=analyze({sources:[{file:'web/app.js',module:true,code:`import {send as action} from './helper.js';action();`,screenId:'screen'}],moduleFiles:{'web/helper.js':`export function send(){fetch('/module');}`},dom});
 assert.ok(a.behaviors.some(b=>b.type==='CALL_API'&&b.url==='/module'&&b.source.file==='web/helper.js'));
});
test('known static modal selector resolves its component and lists ambiguous targets',()=>{
 const modalDom=[...dom,{id:'m1',componentId:'modal1',tag:'dialog',attrs:{id:'modal',class:'modal'}},{id:'m2',componentId:'modal2',tag:'dialog',attrs:{class:'modal'}}];
 const a=analyze({sources:[{file:'app.js',code:`$('#modal').modal('show');$('.modal').dialog('open');`,screenId:'screen'}],dom:modalDom});
 assert.equal(a.behaviors[0].targetId,'modal1');assert.equal(a.behaviors[1].status,'AMBIGUOUS');assert.deepEqual(a.behaviors[1].targetCandidates,['modal1','modal2']);
});
test('popup close commands are UI state changes and computed arguments stay unresolved',()=>{
 const a=run(`$('#email').modal('hide');$('#email').dialog('close');alert(obj[key]);$('#email').val(obj[key]);`);
 assert.equal(a.behaviors[0].type,'UI_STATE_CHANGE');assert.equal(a.behaviors[1].type,'UI_STATE_CHANGE');assert.ok(a.behaviors.slice(2).every(b=>b.status==='UNRESOLVED'));
});
test('constant selectors and bindings inside a traced initializer resolve statically',()=>{
 const a=run(`const selector='#save';function init(){ $(selector).on('click',function(){fetch('/nested-binding');}); }$(init);`);
 const call=a.behaviors.find(b=>b.type==='CALL_API');assert.equal(call?.triggerId,'save');assert.equal(call?.status,'CONFIRMED');
});
test('static request configuration objects resolve method URL callbacks and data fields',()=>{
 const a=run(`const settings={url:'/configured',method:'POST',data:{id:1},success:function(){alert('done');}};$.ajax(settings);const options={method:'PUT'};fetch('/options',options);`);
 const calls=a.behaviors.filter(b=>b.type==='CALL_API');assert.deepEqual(calls.map(b=>[b.url,b.method]),[['/configured','POST'],['/options','PUT']]);assert.deepEqual(calls[0].dataFields,['id']);assert.ok(a.behaviors.some(b=>b.parentId===calls[0].id&&b.type==='OPEN_DIALOG'));
});
test('dynamic delegated selector retains the callback API as an unresolved source',()=>{
 const a=run(`$('#form').on('click', userSelector, function(){fetch('/dynamic-delegate');});`);
 const call=a.behaviors.find(b=>b.type==='CALL_API');assert.equal(call?.url,'/dynamic-delegate');assert.equal(call?.status,'UNRESOLVED');assert.ok(call?.selector.includes('userSelector'));
});
test('event map bindings retain every handler and event',()=>{
 const a=run(`$('#save').on({click:function(){fetch('/click');},change:function(){fetch('/change');}});`);
 const calls=a.behaviors.filter(b=>b.type==='CALL_API');assert.deepEqual(calls.map(b=>b.event),['click','change']);assert.ok(calls.every(b=>b.triggerId==='save'));
});
test('module-private bindings cannot leak into a classic script scope',()=>{
 const a=analyze({sources:[{file:'private.js',module:true,screenId:'screen',code:`function privateSend(){fetch('/private');}const privateUrl='/private';`},{file:'classic.js',screenId:'screen',code:`privateSend();fetch(privateUrl);`}],dom});
 assert.equal(a.behaviors.filter(b=>b.type==='CALL_API'&&b.url==='/private').length,0);assert.ok(a.behaviors.some(b=>b.status==='UNRESOLVED'));
});
test('reassigned functions do not resolve to their original implementation',()=>{
 const a=run(`var send=function(){fetch('/old');};send=userInput;send();`);assert.equal(a.behaviors.filter(b=>b.type==='CALL_API').length,0);assert.ok(a.behaviors.some(b=>b.type==='UNKNOWN'));
});
test('single initialization assignment and object argument properties resolve',()=>{
 const a=run(`var url;url='/once';fetch(url);function send(config){fetch(config.url);}const config={url:'/object'};send(config);`);assert.deepEqual(a.behaviors.filter(b=>b.type==='CALL_API').map(b=>b.url),['/once','/object']);
});
test('local functions shadow native API names instead of becoming guessed API calls',()=>{
 const a=run(`function fetch(url){alert(url);}fetch('/not-native');`);assert.equal(a.behaviors.filter(b=>b.type==='CALL_API').length,0);assert.equal(a.behaviors.filter(b=>b.type==='OPEN_DIALOG').length,1);
});
test('scriptlet URL values are unresolved and never evaluated',()=>{
 const a=analyze({sources:[{file:'form.jsp',screenId:'screen',code:`fetch('<%= route %>');`}],dom});assert.equal(a.behaviors[0].url,null);assert.equal(a.behaviors[0].status,'UNRESOLVED');
});
test('XHR branch alternatives are not silently reduced to the last open call',()=>{
 const a=run(`var xhr=new XMLHttpRequest();if(mode){xhr.open('GET','/one');}else{xhr.open('GET','/two');}xhr.send();`);const b=a.behaviors.find(b=>b.type==='CALL_API');assert.equal(b.status,'AMBIGUOUS');assert.equal(b.url,null);assert.deepEqual(b.urlCandidates,['/one','/two']);
});
