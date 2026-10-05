import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
import {mdFixture} from './md-fixture.mjs';

test('WP36 table derives operable rows and merges shared navigation without losing per-screen keys',async()=>{
 const [map,catalog]=await Promise.all([ownModule('map'),ownModule('button-table')]),index=map.indexGraph(mdFixture().graph),rows=catalog.buttonTableRows(index);
 assert.ok(rows.some(row=>row.kind==='按鈕'&&row.members.some(member=>member.screenId==='a'&&member.componentId==='shared')));
 const global=rows.find(row=>row.global);assert.ok(global,'shared navigation must be represented by one display-only row');assert.equal(new Set(global.members.map(member=>member.screenId)).size,2);
 assert.equal(global.members.length,2);
});

test('WP36 batch decisions generate byte-identical Markdown to individual decisions',async()=>{
 const payload=mdFixture(),[review,md]=await Promise.all([ownModule('shared/review'),ownModule('shared/review-md')]),keys=review.buttonComponents(payload.graph),initial=review.emptyReview(payload.graph,payload.fingerprint);let individual=initial;for(const key of keys)individual=review.setComponent(individual,key.screenId,key.componentId,'KEEP');const batch=review.batchSetComponents(initial,keys,'KEEP');const options={generatedAt:'2026-10-05T00:00:00.000Z'};assert.equal(await md.generateMarkdown(payload,individual,options),await md.generateMarkdown(payload,batch,options));
});
