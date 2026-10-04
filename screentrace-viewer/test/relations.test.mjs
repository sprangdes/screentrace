import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
import {fixture} from './fixture.mjs';

test('focus nodes allocate around all four sides without overlapping and support many destinations',async()=>{
 const m=await ownModule('relations');
 for(const count of [0,1,4,12,13,80]){
  const points=m.focusLayout(count);assert.equal(points.length,count);
  assert.deepEqual(new Set(points.map(p=>p.side)),count>=4?new Set(['left','top','right','bottom']):new Set(points.map(p=>p.side)));
  assert.equal(new Set(points.map(p=>`${p.x},${p.y}`)).size,count);for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++){const p=points[a],q=points[b];assert.ok(p.x+190<=q.x||q.x+190<=p.x||p.y+105<=q.y||q.y+105<=p.y,`overlapping destinations at ${a}/${b} for count ${count}`);}
 }
});
test('focused projection preserves self links, merged destinations and unresolved destinations',async()=>{
 const m=await ownModule('relations'),data=fixture();data.graph.behaviors=[{id:'self',triggerId:'shared',type:'NAVIGATE',targetId:'a'},{id:'unknown',triggerId:'shared',type:'NAVIGATE',event:'click'}];
 const index=(await ownModule('map')).indexGraph(data.graph),rows=m.focusedRelations(index,'a');
 assert.equal(rows.length,3);assert.ok(rows.some(r=>r.from==='a'&&r.to==='a'));assert.ok(rows.some(r=>r.to==='b'));assert.ok(rows.some(r=>r.unresolved&&r.behaviorIds.includes('unknown')));
});
