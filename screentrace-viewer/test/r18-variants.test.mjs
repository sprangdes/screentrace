import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';
test('WP79 URL search keeps every audience variant and layout places siblings side by side',async()=>{
 const m=await ownModule('map');const screens=['a','z','m'].map((id,i)=>({id,type:'SCREEN',name:id,attributes:{route:i===2?'/other':'/',entryPointId:i===2?'other':'entry',...(i<2?{audienceVariant:id}:{})}}));
 const index=m.indexGraph({schemaVersion:'2.3',application:{name:'sample'},nodes:screens,relationships:[]});
 assert.deepEqual([...m.searchScreens(index,'/')].sort(),['a','m','z']);
 const layout=m.layeredLayout(index);assert.equal(layout.get('a').y,layout.get('z').y);assert.equal(Math.abs(layout.get('a').x-layout.get('z').x),320);
});
