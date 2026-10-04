import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';import {node} from './fixture.mjs';
test('WP19 duplicate view basenames append routes and still identical names get deterministic suffixes',async()=>{
 const m=await ownModule('names');const nodes=[node('a','SCREEN','old',{view:'web/a/ownerDetails.jsp'}),node('b','SCREEN','old',{view:'web/b/ownerDetails.jsp'}),node('c','SCREEN','old',{view:'web/c/ownerDetails.jsp'})];const routes=new Map([['a',['/owners/{id}']],['b',['/owners/new']],['c',['/owners/new']]]),hints=new Map(nodes.map(n=>[n.id,{title:'Shared'}]));
 const names=m.screenNames(nodes,hints,routes);assert.equal(names.get('a'),'Owner Details（/owners/{id}）');assert.equal(new Set(names.values()).size,3);assert.deepEqual([...names],[...m.screenNames([...nodes].reverse(),hints,routes)]);
});
