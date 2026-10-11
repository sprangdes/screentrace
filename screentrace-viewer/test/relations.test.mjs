import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
import {fixture} from './fixture.mjs';

test('focused projection preserves self links, merged destinations and unresolved destinations',async()=>{
 const m=await ownModule('relations'),data=fixture();data.graph.behaviors=[{id:'self',triggerId:'shared',type:'NAVIGATE',targetId:'a'},{id:'unknown',triggerId:'shared',type:'NAVIGATE',event:'click'}];
 const index=(await ownModule('map')).indexGraph(data.graph),rows=m.focusedRelations(index,'a');
 assert.equal(rows.length,3);assert.ok(rows.some(r=>r.from==='a'&&r.to==='a'));assert.ok(rows.some(r=>r.to==='b'));assert.ok(rows.some(r=>r.unresolved&&r.behaviorIds.includes('unknown')));
});
