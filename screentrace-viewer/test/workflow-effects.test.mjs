import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';
const {staticAction,simulate}=await ownModule('simulation');
const evidence=item=>[{parser:'AcornStaticAnalyzer',resolution:'CONFIRMED',source:{file:'widget.js',line:1},detail:JSON.stringify(item)}];
test('only proven bounded metadata becomes an inert simulation effect',()=>{
 assert.equal(staticAction({type:'UI_STATE_CHANGE',evidence:evidence({operation:'show',selector:'#quantity',status:'CONFIRMED'})}).kind,'ui');
 assert.equal(staticAction({type:'UI_STATE_CHANGE',guard:'unknown',evidence:evidence({operation:'show',selector:'#quantity',status:'CONFIRMED'})}),undefined);
 assert.equal(staticAction({type:'UNKNOWN',evidence:evidence({operation:'show',selector:'#quantity',status:'UNRESOLVED'})}),undefined);
 assert.equal(staticAction({type:'UNKNOWN',evidence:evidence({operation:'eval',value:'probe()',status:'CONFIRMED'})}),undefined);
});
test('UI effects can be simulated without inventing a destination node',()=>{
 const b={id:'clear',triggerId:'button',event:'click',type:'SELECT_CHANGE',evidence:evidence({operation:'setValue',selector:'[name="code"]',value:'',status:'CONFIRMED'})};
 const payload={graph:{nodes:[{id:'s',type:'SCREEN',attributes:{},confidence:'CONFIRMED'},{id:'button',type:'COMPONENT',attributes:{kind:'BUTTON'},confidence:'CONFIRMED'}],relationships:[{from:'s',to:'button',type:'CONTAINS'}],behaviors:[b]}};
 const effect=simulate(payload,'s',{graphComponentId:'button',componentResolution:'CONFIRMED'},{tag:'button'});
 assert.equal(effect.kind,'ui');assert.equal(effect.simulatable,true);assert.equal(effect.value,'');
});
test('nested source alternatives expose every destination and retain unknown branches',async()=>{
 const {choiceLeaves}=await ownModule('simulation');const unknown={kind:'unknown',expression:'originalHandler()'};const choices=choiceLeaves([unknown,{kind:'choices',expression:'session == null',choices:[{kind:'navigate',targetId:'login',label:'Login'},{kind:'navigate',targetId:'list',label:'List'}]}]);assert.deepEqual(choices.map(c=>c.targetId||c.kind),['unknown','login','list']);assert.equal(choices[0],unknown);assert.ok(choices[1].label.includes('session == null'));
});
