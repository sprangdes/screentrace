import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';import {fixture} from './fixture.mjs';
test('R18 simulation target choices expose per-target audience evidence conditions',async()=>{
 const {simulate}=await ownModule('simulation'),data=fixture();data.graph.behaviors=[{id:'jump',triggerId:'shared',type:'NAVIGATE',event:'click',evidence:[{parser:'BabelReactAnalyzer',resolution:'AMBIGUOUS',detail:'全部候選=[a, b]'},...['a','b'].map(id=>({parser:'ReactAudienceTarget',resolution:'INFERRED',source:{file:'src/Gate.tsx',line:12},detail:JSON.stringify({targetId:id,condition:id==='a'?'!subject':'handoff === "done"'})}))]}];
 const result=simulate(data,'a',{graphComponentId:'shared',componentResolution:'CONFIRMED',tag:'a',path:'a',graphScreenId:'a'},{tag:'a',valid:true});
 const leaves=x=>x.choices?.flatMap(leaves)??[x];const values=leaves(result);assert.ok(values.some(x=>x.targetId==='b'&&x.condition==='handoff === "done"'));assert.ok(values.some(x=>x.targetId==='a'&&x.condition==='!subject'));
});
