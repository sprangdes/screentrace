import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fixture,fileFixture} from './fixture.mjs';
const source={file:'workspace:config.json',line:1};
function personaFixture(){
 const data=fixture();data.graph.schemaVersion='2.4';
 data.graph.application.personas=[
  {id:'visitor',name:'訪客',facts:[{text:'user',truth:false,source}],startPaths:['/'],screens:{a:'APPLIES',b:'EXCLUDED'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'}],unevaluatedNavigations:0}},
  {id:'member',name:'會員',facts:[{text:'user',truth:true,source}],startPaths:['/'],screens:{a:'APPLIES',b:'UNKNOWN'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1},{screenId:'b',reach:'POSSIBLE',depth:2}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'},{from:'a',to:'b',kind:'NAVIGATE',behaviorId:'nav',status:'UNKNOWN'}],unevaluatedNavigations:1}}];
 return data;
}
const open=async(browser,data)=>{const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});const state={requests:0,errors:[]};page.on('request',r=>{if(/^https?:/.test(r.url()))state.requests++;});page.on('pageerror',e=>state.errors.push(String(e)));await page.goto(await fileFixture(data));await page.waitForSelector('[data-ready="true"]');await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');return {page,state};};
const line=(page,from,to)=>page.locator(`.relations .relation-line[data-from="${from}"][data-to="${to}"]`).first();

test('R20 a report without personas shows no persona controls',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser,fixture());
  assert.equal(await page.locator('[data-persona-select]').count(),0);
  assert.equal(await page.locator('.page-tab[data-page="personas"]').count(),0);
  assert.equal(await page.locator('.persona-badge,[data-persona-reach],.relation-line[data-persona]').count(),0);
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});

test('R20 choosing a persona shows its flow in the list, on the map and on the open screen',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser,personaFixture());
  assert.deepEqual(await page.locator('[data-persona-select] option').allTextContents(),['不套用角色','訪客','會員']);
  await page.selectOption('[data-persona-select]','member');
  assert.equal(await page.locator('.screen-card[data-screen="a"]').getAttribute('data-persona-reach'),'REACHABLE');
  assert.equal(await page.locator('.screen-card[data-screen="b"]').getAttribute('data-persona-reach'),'POSSIBLE');
  assert.equal(await page.locator('.screen-card[data-screen="a"] .persona-badge').textContent(),'確定可達 · 第 1 步');
  assert.equal(await line(page,'a','b').getAttribute('data-persona'),'UNKNOWN');
  assert.match(await page.locator('[data-persona-summary="member"]').textContent(),/user：是.*確定可達 1 · 可能可達 1 · 未到達 0 · 不適用 0.*有 1 個導覽的條件無法判定/s);
  assert.deepEqual(await page.locator('[data-persona-group]').evaluateAll(nodes=>nodes.map(n=>n.dataset.personaGroup)),['step-1','step-2']);
  assert.deepEqual(await page.locator('[data-persona-group="step-2"] .screen-row').evaluateAll(nodes=>nodes.map(n=>n.dataset.screenList)),['b']);

  await page.selectOption('[data-persona-select]','visitor');
  assert.equal(await page.locator('.screen-card[data-screen="b"]').getAttribute('data-persona-reach'),'EXCLUDED');
  assert.equal(await line(page,'a','b').getAttribute('data-persona'),'OFF');
  assert.equal(await page.locator('details[data-persona-group="excluded"] summary').textContent(),'不適用 1');

  await page.locator('.screen-card[data-screen="a"]').dblclick();
  assert.equal(await page.locator('[data-screen-panel="a"] [data-persona-status]').textContent(),'角色「訪客」：確定可達 · 第 1 步');
  assert.equal(await page.locator('[data-persona-status]').getAttribute('data-persona-status'),'REACHABLE');

  await page.keyboard.press('Escape');
  await page.selectOption('[data-persona-select]','');
  assert.equal(await page.locator('.persona-badge,[data-persona-reach],[data-persona-summary]').count(),0);
  assert.equal(await line(page,'a','b').getAttribute('data-persona'),null);
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});

test('R20 the persona page compares every screen across personas and opens a screen as that persona',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser,personaFixture());
  await page.locator('.page-tab[data-page="personas"]').click();
  await page.waitForSelector('[data-persona-page]');
  assert.deepEqual(await page.locator('.persona-table thead th').allTextContents(),['畫面','訪客','會員']);
  assert.equal(await page.locator('[data-persona-row="b"] .persona-cell[data-persona="visitor"]').textContent(),'不適用');
  assert.equal(await page.locator('[data-persona-row="b"] .persona-cell[data-persona="member"]').textContent(),'可能可達 · 第 2 步');
  assert.match(await page.locator('[data-persona-facts="member"]').textContent(),/會員.*user：是.*1 個導覽的條件無法判定/s);
  await page.locator('[data-persona-row="b"] .persona-cell[data-persona="member"]').click();
  await page.waitForSelector('[data-screen-panel="b"] [data-persona-status]');
  assert.equal(await page.locator('[data-persona-select]').inputValue(),'member');
  assert.equal(await page.locator('[data-persona-status]').textContent(),'角色「會員」：可能可達 · 第 2 步');
  assert.equal(await page.locator('.page-tab[data-page="screens"]').getAttribute('aria-current'),'page');
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});
