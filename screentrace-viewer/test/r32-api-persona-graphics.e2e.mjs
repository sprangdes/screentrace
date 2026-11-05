import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fixture,fileFixture,node} from './fixture.mjs';
const source={file:'workspace:config.json',line:1};
// ep (GET) is called by the button screens a and b share; owner (DELETE, with a parameter) by a's own button.
// visitor reaches a for certain; member reaches a, then possibly b.
function data(){
 const d=fixture();d.graph.schemaVersion='2.4';
 d.graph.nodes.push(node('own','COMPONENT','刪除',{kind:'BUTTON'}),node('owner','ENDPOINT','刪除',{path:'/api/owners/{ownerId}',httpMethod:'DELETE'}));
 d.graph.relationships.push({id:'t1',type:'TRIGGERS',from:'shared',to:'ep'},{id:'c2',type:'CONTAINS',from:'a',to:'own'},{id:'t2',type:'TRIGGERS',from:'own',to:'owner'});
 d.graph.application.personas=[
  {id:'visitor',name:'訪客',facts:[{text:'user',truth:false,source}],startPaths:['/'],screens:{a:'APPLIES',b:'EXCLUDED'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'}],unevaluatedNavigations:0}},
  {id:'member',name:'會員',facts:[{text:'user',truth:true,source}],startPaths:['/'],screens:{a:'APPLIES',b:'APPLIES'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1},{screenId:'b',reach:'POSSIBLE',depth:2}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'},{from:'a',to:'b',kind:'NAVIGATE',behaviorId:'nav',status:'UNKNOWN'}],unevaluatedNavigations:1}}];
 return d;
}
const open=async browser=>{const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});const state={requests:0,errors:[]};page.on('request',r=>{if(/^https?:/.test(r.url()))state.requests++;});page.on('pageerror',e=>state.errors.push(String(e)));await page.goto(await fileFixture(data()));await page.waitForSelector('[data-ready="true"]');return {page,state};};

test('R32 API rows color the method, mark path parameters, and draw callers as a bar of the most',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser);
  await page.click('.page-tab[data-page="api"]');await page.waitForSelector('.api-page');
  const row=id=>page.locator(`.api-row[data-api-row="${id}"]`);
  const colors=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.api-row .method-badge')].map(b=>[b.dataset.method,getComputedStyle(b).backgroundColor])));
  assert.deepEqual(Object.keys(colors).sort(),['DELETE','GET','POST']);
  assert.equal(new Set(Object.values(colors)).size,3,'each method has its own color');
  assert.equal(await row('owner').locator('.api-path').textContent(),'/api/owners/{ownerId}','the path reads the same');
  assert.deepEqual(await row('owner').locator('.api-path-param').allTextContents(),['{ownerId}']);
  assert.equal(await row('ep').locator('.api-path-param').count(),0);
  const bar=async id=>row(id).locator('.api-caller-bar').evaluate(b=>[b.getAttribute('aria-hidden'),b.querySelector('.api-caller-fill')?.style.width??null]);
  assert.deepEqual(await bar('ep'),['true','100%']);
  assert.deepEqual(await bar('owner'),['true','50%']);
  assert.deepEqual(await bar('unused'),['true',null],'no callers, no fill');
  await row('owner').click();
  assert.deepEqual(await page.locator('[data-api-detail="owner"] .api-detail-path .api-path-param').allTextContents(),['{ownerId}']);
  assert.deepEqual(await page.locator('[data-api-detail="owner"] .is-self .api-path-param').allTextContents(),['{ownerId}']);
  assert.equal(await page.locator('[data-api-detail="owner"] [data-api-section="chain"]').getAttribute('aria-label'),'呼叫鏈：1 個畫面 → DELETE /api/owners/{ownerId} → 找不到處理程式');
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});

test('R32 the persona page shows every reached screen against every persona',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser);
  await page.click('.page-tab[data-page="personas"]');await page.waitForSelector('[data-persona-page]');
  const table=page.locator('[data-persona-section="coverage"]');
  assert.deepEqual(await table.locator('thead button').allTextContents(),['訪客','會員']);
  assert.deepEqual(await table.locator('tbody tr').evaluateAll(rows=>rows.map(r=>[r.dataset.coverageScreen,...[...r.querySelectorAll('.persona-coverage-dot')].map(d=>d.dataset.reach+(d.tagName==='BUTTON'?'':'-'))])),
   [['a','REACHABLE','REACHABLE'],['b','EXCLUDED-','POSSIBLE']]);
  assert.equal(await table.locator('tbody tr[data-coverage-screen="b"] button').getAttribute('aria-label'),'乙，會員：可能走到');
  assert.equal(await table.locator('tbody tr[data-coverage-screen="b"] span.persona-coverage-dot').getAttribute('aria-label'),'訪客：不適用');
  const selected=()=>table.locator('.is-selected').evaluateAll(list=>[...new Set(list.map(e=>e.dataset.coveragePersona))]);
  assert.deepEqual(await selected(),['visitor']);
  await table.locator('thead button[data-coverage-persona="member"]').click();
  assert.equal(await page.locator('[data-persona-row="member"]').getAttribute('aria-selected'),'true');
  assert.deepEqual(await selected(),['member']);
  await table.locator('tbody tr[data-coverage-screen="b"] button').click();
  await page.waitForFunction(()=>!document.querySelector('[data-persona-page]'));
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});

test('R32 a report with one persona has no coverage table',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage();const d=data();d.graph.application.personas.pop();
  await page.goto(await fileFixture(d));await page.waitForSelector('[data-ready="true"]');
  await page.click('.page-tab[data-page="personas"]');await page.waitForSelector('[data-persona-page]');
  assert.equal(await page.locator('[data-persona-section="coverage"]').count(),0);
 }finally{await browser.close();}
});
