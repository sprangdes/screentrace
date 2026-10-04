import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ownModule} from './module.mjs';

test('Java and TypeScript share exact R-API-1..6 status and caller vectors',async()=>{
  const vectors=JSON.parse(await readFile(new URL('../../docs/examples/api-usage-vectors.json',import.meta.url),'utf8'));
  const m=await ownModule('shared/review'),covered=new Set();
  assert.equal(vectors.format_version,1);assert.ok(vectors.cases.length>0);
  for(const vector of vectors.cases){
    for(const rule of vector.rules)covered.add(rule);
    const graph=vectors.graphs[vector.graph];
    let state=m.emptyReview(graph,'shared-vector');
    for(const [screen,decision]of Object.entries(vector.screenDecisions))state=m.setScreen(state,screen,decision);
    for(const [screen,components]of Object.entries(vector.componentDecisions))for(const [component,decision]of Object.entries(components))state=m.setComponent(state,screen,component,decision);
    const before=JSON.stringify(state),graphBefore=JSON.stringify(graph);
    const actual=Object.fromEntries([...m.deriveApiUsage(graph,state)].map(([id,usage])=>[id,{status:usage.status,callers:usage.callers.map(c=>({screenId:c.screenId,componentId:c.componentId??null,behaviorId:c.behaviorId??null}))}]));
    assert.deepEqual(actual,vector.expected,vector.id);
    assert.equal(JSON.stringify(state),before,vector.id);assert.equal(JSON.stringify(graph),graphBefore,vector.id);
  }
  assert.deepEqual([...covered].sort(),['R-API-1','R-API-2','R-API-3','R-API-4','R-API-5','R-API-6']);
});
