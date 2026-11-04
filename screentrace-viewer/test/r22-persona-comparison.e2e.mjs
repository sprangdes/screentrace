import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fixture,fileFixture} from './fixture.mjs';
const source={file:'workspace:config.json',line:1};
// a: both personas; b: member only (possible, step 2); visitor never reaches b although it could see it.
function personaFixture(){
 const data=fixture();data.graph.schemaVersion='2.4';
 data.graph.application.personas=[
  {id:'visitor',name:'訪客',description:'尚未登入的訪客',facts:[{text:'user',truth:false,source}],startPaths:['/'],screens:{a:'APPLIES',b:'APPLIES'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1}],unreached:['b'],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'}],unevaluatedNavigations:0}},
  {id:'member',name:'會員',facts:[{text:'user',truth:true,source}],startPaths:['/'],screens:{a:'APPLIES',b:'UNKNOWN'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1},{screenId:'b',reach:'POSSIBLE',depth:2}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'},{from:'a',to:'b',kind:'NAVIGATE',behaviorId:'nav',status:'UNKNOWN'}],unevaluatedNavigations:1}}];
 return data;
}
const open=async(browser,data)=>{const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});const state={requests:0,errors:[]};page.on('request',r=>{if(/^https?:/.test(r.url()))state.requests++;});page.on('pageerror',e=>state.errors.push(String(e)));await page.goto(await fileFixture(data));await page.waitForSelector('[data-ready="true"]');await page.click('.page-tab[data-page="personas"]');await page.waitForSelector('[data-persona-page]');return {page,state};};

test('R22 the comparison groups screens by who reaches them, with step marks and screen thumbnails',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser,personaFixture());
  assert.deepEqual(await page.locator('[data-persona-section] .persona-section-label').allTextContents(),['所有角色共用','只有會員']);
  assert.deepEqual(await page.locator('[data-persona-section="member"] [data-persona-row]').evaluateAll(rows=>rows.map(r=>r.dataset.personaRow)),['b']);
  assert.equal(await page.locator('[data-persona-row="b"] td[data-persona="visitor"] .persona-step').textContent(),'×');
  assert.equal(await page.locator('[data-persona-row="b"] td[data-persona="visitor"] .persona-step').getAttribute('data-reach'),'UNREACHED');
  assert.equal(await page.locator('[data-persona-row="b"] td[data-persona="member"] .persona-step').getAttribute('data-reach'),'POSSIBLE');
  assert.deepEqual(await page.locator('.persona-legend-item').allTextContents(),['2會走到（第 2 步）','2可能走到（第 2 步）','×走不到','空白：不適用']);
  assert.equal(await page.locator('[data-persona-row] .persona-thumb').count(),2,'every row has a thumbnail or its placeholder');
  assert.equal(await page.locator('[data-persona-section="member"] .persona-section-toggle').getAttribute('aria-expanded'),'true');
  await page.locator('[data-persona-section="member"] .persona-section-toggle').click();
  assert.equal(await page.locator('[data-persona-row="b"]').isVisible(),false);
  assert.equal(await page.locator('[data-persona-section="member"] .persona-section-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('[data-persona-section="member"] .persona-section-count').textContent(),'1 個畫面');
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});

test('R22 a persona name opens its flow map, a screen opens it, and an unreached cell opens it with unreached screens shown',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser,personaFixture());
  await page.locator('[data-persona-flow="member"]').click();
  await page.waitForSelector('.canvas [data-persona-bar]');
  assert.equal(await page.locator('[data-persona-option="member"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.page-tab[data-page="screens"]').getAttribute('aria-current'),'page');

  await page.click('.page-tab[data-page="personas"]');await page.waitForSelector('[data-persona-page]');
  await page.locator('[data-persona-row="a"] .persona-screen').click();
  await page.waitForSelector('[data-screen-panel="a"]');
  assert.equal(await page.locator('[data-persona-option="member"]').getAttribute('aria-pressed'),'true','opening a screen keeps the chosen persona');

  await page.keyboard.press('Escape');
  await page.click('.page-tab[data-page="personas"]');await page.waitForSelector('[data-persona-page]');
  await page.locator('[data-persona-row="b"] td[data-persona="visitor"] .persona-step').click();
  await page.waitForSelector('[data-screen-panel="b"] [data-persona-status]');
  assert.equal(await page.locator('[data-persona-status]').textContent(),'角色「訪客」：走不到');
  assert.equal(await page.locator('[data-persona-show-all]').isChecked(),true,'the unreached screen is shown on the map');
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});
