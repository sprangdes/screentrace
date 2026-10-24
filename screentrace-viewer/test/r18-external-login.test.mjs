import test from 'node:test';import assert from 'node:assert/strict';import {ownModule} from './module.mjs';import {fixture} from './fixture.mjs';
test('WP80 only source-proven external login APIs project a callback screen flow',async()=>{
 const m=await ownModule('map'),data=fixture();data.graph.schemaVersion='2.3';
 data.graph.behaviors=[{id:'sso',triggerId:'shared',event:'click',type:'CALL_API',targetId:'ep'}];data.graph.relationships=data.graph.relationships.filter(e=>e.type==='CONTAINS');data.graph.relationships.push({id:'callback',type:'FORWARDS_TO',from:'ep',to:'b'});
 assert.equal(m.indexGraph(data.graph).relations.length,0);
 data.graph.nodes.find(n=>n.id==='ep').attributes.externalLogin='true';
 assert.ok(m.indexGraph(data.graph).relations.some(r=>r.from==='a'&&r.to==='b'&&r.behaviorIds.includes('sso')));
});
