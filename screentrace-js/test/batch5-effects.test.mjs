import test from 'node:test';import assert from 'node:assert/strict';import {analyze} from '../analyzer.mjs';
const dom=[{id:'go',componentId:'go',tag:'button',attrs:{id:'button'},parent:null},{id:'panel',componentId:'panel',tag:'div',attrs:{id:'panel'},parent:null}];
const run=code=>analyze({sources:[{file:'page.jsp',line:1,event:'click',code,screenId:'s',triggerId:'go'}],dom});
test('jQuery class toggles retain a literal class and all source selectors',()=>{assert.ok(run("$('#panel, #button').toggleClass('active')").behaviors.some(b=>b.operation==='classToggle'&&b.value==='active'&&b.selector==='#panel, #button'));});
test('negated returned confirmation cancels native continuation without executing the condition',()=>{assert.ok(run("if(!(confirm('Delete item?'))) return false").behaviors.some(b=>b.operation==='confirm'&&b.cancelsDefault&&b.message==='Delete item?'));assert.ok(!run("function confirm(){return true;} if(!confirm('x'))return false;").behaviors.some(b=>b.operation==='confirm'));});
test('complete two-branch inline display toggle is an inert operation; mixed targets remain guarded',()=>{
 const source="const panel=document.getElementById('panel');document.getElementById('button').addEventListener('click',function(){if(panel.style.display==='none'||panel.style.display===''){panel.style.display='block';}else{panel.style.display='none';}});";
 assert.ok(run(source).behaviors.some(b=>b.operation==='toggleDisplay'&&b.selector==='#panel'));
 assert.ok(!run(source.replace("else{panel.style.display='none';}","else{document.body.style.display='none';}")).behaviors.some(b=>b.operation==='toggleDisplay'));
});
test('window.self location literal navigation is discovered',()=>{assert.ok(run("window.self.location='next.do?x=${row.id}'").behaviors.some(b=>b.type==='NAVIGATE'&&b.url?.startsWith('next.do?')));});
test('legacy with-form submission requires the complete three-statement shape and unshadowed native methods',()=>{
 const source="with(document.getElementById('f')){method='post';action='save.do?command=add';submit();}";
 const form={id:'f',componentId:'f',tag:'form',attrs:{id:'f'}};
 const input={id:'i',componentId:'i',parent:'f',tag:'input',attrs:{name:'submit'}};
 const request=dom=>analyze({sources:[{file:'page.jsp',line:1,event:'click',code:source,screenId:'s',triggerId:'go'}],dom});
 assert.ok(request([form]).behaviors.some(b=>b.type==='SUBMIT_FORM'&&b.url==='save.do?command=add'&&b.method==='POST'));
 assert.ok(!request([form,input]).behaviors.some(b=>b.type==='SUBMIT_FORM'));
 assert.ok(!run("function x(window){window.self.location='wrong';}x({});").behaviors.some(b=>b.type==='NAVIGATE'));
});
test('unknown values are retained only after a literal navigation query boundary',()=>{
 assert.ok(run("window.self.location='item.do?command=edit&id='+document.getElementsByName('ids')[j].value").behaviors.some(b=>b.url==='item.do?command=edit&id={input1}'&&b.status==='INFERRED'));
 assert.ok(!run("window.self.location='/'+document.getElementsByName('ids')[j].value+'/edit'").behaviors.some(b=>b.url));
});
