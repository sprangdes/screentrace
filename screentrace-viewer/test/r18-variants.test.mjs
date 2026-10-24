import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';
test('WP79 URL search keeps every audience variant and layout places siblings side by side',async()=>{
 const m=await ownModule('map');const screens=['a','z','m'].map((id,i)=>({id,type:'SCREEN',name:id,attributes:{route:i===2?'/other':'/',entryPointId:i===2?'other':'entry',...(i<2?{audienceVariant:id}:{})}}));
 const index=m.indexGraph({schemaVersion:'2.3',application:{name:'sample'},nodes:screens,relationships:[]});
 assert.deepEqual([...m.searchScreens(index,'/')].sort(),['a','m','z']);
 const layout=m.layeredLayout(index);assert.equal(layout.get('a').y,layout.get('z').y);assert.equal(Math.abs(layout.get('a').x-layout.get('z').x),320);
});
test('OQ-035 split screen imports stay orphan with an explicit remark and never copy decisions',async()=>{
 const m=await ownModule('shared/review-md'),r=await ownModule('shared/review');const {mdFixture}=await import('./md-fixture.mjs');const original=mdFixture();const state=r.setScreen(r.emptyReview(original.graph,original.fingerprint),'a','KEEP');const md=await m.generateMarkdown(original,state,{generatedAt:'2026-10-03T00:00:00.000Z',toolVersion:'test'});
 const current=structuredClone(original);current.graph.schemaVersion='2.3';current.graph.nodes=current.graph.nodes.filter(n=>n.id!=='a');current.graph.relationships=current.graph.relationships.filter(e=>e.from!=='a'&&e.to!=='a');current.graph.behaviors=[];for(const id of ['reader','curator'])current.graph.nodes.push({id,type:'SCREEN',name:id,source:{file:'src/App.tsx',line:1},confidence:'INFERRED',evidence:[{parser:'fixture',resolution:'INFERRED',source:{file:'src/App.tsx',line:1}}],attributes:{route:'/',supersedesScreenId:'a',audienceVariant:id}});
 const imported=await m.importMarkdown(md,current);assert.equal(imported.orphans.find(o=>o.screenId==='a').reason,'此網址已依身分拆分，請重新標記');assert.equal(r.screenDecision(imported.state,'reader'),'UNDECIDED');assert.equal(r.screenDecision(imported.state,'curator'),'UNDECIDED');assert.equal(imported.state.screenDecisions.a,'KEEP');
 const same=await m.importMarkdown(md,original);assert.equal(r.screenDecision(same.state,'a'),'KEEP');assert.ok(!same.orphans.some(o=>o.screenId==='a'));
});
