import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ownModule} from './module.mjs';
import {mdFixture} from './md-fixture.mjs';

test('WP40 fixed remove, component override, inherited remove and batch sequence preserves exact Markdown bytes',async()=>{
 const [review,md]=await Promise.all([ownModule('shared/review'),ownModule('shared/review-md')]);
 const payload=mdFixture(),batchKeys=review.buttonComponents(payload.graph).filter(key=>key.screenId==='b');
 let individual=review.emptyReview(payload.graph,payload.fingerprint);
 individual=review.setScreen(individual,'a','REMOVE');
 individual=review.setComponent(individual,'a','shared','KEEP');
 individual=review.setScreen(individual,'b','KEEP');
 for(const key of batchKeys)individual=review.setComponent(individual,key.screenId,key.componentId,'REMOVE');
 let batched=review.emptyReview(payload.graph,payload.fingerprint);
 batched=review.setScreen(batched,'a','REMOVE');
 batched=review.setComponent(batched,'a','shared','KEEP');
 batched=review.setScreen(batched,'b','KEEP');
 batched=review.batchSetComponents(batched,batchKeys,'REMOVE');
 const options={generatedAt:'2026-10-07T00:00:00.000Z',toolVersion:'test'};
 const expected=await md.generateMarkdown(payload,individual,options),actual=await md.generateMarkdown(payload,batched,options);
 assert.equal(actual,expected);
 assert.equal(createHash('sha256').update(actual).digest('hex'),'ce59e59ac3118c2fa73a16bd3d14a7c421311a1334d86ad7e3842ed1b43de678');
 const restored=await md.importMarkdown(actual,payload);
 assert.equal(await md.generateMarkdown(payload,restored.state,options),actual);
});
