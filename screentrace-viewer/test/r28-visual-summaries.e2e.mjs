import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fixture,fileFixture} from './fixture.mjs';
const source={file:'workspace:config.json',line:1};
// One API in use (ep, called by the shared button), one unreferenced (unused); both have no handler, so one group.
// visitor reaches a only; member reaches a, then b as possible.
function data(){
 const d=fixture();d.graph.schemaVersion='2.4';
 d.graph.relationships.push({id:'t1',type:'TRIGGERS',from:'shared',to:'ep'});
 d.graph.application.personas=[
  {id:'visitor',name:'訪客',facts:[{text:'user',truth:false,source}],startPaths:['/'],screens:{a:'APPLIES',b:'EXCLUDED'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'}],unevaluatedNavigations:0}},
  {id:'member',name:'會員',facts:[{text:'user',truth:true,source}],startPaths:['/'],screens:{a:'APPLIES',b:'UNKNOWN'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1},{screenId:'b',reach:'POSSIBLE',depth:2}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'},{from:'a',to:'b',kind:'NAVIGATE',behaviorId:'nav',status:'UNKNOWN'}],unevaluatedNavigations:1}}];
 return d;
}
const open=async browser=>{const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});const state={requests:0,errors:[]};page.on('request',r=>{if(/^https?:/.test(r.url()))state.requests++;});page.on('pageerror',e=>state.errors.push(String(e)));await page.goto(await fileFixture(data()));await page.waitForSelector('[data-ready="true"]');return {page,state};};
const shares=locator=>locator.locator('.proportion-part').evaluateAll(parts=>parts.map(p=>[p.dataset.share,p.style.flexGrow]));

test('R28 the API page shows every API by status in one bar, and each group in a small one',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser);
  await page.click('.page-tab[data-page="api"]');await page.waitForSelector('.api-page');
  const summary=page.locator('.api-heading .api-summary');
  assert.equal(await summary.locator('.api-summary-bar').getAttribute('role'),'img');
  assert.equal(await summary.locator('.api-summary-bar').getAttribute('aria-label'),'使用中 1、未被使用 1、可移除 0');
  assert.deepEqual(await shares(summary),[['IN_USE','1'],['UNREFERENCED','1']],'an empty status gets no segment');
  assert.deepEqual(await summary.locator('.api-summary-key').allTextContents(),['使用中 1','未被使用 1','可移除 0']);
  const group=page.locator('.api-group-header .api-group-bar');
  assert.equal(await group.getAttribute('aria-hidden'),'true','the group header already says its counts');
  assert.deepEqual(await shares(group),[['IN_USE','1'],['UNREFERENCED','1']]);
  // Filtering narrows the groups, not the summary of all APIs.
  await page.click('[data-api-filter="ATTENTION"]');
  assert.deepEqual(await shares(page.locator('.api-group-header .api-group-bar')),[['UNREFERENCED','1']]);
  assert.deepEqual(await shares(summary),[['IN_USE','1'],['UNREFERENCED','1']]);
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});

test('R28 the persona page shows each persona reach as a bar, conditions as marks, and screens per step',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser);
  await page.click('.page-tab[data-page="personas"]');await page.waitForSelector('[data-persona-page]');
  const visitorBar=page.locator('[data-persona-row="visitor"] .persona-reach-bar');
  assert.equal(await visitorBar.getAttribute('aria-hidden'),'true');
  assert.equal(await visitorBar.getAttribute('title'),'會走到 1、可能走到 0、走不到 0、不適用 1');
  assert.deepEqual(await shares(visitorBar),[['REACHABLE','1'],['EXCLUDED','1']]);
  assert.deepEqual(await shares(page.locator('[data-persona-row="member"] .persona-reach-bar')),[['REACHABLE','1'],['POSSIBLE','1']]);
  assert.equal(await page.locator('[data-persona-section="conditions"] .persona-fact').getAttribute('data-truth'),'false');
  assert.deepEqual(await page.locator('[data-persona-section="flow"] .persona-step-title').allTextContents(),['第 1 步 · 1']);
  await page.locator('[data-persona-row="member"]').click();
  assert.equal(await page.locator('[data-persona-section="conditions"] .persona-fact').getAttribute('data-truth'),'true');
  // R32: the step bar chart became the board, one column per step with a card per screen.
  const columns=page.locator('[data-persona-section="flow"] .persona-board .persona-step-group');
  assert.deepEqual(await columns.locator('.persona-step-title').allTextContents(),['第 1 步 · 1','第 2 步 · 1']);
  assert.deepEqual(await columns.locator('.persona-card').evaluateAll(list=>list.map(c=>[c.dataset.personaScreen,c.dataset.reach,getComputedStyle(c).borderTopStyle])),[['a','REACHABLE','solid'],['b','POSSIBLE','dashed']]);
  assert.equal(await page.locator('[data-persona-step="step-2"]').isVisible(),true);
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});
