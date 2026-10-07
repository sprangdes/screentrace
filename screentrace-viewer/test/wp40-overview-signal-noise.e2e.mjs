import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';

test('overview cards keep summaries and decision tools out of the resting view',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await page.goto(await fileFixture(simulationFixture()));
  const card=page.locator('.screen-card[data-screen="a"]');
  assert.doesNotMatch(await card.innerText(),/可前往|個按鈕|呼叫 .*API|保留|移除|未確認/);
  assert.equal(await card.locator('.screen-summary-line').count(),0);
  const controls=page.locator('.card-review[data-screen-controls="a"]');
  assert.equal(await controls.locator('[role="radio"]').count(),3);
  assert.equal(await controls.evaluate(el=>getComputedStyle(el).opacity),'0');
  await card.hover();
  assert.equal(await controls.evaluate(el=>getComputedStyle(el).opacity),'1');
  assert.equal(await controls.getByRole('radio',{name:'保留'}).count(),1);
  await page.mouse.move(1390,850);
  card.focus();
  assert.equal(await controls.evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.keyboard.press('Tab');
  assert.equal(await controls.evaluate(el=>el.contains(document.activeElement)),true);
  await controls.getByRole('radio',{name:'保留'}).click();
  assert.equal(await card.getAttribute('data-screen-status'),'KEEP');
  assert.equal(await card.locator('[data-screen-status]').count(),0);
  assert.equal(await card.locator('.review-status-icon[aria-label="保留"]').count(),1);
 }finally{await browser.close();}
});

test('overview uses semantic zoom while retaining readable screen names',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await page.goto(await fileFixture(simulationFixture()));
  const card=page.locator('.screen-card[data-screen="a"]');
  const route=card.locator('.screen-route');
  assert.equal(await route.count(),1);
  for(let i=0;i<12;i++){
   const zoom=await page.locator('.world').evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
   if(zoom<.7)break;
   await page.getByRole('button',{name:'縮小'}).click();
  }
  const zoom=await page.locator('.world').evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  assert.ok(zoom<.7,`expected compact zoom, got ${zoom}`);
  assert.equal(await page.locator('.canvas').getAttribute('data-semantic-zoom'),'compact');
  assert.equal(await card.locator('strong').innerText(),'甲');
  assert.ok((await card.locator('strong').evaluate(el=>el.getBoundingClientRect().height))>=14);
  assert.equal(await route.evaluate(el=>getComputedStyle(el).display),'none');
  await card.hover();
  assert.notEqual(await route.evaluate(el=>getComputedStyle(el).display),'none');
 }finally{await browser.close();}
});

test('screen summary lives under the focused title and in feature cards only',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await page.goto(await fileFixture(simulationFixture()));
  assert.equal(await page.locator('.screen-card .screen-summary-line').count(),0);
  await page.locator('.screen-card[data-screen="a"]').click();
  await page.locator('.prototype-viewer .focus-breadcrumb+.screen-summary-line').waitFor();
  const focusSummary=page.locator('.prototype-viewer .focus-breadcrumb+.screen-summary-line');
  assert.match(await focusSummary.innerText(),/個畫面.*個按鈕/s);
  assert.equal(await focusSummary.evaluate(el=>getComputedStyle(el).maxHeight),'none');
  assert.equal(await focusSummary.evaluate(el=>el.scrollHeight<=el.clientHeight),true);
  await page.getByRole('button',{name:'地圖',exact:true}).click();
  await page.getByRole('button',{name:'功能',exact:true}).click();
  const regionSummary=page.locator('.feature-region-card .screen-summary-line').first();
  assert.ok(await regionSummary.count()>0);
  assert.equal(await regionSummary.evaluate(el=>getComputedStyle(el).maxHeight),'none');
  assert.equal(await regionSummary.evaluate(el=>el.scrollHeight<=el.clientHeight),true);
 }finally{await browser.close();}
});
