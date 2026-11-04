import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fixture,fileFixture} from './fixture.mjs';
const source={file:'workspace:config.json',line:1};
function personaFixture(){
 const data=fixture();data.graph.schemaVersion='2.4';
 data.graph.application.personas=[
  {id:'visitor',name:'訪客',description:'尚未登入的訪客',facts:[{text:'user',truth:false,source}],startPaths:['/'],screens:{a:'APPLIES',b:'EXCLUDED'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'}],unevaluatedNavigations:0}},
  {id:'member',name:'會員',facts:[{text:'user',truth:true,source}],startPaths:['/'],screens:{a:'APPLIES',b:'UNKNOWN'},navigations:[],flow:{entryPoints:['entry:root'],reached:[{screenId:'a',reach:'REACHABLE',depth:1},{screenId:'b',reach:'POSSIBLE',depth:2}],unreached:[],steps:[{from:'entry:root',to:'a',kind:'RENDERS',behaviorId:null,status:'APPLIES'},{from:'a',to:'b',kind:'NAVIGATE',behaviorId:'nav',status:'UNKNOWN'}],unevaluatedNavigations:1}},
  {id:'locked',name:'停權',facts:[{text:'locked',truth:true,source}],startPaths:['/'],screens:{a:'EXCLUDED',b:'EXCLUDED'},navigations:[],flow:{entryPoints:[],reached:[],unreached:[],steps:[],unevaluatedNavigations:0}}];
 return data;
}
const open=async(browser,data)=>{const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});const state={requests:0,errors:[]};page.on('request',r=>{if(/^https?:/.test(r.url()))state.requests++;});page.on('pageerror',e=>state.errors.push(String(e)));await page.goto(await fileFixture(data));await page.waitForSelector('[data-ready="true"]');await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');return {page,state};};
const shownGroups=page=>page.locator('.screen-group').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>n.dataset.group));
const box=async(page,id)=>page.locator(`.screen-card[data-screen="${id}"]`).boundingBox();

test('R21 the persona bar sits on the map and turns it into the persona flow, one column per step',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser,personaFixture());
  assert.equal(await page.locator('.canvas [data-persona-bar]').count(),1);
  assert.equal(await page.locator('.sidebar [data-persona-option],.sidebar select').count(),0,'the role switch is no longer in the list');
  assert.equal(await page.locator('.persona-info').isVisible(),false);
  await page.locator('[data-persona-option="member"]').click();
  await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');
  assert.deepEqual(await shownGroups(page),['step-1','step-2']);
  const a=await box(page,'a'),b=await box(page,'b');assert.ok(a.x+a.width<b.x,'step 2 sits right of step 1');
  assert.match(await page.locator('[data-persona-description="member"]').textContent(),/會員依 1 個條件判定/);
  assert.deepEqual(await page.locator('.persona-key').allTextContents(),['會走到 1','可能走到 1']);
  assert.match(await page.locator('.persona-info').textContent(),/1 個導覽的條件程式無法判定/);
  assert.equal(await page.locator('[data-persona-show-all]').isVisible(),false,'nothing to reveal when every screen is on the flow');

  await page.locator('[data-persona-option="visitor"]').click();
  assert.match(await page.locator('[data-persona-description="visitor"]').textContent(),/訪客尚未登入的訪客/);
  assert.deepEqual(await shownGroups(page),['step-1']);
  assert.equal(await page.locator('.screen-card[data-screen="b"]').isVisible(),false);
  await page.locator('[data-persona-show-all]').check();
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.personaShowAll),'true','the checkbox keeps focus');
  assert.deepEqual(await shownGroups(page),['step-1','excluded']);
  assert.equal(await page.locator('.screen-card[data-screen="b"]').isVisible(),true);
  assert.equal(await page.locator('.screen-card[data-screen="b"] .persona-badge').textContent(),'不適用');

  await page.locator('[data-persona-option="locked"]').click();
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.personaOption),'locked','the persona button keeps focus');
  assert.match(await page.locator('.persona-info').textContent(),/走不到任何畫面/);
  assert.equal(await page.locator('[data-persona-show-all]').isChecked(),false,'switching persona hides unreached screens again');

  await page.locator('[data-persona-option=""]').click();
  assert.equal(await page.locator('.screen-group').count(),0,'the small fixture map has no areas without a persona');
  assert.equal(await page.locator('.screen-card:visible').count(),2);
  assert.equal(await page.locator('.persona-info').isVisible(),false);
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});

test('R21 opening a screen hides the bar and coming back keeps the persona flow',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser,personaFixture());
  await page.locator('[data-persona-option="member"]').click();
  await page.locator('.screen-card[data-screen="b"]').dblclick();
  await page.waitForSelector('[data-screen-panel="b"]');
  assert.equal(await page.locator('[data-persona-bar]').isVisible(),false);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.mode==='overview');
  assert.equal(await page.locator('[data-persona-bar]').isVisible(),true);
  assert.deepEqual(await shownGroups(page),['step-1','step-2']);
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});

test('R21 the persona page shows each persona description in the list',async()=>{
 const browser=await chromium.launch();try{
  const {page,state}=await open(browser,personaFixture());
  await page.locator('.page-tab[data-page="personas"]').click();
  await page.waitForSelector('[data-persona-page]');
  assert.deepEqual(await page.locator('.persona-row').allTextContents(),['訪客尚未登入的訪客會走到 1 · 可能走到 0','會員依 1 個條件判定會走到 1 · 可能走到 1','停權依 1 個條件判定會走到 0 · 可能走到 0']);
  await page.locator('[data-persona-row="locked"]').click();
  assert.match(await page.locator('[data-persona-detail="locked"] [data-persona-section="flow"]').textContent(),/走不到任何畫面/);
  assert.deepEqual(state.errors,[]);assert.equal(state.requests,0);
 }finally{await browser.close();}
});
