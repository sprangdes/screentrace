import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ownModule} from './module.mjs';
import {mdFixture} from './md-fixture.mjs';

test('WP40 fixed remove, component override and inherited remove sequence preserves exact Markdown bytes and round-trips',async()=>{
 const [review,md]=await Promise.all([ownModule('shared/review'),ownModule('shared/review-md')]);
 const payload=mdFixture(),keys=review.buttonComponents(payload.graph).filter(key=>key.screenId==='b');
 let state=review.emptyReview(payload.graph,payload.fingerprint);
 state=review.setScreen(state,'a','REMOVE');
 state=review.setComponent(state,'a','shared','KEEP');
 state=review.setScreen(state,'b','KEEP');
 for(const key of keys)state=review.setComponent(state,key.screenId,key.componentId,'REMOVE');
 const options={generatedAt:'2026-10-07T00:00:00.000Z',toolVersion:'test'};
 const actual=await md.generateMarkdown(payload,state,options);
 assert.equal(createHash('sha256').update(actual).digest('hex'),'d4e544a969994dccb0294dd6a9f7fc37b8e32b11f4ac72734c3311f7e58309f7');
 const restored=await md.importMarkdown(actual,payload);
 assert.equal(await md.generateMarkdown(payload,restored.state,options),actual);
});
