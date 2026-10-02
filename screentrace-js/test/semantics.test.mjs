import {test} from 'node:test';import assert from 'node:assert/strict';import {analyze,identifyLibrary} from '../analyzer.mjs';
const dom=[{id:'form',componentId:'form',tag:'form',attrs:{id:'form'},parent:null},{id:'save',componentId:'save',tag:'button',attrs:{id:'save'},parent:'form'},{id:'email',componentId:'email',tag:'input',attrs:{name:'email',id:'email'},parent:'form'},{id:'modal',componentId:'modal',tag:'dialog',attrs:{id:'modal'},parent:null}];
const run=code=>analyze({sources:[{file:'app.js',code,screenId:'screen'}],dom});
test('all navigation and form submission APIs',()=>{
 const a=run(`location.href='/a';location.assign('/b');location.replace('/c');window.location='/d';history.pushState({}, '', '/e');window.open('/f');document.querySelector('#form').submit();`);
 assert.equal(a.behaviors.filter(b=>b.type==='NAVIGATE').length,5);assert.equal(a.behaviors.filter(b=>b.type==='OPEN_DIALOG').length,1);assert.equal(a.behaviors.filter(b=>b.type==='SUBMIT_FORM').length,1);
 assert.ok(a.behaviors.every(b=>b.source.line===1&&b.triggerId==='screen'));
});
test('all API syntaxes capture method URL and data field names',()=>{
 const a=run(`$.ajax({url:'/a',type:'POST',data:{id:1,email:x}});$.get('/b');$.post('/c');$.getJSON('/d');$('#form').load('/e');fetch('/f',{method:'PUT',body:JSON.stringify({name:x})});var xhr=new XMLHttpRequest();xhr.open('PATCH','/g');xhr.send();axios.get('/h');axios.post('/i',{amount:x});axios({url:'/j',method:'DELETE'});`);
 const calls=a.behaviors.filter(b=>b.type==='CALL_API');assert.equal(calls.length,10);assert.deepEqual(calls.map(b=>b.url),['/a','/b','/c','/d','/e','/f','/g','/h','/i','/j']);assert.equal(calls[0].method,'POST');assert.deepEqual(calls[0].dataFields,['email','id']);assert.deepEqual(calls[5].dataFields,['name']);
});
test('dialogs UI state and change-driven selection are classified',()=>{
 const a=run(`alert('a');confirm('b');prompt('c');$('#modal').modal('show');$('#modal').dialog('open');$('#save').show();$('#save').hide();$('#save').toggle();$('#save').addClass('x');$('#save').removeClass('x');$('#save').tab('show');$('#save').collapse('toggle');$('#save').on('change',function(){ $('#email').val('x'); });`);
 assert.equal(a.behaviors.filter(b=>b.type==='OPEN_DIALOG').length,5);assert.equal(a.behaviors.filter(b=>b.type==='UI_STATE_CHANGE').length,7);assert.equal(a.behaviors.filter(b=>b.type==='SELECT_CHANGE').length,1);assert.equal(a.behaviors.at(-1).triggerId,'save');
});
test('jquery.validate and native validity produce CLIENT rules and original messages',()=>{
 const a=run(`$('#form').validate({rules:{email:{required:true,email:true,minlength:3}},messages:{email:{required:'必填'}}});document.querySelector('#email').setCustomValidity('格式錯誤');`);
 assert.equal(a.rules.length,4);assert.ok(a.rules.every(r=>r.layer==='CLIENT'&&r.fields.includes('email')));assert.equal(a.rules.find(r=>r.kind==='required').message,'必填');assert.ok(a.behaviors.some(b=>b.type==='VALIDATE'));
});
test('known libraries skipped, unknown calls preserved, API table covers required families',()=>{
 for(const [file,header,name] of [['jquery.min.js','/*! jQuery v3.7 */','jquery'],['bootstrap.min.js','/*! Bootstrap */','bootstrap'],['jquery-ui.js','/*! jQuery UI */','jquery-ui'],['jquery.validate.js','/*! jQuery Validation */','jquery.validate'],['select2.js','/*! Select2 */','select2'],['datepicker.js','/*! Datepicker */','datepicker']])assert.equal(identifyLibrary(file,header),name);
 const a=analyze({sources:[{file:'jquery.min.js',code:'/*! jQuery */ eval("must not parse library internals")',screenId:'screen'},{file:'custom.js',code:'unknownPlugin.run(42)',screenId:'screen'}],dom});
 assert.equal(a.libraries.length,1);assert.equal(a.behaviors.length,1);assert.equal(a.behaviors[0].type,'UNKNOWN');assert.equal(a.behaviors[0].status,'UNRESOLVED');assert.equal(a.diagnostics[0].code,'UNKNOWN_CALL');assert.ok(a.behaviors[0].expression.includes('unknownPlugin.run'));
});
test('eval computed access and input-built URL remain unresolved without execution',()=>{
 delete globalThis.__SCREENTRACE_PROBE__;
 const a=run(`globalThis.__SCREENTRACE_PROBE__='EXECUTED'; eval("fetch('/guess')"); obj[x]('/guess'); fetch('/api/'+document.querySelector('#email').value);`);
 assert.equal(globalThis.__SCREENTRACE_PROBE__,undefined);assert.equal(a.behaviors.filter(b=>b.type==='CALL_API').length,1);
 assert.ok(a.behaviors.filter(b=>/eval|obj\[x\]|fetch/.test(b.expression)).every(b=>b.status==='UNRESOLVED'));
 assert.equal(a.behaviors.find(b=>b.type==='CALL_API').url,null);
});
test('load ready and failed binding API sources remain present',()=>{
 const a=run(`fetch('/load');$(document).ready(function(){fetch('/ready');});window.addEventListener('load',function(){fetch('/window');});$('#missing').on('click',function(){fetch('/failed');});`);
 const calls=a.behaviors.filter(b=>b.type==='CALL_API');assert.equal(calls.length,4);assert.ok(calls.every(b=>b.triggerId==='screen'));assert.equal(calls.at(-1).status,'UNRESOLVED');assert.equal(calls.at(-1).selector,'#missing');
});
test('native Bootstrap and window.onload are source-only behaviors',()=>{
 const a=run(`var modal=new bootstrap.Modal(document.getElementById('modal'));modal.show();window.onload=function(){fetch('/onload');};`);
 assert.equal(a.behaviors.find(b=>b.type==='OPEN_DIALOG')?.status,'CONFIRMED');assert.equal(a.behaviors.find(b=>b.type==='CALL_API')?.event,'load');assert.equal(a.behaviors.find(b=>b.type==='CALL_API')?.status,'CONFIRMED');
 assert.equal(identifyLibrary('app.js',`const message='Bootstrap'; fetch('/must-not-skip')`),null);
});
test('a present but dynamic HTTP method must not default to GET',()=>{
 const a=run(`fetch('/api',{method:userInput});$.ajax({url:'/api',type:obj[x]});`);
 assert.ok(a.behaviors.filter(b=>b.type==='CALL_API').every(b=>b.status==='UNRESOLVED'&&b.method===null));
});
