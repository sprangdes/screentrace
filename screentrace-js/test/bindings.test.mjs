import {test} from 'node:test';import assert from 'node:assert/strict';
import {bindings,select} from '../bindings.mjs';
const dom=[{id:'root',tag:'div',attrs:{id:'panel'},parent:null},{id:'c1',componentId:'button1',tag:'button',attrs:{id:'save',class:'primary',name:'save'},parent:'root'},{id:'c2',componentId:'button2',tag:'button',attrs:{class:'primary'},parent:'root'},{id:'c3',componentId:'input',tag:'input',attrs:{name:'email'},parent:null}];
test('all required static selectors and descendant relationship',()=>{
 for(const [selector,expected] of [['#save',['button1']],['.primary',['button1','button2']],['[name="email"]',['input']],['button',['button1','button2']],['#panel button',['button1','button2']],['this',['button1']]])assert.deepEqual(select(selector,dom,'button1'),expected);
 for(const selector of ['#missing','${selector}','button:hover','input[name=${x}]'])assert.deepEqual(select(selector,dom),[]);
});
test('jQuery direct and delegated, native and inline binding keep raw selectors',()=>{
 const code=`$('#save').click(function(){ alert('x'); }); $('.primary').on('change', function(){}); $('#panel').on('click', 'button', handler); document.getElementById('save').addEventListener('submit', handler); document.querySelector('#missing').onclick=handler;`;
 const result=bindings({file:'app.js',code,screenId:'screen'},dom);
 assert.deepEqual(result.map(b=>b.triggerIds),[['button1'],['button1','button2'],['button1','button2'],['button1'],[]]);
 assert.equal(result.at(-1).status,'UNRESOLVED');assert.equal(result.at(-1).selector,'#missing');assert.equal(result[2].delegated,true);
 const inline=bindings({file:'form.jsp',code:'save(this)',screenId:'screen',triggerId:'button1',event:'click',line:8},dom);
 assert.equal(inline[0].source.line,8);assert.deepEqual(inline[0].triggerIds,['button1']);
});
test('dynamic access and dynamic selectors never bind',()=>{
 const result=bindings({file:'app.js',code:`$(input.value).on('click', handler); obj[x].onclick=handler;`,screenId:'screen'},dom);
 assert.equal(result.length,2);assert.ok(result.every(b=>b.status==='UNRESOLVED'));assert.equal(result[0].selector,'input.value');
});
