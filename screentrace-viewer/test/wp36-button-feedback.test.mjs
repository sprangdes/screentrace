import test from 'node:test';
import assert from 'node:assert/strict';
import {ownModule} from './module.mjs';
import {mdFixture} from './md-fixture.mjs';

test('WP36 button summaries separate primary action, sorted outcomes and collapsed route evidence',async()=>{
 const {indexGraph}=await ownModule('map'),{actionSummary}=await ownModule('button-table');
 const payload=mdFixture(),g=payload.graph;
 const add=(id,type,name,attributes={})=>g.nodes.push({id,type,name,attributes,confidence:'CONFIRMED',source:{file:'fixture.jsp',line:1},evidence:[{source:{file:'fixture.jsp',line:1},parser:'Fixture',resolution:'CONFIRMED',detail:'fixture'}]});
 add('link','COMPONENT','Open records',{kind:'LINK'});add('submit','COMPONENT','Save',{kind:'SUBMIT'});add('endpoint-b','ENDPOINT','POST /z-route',{path:'/z-route',httpMethod:'POST'});add('endpoint-a','ENDPOINT','POST /a-route',{path:'/a-route',httpMethod:'POST'});add('screen-z','SCREEN','Zulu',{route:'/z'});add('screen-a','SCREEN','Alpha',{route:'/a'});
 g.relationships.push({id:'link-a',type:'NAVIGATES_TO',from:'link',to:'screen-a',confidence:'CONFIRMED'},{id:'link-z',type:'NAVIGATES_TO',from:'link',to:'screen-z',confidence:'CONFIRMED'},{id:'link-api',type:'CALLS',from:'link',to:'endpoint-a',confidence:'CONFIRMED'},{id:'submit-a',type:'NAVIGATES_TO',from:'submit',to:'screen-a',confidence:'CONFIRMED'},{id:'submit-z',type:'NAVIGATES_TO',from:'submit',to:'screen-z',confidence:'CONFIRMED'},{id:'submit-route-z',type:'CALLS',from:'submit',to:'endpoint-b',confidence:'CONFIRMED'},{id:'submit-route-a',type:'CALLS',from:'submit',to:'endpoint-a',confidence:'CONFIRMED'});
 const index=indexGraph(g),link=actionSummary(index,'link'),submit=actionSummary(index,'submit');
 assert.equal(link.primaryAction,'前往「候選畫面」');assert.equal(link.possibleResults,'可能前往：Alpha、Zulu；有多個可能結果');assert.doesNotMatch(`${link.primaryAction} ${link.possibleResults}`,/呼叫 API|送出到/);
 assert.equal(submit.primaryAction,'送出表單');assert.equal(submit.possibleResults,'可能前往：Alpha、Zulu；有多個可能結果');assert.deepEqual(submit.technicalDetails,['伺服端路由：POST /a-route','伺服端路由：POST /z-route']);
});

test('WP36 quick row marks use the same composite-key writer and preserve byte-identical Markdown',async()=>{
 const payload=mdFixture(),[review,md]=await Promise.all([ownModule('shared/review'),ownModule('shared/review-md')]),initial=review.emptyReview(payload.graph,payload.fingerprint),keys=review.buttonComponents(payload.graph),options={generatedAt:'2026-10-05T00:00:00.000Z'};
 const quick=review.setComponent(initial,keys[0].screenId,keys[0].componentId,'KEEP'),individual=review.setComponent(initial,keys[0].screenId,keys[0].componentId,'KEEP'),batch=review.batchSetComponents(initial,[keys[0]],'KEEP');
 assert.equal(await md.generateMarkdown(payload,quick,options),await md.generateMarkdown(payload,individual,options));
 assert.equal(await md.generateMarkdown(payload,quick,options),await md.generateMarkdown(payload,batch,options));
});
