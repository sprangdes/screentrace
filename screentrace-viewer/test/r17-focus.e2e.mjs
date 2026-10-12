import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';
import {showList} from './decision-controls.mjs';

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
  assert.equal(await page.locator('.focus-layer').evaluate(l=>l.hidden||l.classList.contains('is-entering')),true,'the preview fades in over the end of the zoom animation');
  await page.waitForFunction(()=>!document.querySelector('.focus-layer').classList.contains('is-entering'));
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

test('R17 WP62 zooming in folds the screen list into a rail; opening it there floats over the canvas and closes after use',async()=>{
 const {browser,page}=await open();
 try{
  const shell=page.locator('.shell'),body=page.locator('.sidebar-body'),rail=page.locator('.sidebar-rail');
  const expand=page.getByRole('button',{name:'展開畫面清單'}),collapse=page.getByRole('button',{name:'收起畫面清單'});
  assert.equal(await body.isVisible(),true);assert.equal(await rail.isVisible(),false);
  assert.equal(await page.locator('.prototype-toolbar .list-toggle').count(),0);
  await page.locator('.screen-card[data-screen="a"]').click();await ready(page);
  assert.equal(await body.isVisible(),false);assert.equal(await rail.isVisible(),true);
  assert.equal(await rail.innerText(),'','the rail holds icon buttons only');
  const toggleSpot=async button=>button.evaluate(b=>{const r=b.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top)];});
  const railSpot=await toggleSpot(expand);
  const before=await page.locator('.focus-layer').evaluate(l=>l.offsetWidth);
  await expand.click();
  assert.equal(await shell.getAttribute('data-sidebar'),'overlay');assert.equal(await body.isVisible(),true);
  assert.deepEqual(await toggleSpot(collapse),railSpot,'the toggle stays in the same spot');
  assert.equal(await page.locator('.focus-layer').evaluate(l=>l.offsetWidth),before,'the floating list does not shrink the preview');
  await page.keyboard.press('Escape');
  assert.equal(await body.isVisible(),false);assert.equal(await page.locator('.canvas').getAttribute('data-mode'),'focus','Esc closes the list before leaving the screen');
  await expand.click();await page.locator('.details-panel').click({position:{x:20,y:400}});
  assert.equal(await body.isVisible(),false,'a click outside closes the floating list');
  await page.getByRole('button',{name:'搜尋畫面'}).click();
  assert.equal(await body.isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'搜尋 URL 或畫面名稱');
  await page.locator('.screen-list [data-screen-list="b"]').click();await ready(page);
  assert.equal(await body.isVisible(),false,'picking a screen closes the floating list');
  await page.locator('body').click({position:{x:600,y:20}});await page.keyboard.press('/');
  assert.equal(await body.isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await body.isVisible(),false);
  await page.locator('.prototype-back').click();
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.mode==='overview');
  assert.equal(await shell.getAttribute('data-sidebar'),'expanded');
  assert.deepEqual(await toggleSpot(collapse),railSpot,'the docked toggle uses the same spot');
  await collapse.click();
  await page.locator('.screen-card[data-screen="a"]').click();await ready(page);
  await page.locator('.prototype-back').click();
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.mode==='overview');
  assert.equal(await body.isVisible(),false,'a list collapsed on the overview stays collapsed after returning');
 }finally{await browser.close();}
});

test('R17 the screen details appear only while a screen is open, fold into a rail on their own edge and keep that choice across screens',async()=>{
 const {browser,page}=await open();
 try{
  const shell=page.locator('.shell'),details=page.locator('.details-panel'),hint=page.locator('.canvas-hint');
  const expand=page.getByRole('button',{name:'展開畫面資訊'}),collapse=page.getByRole('button',{name:'收起畫面資訊'});
  const spot=async button=>button.evaluate(b=>{const r=b.getBoundingClientRect();return [Math.round(r.right),Math.round(r.top)];});
  assert.equal(await shell.getAttribute('data-details'),'hidden');assert.equal(await details.isVisible(),false);
  assert.match(await hint.innerText(),/點選畫面開始確認/);
  await page.locator('.screen-card[data-screen="a"]').click();await ready(page);
  assert.equal(await shell.getAttribute('data-details'),'open');assert.equal(await hint.isVisible(),false);
  assert.equal(await page.locator('.details-panel [data-screen-panel="a"]').isVisible(),true);
  const openSpot=await spot(collapse),before=await page.locator('.focus-layer').evaluate(l=>l.offsetWidth);
  await collapse.click();
  assert.equal(await shell.getAttribute('data-details'),'collapsed');
  assert.deepEqual(await spot(expand),openSpot,'the toggle stays in the same spot');
  await page.waitForFunction(width=>document.querySelector('.focus-layer').offsetWidth>width,before);
  await page.locator('.canvas').focus();await page.keyboard.press('k');
  assert.equal(await page.locator('.screen-list [data-screen-list="a"]').getAttribute('data-decision'),'KEEP','shortcuts still mark while folded');
  await showList(page);await page.locator('.screen-list [data-screen-list="b"]').click();await ready(page);
  assert.equal(await shell.getAttribute('data-details'),'collapsed','the folded choice holds across screens');
  await expand.click();
  assert.equal(await shell.getAttribute('data-details'),'open');assert.equal(await page.locator('.details-panel [data-screen-panel="b"]').isVisible(),true);
  await collapse.click();
  await page.locator('.prototype-back').click();
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.mode==='overview');
  assert.equal(await shell.getAttribute('data-details'),'hidden');assert.equal(await hint.isVisible(),true);
  await page.locator('.screen-card[data-screen="a"]').click();await ready(page);
  assert.equal(await shell.getAttribute('data-details'),'open','returning to the canvas resets the choice');
 }finally{await browser.close();}
});
