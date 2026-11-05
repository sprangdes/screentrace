import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fixture,fileFixture} from './fixture.mjs';
const source={file:'workspace:config.json',line:1};
// ep is called by the button that screens a and b share; unused has no caller. Neither has a handler.
// visitor reaches a only; member reaches a, then b.
function data(){
 const d=fixture();d.graph.schemaVersion='2.4';
 d.graph.relationships.push({id:'t1',type:'TRIGGERS',from:'shared',to:'ep'});
 d.graph.application.personas=[
  {id:'visitor',name:'訪客',facts:[{text:'user',truth:false,source}],startPaths:['/'],screens:{a:'APPLIES',b:'EXCLUDED'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'}],unevaluatedNavigations:0}},
  {id:'member',name:'會員',facts:[{text:'user',truth:true,source}],startPaths:['/'],screens:{a:'APPLIES',b:'APPLIES'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1},{screenId:'b',reach:'REACHABLE',depth:2}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'},{from:'a',to:'b',kind:'NAVIGATE',behaviorId:'nav',status:'APPLIES'}],unevaluatedNavigations:0}}];
 return d;
}
const open=async browser=>{const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});const state={requests:0,errors:[]};page.on('request',r=>{if(/^https?:/.test(r.url()))state.requests++;});page.on('pageerror',e=>state.errors.push(String(e)));await page.goto(await fileFixture(data()));await page.waitForSelector('[data-ready="true"]');return {page,state};};

test('R29 an API detail starts with its call chain: screens, the API, handlers',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser);
  await page.click('.page-tab[data-page="api"]');await page.waitForSelector('.api-page');
  await page.click('.api-row[data-api-row="ep"]');
  const chain=page.locator('[data-api-detail="ep"] [data-api-section="chain"]');
  assert.equal(await chain.getAttribute('role'),'group');
  assert.equal(await chain.getAttribute('aria-label'),'呼叫鏈：2 個畫面 → GET /api/owners → 找不到處理程式');
  assert.deepEqual(await chain.locator('.api-chain-heading').allTextContents(),['畫面 2','API','處理程式 0']);
  assert.deepEqual(await chain.locator('[data-chain-screen]').evaluateAll(list=>list.map(n=>n.dataset.chainScreen)),['b','a']);
  assert.equal(await chain.locator('[data-chain-screen="a"] .api-chain-trigger').textContent(),'共用按鈕 按鈕');
  assert.equal(await chain.locator('.is-self').getAttribute('data-api-status'),'IN_USE');
  assert.equal(await chain.locator('[data-chain-stage="handlers"] .is-empty').textContent(),'找不到處理程式');
  assert.equal(await chain.locator('.api-chain-link').count(),2);
  assert.equal(await chain.locator('.api-chain-link').first().getAttribute('aria-hidden'),'true');
  await page.click('.api-row[data-api-row="unused"]');
  const none=page.locator('[data-api-detail="unused"] [data-api-section="chain"]');
  assert.equal(await none.locator('[data-chain-stage="screens"] .is-empty').textContent(),'沒有呼叫來源');
  assert.equal(await none.locator('.is-self').getAttribute('data-api-status'),'UNREFERENCED');
  await page.click('.api-row[data-api-row="ep"]');
  await chain.locator('[data-chain-screen="a"]').click();
  await page.waitForFunction(()=>!document.querySelector('.api-page'));
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});

test('R29 the persona comparison draws each group as a bar of its share of the flow',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser);
  await page.click('.page-tab[data-page="personas"]');await page.waitForSelector('[data-persona-page]');
  await page.locator('[data-persona-row="member"]').click();
  const folds=page.locator('[data-persona-section="compare"] [data-persona-fold]');
  assert.deepEqual(await folds.evaluateAll(list=>list.map(f=>{const bar=f.querySelector('.persona-overlap-bar');return [f.dataset.personaFold,bar.dataset.overlap,bar.getAttribute('aria-hidden'),bar.querySelector('.persona-overlap-fill').style.width,bar.nextElementSibling.textContent];})),
   [['only','only','true','50%','1 個畫面'],['visitor','shared','true','50%','1 個畫面']]);
  await page.locator('[data-persona-row="visitor"]').click();
  assert.deepEqual(await folds.evaluateAll(list=>list.map(f=>f.querySelector('.persona-overlap-fill').style.width)),['100%']);
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});
