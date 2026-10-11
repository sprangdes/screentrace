import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';

/** WP26 simulation fixture plus a second trigger whose destination is unknown. */
function focusFixture(){
 const data=simulationFixture();
 data.graph.behaviors.push({id:'lost',triggerId:'unknown',type:'NAVIGATE',event:'click',evidence:[{parser:'Fixture',resolution:'UNRESOLVED',source:{file:'web/a.jsp',line:1}}]});
 return data;
}
async function open(reducedMotion='reduce'){
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion}),file=await fileFixture(focusFixture()),requests=[];
 page.setDefaultTimeout(5000);
 page.on('request',request=>{const url=request.url();if(url!==file&&!/^(data|blob|about):/.test(url))requests.push(url);});
 await page.goto(file);await page.locator('#app[data-ready="true"]').waitFor();
 await page.waitForFunction(()=>document.querySelector('.canvas')?.dataset.fitted==='true');
 return {browser,page,requests};
}
const focused=page=>page.locator('.canvas').getAttribute('data-focused');
const ready=page=>page.locator('.focus-layer:not([hidden]) .preview[aria-busy="false"]').waitFor();

test('R17 WP62 clicking a card zooms the same canvas into it and keeps only its outgoing lines in their original directions',async()=>{
 const {browser,page,requests}=await open();
 try{
  const overviewTargets=(await page.locator('.relation-line[data-from="a"]').evaluateAll(lines=>lines.map(l=>l.dataset.to))).sort();
  const centers=await page.locator('.screen-card').evaluateAll(cards=>Object.fromEntries(cards.map(c=>[c.dataset.screen,{x:c.offsetLeft+c.offsetWidth/2,y:c.offsetTop+c.offsetHeight/2}])));
  const before=await page.locator('.world').evaluate(w=>w.style.transform);
  await page.locator('.screen-card[data-screen="a"]').click();await ready(page);
  assert.equal(await page.locator('.canvas').getAttribute('data-mode'),'focus');assert.equal(await focused(page),'a');
  assert.deepEqual(await page.locator('.screen-card:not([data-screen="a"])').evaluateAll(cards=>cards.every(c=>c.classList.contains('is-dim'))),true);
  const focusTargets=(await page.locator('.focus-line-hit[data-kind="known"],.focus-line-hit[data-kind="loop"]').evaluateAll(lines=>lines.map(l=>l.dataset.to))).sort();
  assert.deepEqual(focusTargets,overviewTargets);
  const known=await page.locator('.focus-line-hit[data-kind="known"]').evaluateAll(lines=>lines.map(l=>{const a=l.getPointAtLength(0),b=l.getPointAtLength(l.getTotalLength());return {to:l.dataset.to,angle:Math.atan2(b.y-a.y,b.x-a.x)};}));
  assert.ok(known.length>0);
  for(const line of known){const from=centers.a,to=centers[line.to],expected=Math.atan2(to.y-from.y,to.x-from.x),diff=Math.abs(Math.atan2(Math.sin(line.angle-expected),Math.cos(line.angle-expected)))*180/Math.PI;assert.ok(diff<=15,`${line.to} differs ${diff}°`);}
  assert.equal(await page.locator('.focus-line-hit[data-kind="unresolved"]').count(),2);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.mode==='overview');
  await page.waitForFunction(t=>document.querySelector('.world').style.transform===t,before);
  assert.equal(await page.locator('.screen-card.is-dim').count(),0);
  assert.deepEqual(requests,[]);
 }finally{await browser.close();}
});

test('R17 WP62 hovering a line shows the destination thumbnail and its trigger; clicking moves the focus; unresolved stubs do not navigate',async()=>{
 const {browser,page}=await open();
 try{
  await page.locator('.screen-list [data-screen-list="a"]').click();await ready(page);
  const line=page.locator('.focus-line-hit[data-kind="known"][data-to="b"]');
  await line.focus();
  const tip=page.locator('.focus-tooltip[data-to="b"]');
  assert.equal(await tip.isVisible(),true);assert.match(await tip.innerText(),/乙/);
  assert.equal(await page.frameLocator('iframe').locator('[data-line-trigger]').count()>0,true);
  await line.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.focused==='b');await ready(page);
  assert.equal(await page.locator('[data-screen-panel="b"]').count(),1);
  await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.focused==='a');await ready(page);
  const stub=page.locator('.focus-line-hit[data-kind="unresolved"]').first();
  await stub.focus();assert.match(await page.locator('.focus-tooltip:not([hidden])').innerText(),/無法確定前往哪個畫面/);
  await stub.press('Enter');assert.equal(await focused(page),'a');
 }finally{await browser.close();}
});

test('R17 WP62 n zooms to the next unconfirmed screen and the transition settles after the animation',async()=>{
 const {browser,page}=await open('no-preference');
 try{
  await page.locator('.screen-card[data-screen="a"]').click();
  assert.equal(await page.locator('.focus-layer').isHidden(),true,'preview appears after the zoom animation');
  await ready(page);
  await page.locator('.panel-header [data-decision="KEEP"]').click();
  await page.locator('body').click({position:{x:5,y:5}});
  await page.keyboard.press('n');
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.focused!=='a');
  const next=await focused(page);
  assert.notEqual(next,'a');await ready(page);
  assert.equal(await page.locator(`[data-screen-panel="${next}"]`).count(),1);
 }finally{await browser.close();}
});

test('R17 WP63 clicks act like the real page: links navigate, forms submit without validation, ambiguous results offer destinations',async()=>{
 const {browser,page}=await open();
 try{
  await page.locator('.screen-card[data-screen="a"]').click();await ready(page);
  const control=id=>page.frameLocator('iframe').locator(`#${id}`);
  await control('go').click();
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.focused==='b');await ready(page);
  await page.keyboard.press('Alt+ArrowLeft');await page.waitForFunction(()=>document.querySelector('.canvas').dataset.focused==='a');await ready(page);
  assert.equal(await control('name').inputValue(),'');
  await control('submit').click();
  const picker=page.locator('.simulation-picker');
  assert.equal(await picker.isVisible(),true);
  assert.deepEqual((await picker.locator('.simulation-choice').evaluateAll(b=>b.map(x=>x.dataset.target))).sort(),['b','c']);
  assert.doesNotMatch(await page.locator('.prototype-viewer').innerText(),/檢核|必填|請確認姓名/);
  await picker.locator('.simulation-choice[data-target="c"]').click();
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.focused==='c');
 }finally{await browser.close();}
});

test('R17 WP62 zooming in collapses the screen list into a rail on its own edge; the rail and its collapse button control it',async()=>{
 const {browser,page}=await open();
 try{
  const body=page.locator('.sidebar-body'),rail=page.locator('.sidebar-rail');
  assert.equal(await body.isVisible(),true);assert.equal(await rail.isVisible(),false);
  assert.equal(await page.locator('.prototype-toolbar .list-toggle').count(),0);
  await page.locator('.screen-card[data-screen="a"]').click();await ready(page);
  assert.equal(await body.isVisible(),false);assert.equal(await rail.isVisible(),true);
  assert.match(await rail.innerText(),/畫面清單/);
  const before=await page.locator('.focus-layer').evaluate(l=>l.offsetWidth);
  await rail.click();
  assert.equal(await body.isVisible(),true);
  await page.waitForFunction(width=>document.querySelector('.focus-layer').offsetWidth<width,before);
  await page.getByRole('button',{name:'收起畫面清單'}).click();
  assert.equal(await body.isVisible(),false);
  await page.locator('body').click({position:{x:600,y:20}});await page.keyboard.press('/');
  assert.equal(await body.isVisible(),true);
  await page.getByRole('searchbox',{name:'搜尋 URL 或畫面名稱'}).press('Escape');
  assert.equal(await page.locator('.canvas').getAttribute('data-mode'),'focus');
  await page.locator('.prototype-back').click();
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.mode==='overview');
  assert.equal(await body.isVisible(),true);
  await page.getByRole('button',{name:'收起畫面清單'}).click();
  await page.locator('.screen-card[data-screen="a"]').click();await ready(page);
  await page.locator('.prototype-back').click();
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.mode==='overview');
  assert.equal(await body.isVisible(),false,'a list collapsed on the overview stays collapsed after returning');
 }finally{await browser.close();}
});
