import test from 'node:test';import assert from 'node:assert/strict';import {analyze} from '../analyzer.mjs';
const dom=[{id:'b',componentId:'b',tag:'button',attrs:{id:'go'}},{id:'c',componentId:'c',tag:'input',attrs:{name:'rows',type:'checkbox'}}];
const source=`function edit(){var count=0;var j=0;for(var i=0;i<document.getElementsByName('rows').length;i++){if(document.getElementsByName('rows')[i].checked){j=i;count++;}}if(count==0){alert('Select a row');return;}if(count>1){alert('Select only one');return;}if(count==1){window.self.location='edit.do?command=edit&id='+document.getElementsByName('rows')[j].value;}}document.getElementById('go').addEventListener('click',edit);`;
const run=code=>analyze({sources:[{file:'page.js',code,screenId:'s'}],dom});
test('complete selection-count workflow uses tool-owned input state and retains unknown query value',()=>{
 const result=run(source);const gate=result.behaviors.find(b=>b.operation==='workflowGate');assert.deepEqual(gate.checks,[{kind:'selection',selector:'[name="rows"]',min:1,max:1,message:'Select a row',maximumMessage:'Select only one'}]);assert.ok(result.behaviors.some(b=>b.type==='NAVIGATE'&&b.url==='edit.do?command=edit&id={input1}'&&b.status==='INFERRED'));
});
test('changed loop, extra effects and shadowed document never acquire the workflow primitive',()=>{
 for(const code of [source.replace('count++;','count+=2;'),source.replace('count>1','count>2'),source.replace("alert('Select a row');return;","publish();alert('Select a row');return;"),source.replace('function edit(){','function edit(document){')])assert.ok(!run(code).behaviors.some(b=>b.operation==='workflowGate'));
});
