import {openScreen} from './decision-controls.mjs';
import test from 'node:test';
import {reviewExportMenuItem} from './review-export.mjs';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';
import {node} from './fixture.mjs';

test('R14 home owns progress while More preserves auto-advance and review shortcuts',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  assert.ok(await page.locator('.dashboard-progress-track').count());
  assert.ok(await page.locator('.dashboard-region').count()>0);
  await page.locator('.topbar-more>summary').click();
  assert.equal(await page.getByRole('checkbox',{name:'標記後自動前進'}).isChecked(),true);
  await page.locator('.topbar-more>summary').click();
  await page.locator('.primary-tabs button').nth(1).click();
  const current=page.locator('[data-review-queue-screen][aria-current=page]');await current.waitFor();const first=await current.getAttribute('data-review-queue-screen');
  await page.keyboard.press('x');
  assert.notEqual(await page.locator('[data-review-queue-screen][aria-current=page]').getAttribute('data-review-queue-screen'),first);
  await page.locator('.topbar-more>summary').click();
  await page.getByRole('checkbox',{name:'標記後自動前進'}).uncheck();
  await page.locator('.topbar-more>summary').click();
  await page.locator('.primary-tabs button').nth(1).click();
  const after=await page.locator('[data-review-queue-screen][aria-current=page]').getAttribute('data-review-queue-screen');
  await page.keyboard.press('n');
  assert.notEqual(await page.locator('[data-review-queue-screen][aria-current=page]').getAttribute('data-review-queue-screen'),after);
  await page.locator('.topbar-more>summary').click();
  assert.equal(await page.getByRole('checkbox',{name:'標記後自動前進'}).isChecked(),false);
 }finally{await browser.close();}
});

test('R14 removes the floating confirmation dashboard without hiding home progress',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  assert.ok(await page.locator('.dashboard-progress-track').isVisible());
  assert.equal(await page.locator('[data-review-progress],.review-progress-panel').count(),0);
  await page.locator('.primary-tabs button').nth(1).click();
  assert.equal(await page.locator('[data-review-queue]').count(),1);
 }finally{await browser.close();}
});

test('R14 screen rationale keeps the assumed REMOVE impact beside the decision',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  await page.locator('.primary-tabs button').nth(1).click();await page.locator('[data-review-queue-screen="a"]').click();
  await page.locator('.preview[aria-busy="false"]').waitFor();
  await page.locator('.screen-review-screen-decision [role="radio"][data-decision="REMOVE"]').click();
  const impact=page.locator('.hypothetical-remove-impact');await impact.waitFor({state:'visible'});
  assert.match(await impact.innerText(),/如果移除/);
  assert.ok(await page.locator('.screen-review-screen-decision').isVisible());
 }finally{await browser.close();}
});

test('WP37 remove impact shows known inbound links, newly removable APIs, component count and conflicts',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  const data=simulationFixture();data.graph.nodes.push(node('back','COMPONENT','返回甲',{kind:'LINK'}));data.graph.relationships.push({id:'owner-back',type:'CONTAINS',from:'b',to:'back'},{id:'back-to-a',type:'NAVIGATES_TO',from:'back',to:'a'});data.documents.b='<html><body><a id="back">返回甲</a></body></html>';data.preview.elements.push({graphScreenId:'b',path:'#back',tag:'a',text:'返回甲',graphComponentId:'back',componentResolution:'CONFIRMED',bounds:{x:0,y:0,width:40,height:20},styleId:'red'});
  const url=await fileFixture(data);await page.goto(url);
  await page.evaluate(()=>localStorage.setItem('screentrace:review:v1:%E6%B8%AC%E8%A9%A6%E6%87%89%E7%94%A8:'+('a'.repeat(64)),JSON.stringify({format:'screentrace-review',version:1,schemaVersion:'2.2',application:'測試應用',fingerprint:'a'.repeat(64),screenDecisions:{},componentDecisions:{b:{back:'KEEP'}}})));
  await page.reload();
  await openScreen(page,'a');await page.locator('.preview[aria-busy="false"]').waitFor();
  await page.locator('.prototype-toolbar [role="radio"][data-decision="REMOVE"]').click();
  const impact=page.locator('.decision-impact');
  assert.ok(await impact.isVisible());assert.match(await impact.innerText(),/導向此畫面的其他按鈕／畫面/);
  assert.match(await impact.innerText(),/移除後可移除的 API/);assert.match(await impact.innerText(),/隨畫面移除的元件/);
  assert.match(await impact.innerText(),/乙.*返回甲/);assert.match(await impact.innerText(),/既有衝突/);
  assert.match(await impact.innerText(),/依已知關聯；靜態分析可能看不到外部或動態呼叫/);
 }finally{await browser.close();}
});

test('WP49 delivery checklist summarizes decisions without changing the downloaded Markdown',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  await page.evaluate(()=>localStorage.setItem('screentrace:review:v1:%E6%B8%AC%E8%A9%A6%E6%87%89%E7%94%A8:'+('a'.repeat(64)),JSON.stringify({format:'screentrace-review',version:1,schemaVersion:'2.2',application:'測試應用',fingerprint:'a'.repeat(64),screenDecisions:{b:'REMOVE'},componentDecisions:{a:{shared:'KEEP'}}})));
  await page.reload();const readDownload=async(pending)=>{const item=await pending;const fs=await import('node:fs/promises');return(await fs.readFile(await item.path(),'utf8')).replace(/^generated_at: .*$/m,'generated_at: "TIME"');};
  const exportDirect=async()=>{const pending=page.waitForEvent('download');await (await reviewExportMenuItem(page)).click();return readDownload(pending);};const baseline=await exportDirect();await page.locator('.primary-tabs button').nth(5).click();const delivery=page.locator('[data-delivery]');await delivery.waitFor();assert.equal(await delivery.locator('[data-delivery-stat="REMOVE"] strong').innerText(),'1');assert.equal(await delivery.locator('[data-delivery-stat="KEEP"] strong').innerText(),'1');assert.equal(await delivery.locator('[data-delivery-stat="UNDECIDED"] strong').innerText(),'8');assert.match(await delivery.innerText(),/決策衝突 · 1/);assert.match(await delivery.innerText(),/共用按鈕/);assert.match(await delivery.innerText(),/換電腦|清除瀏覽器資料/);assert.equal(await page.locator('dialog.pre-export-check').count(),0);assert.equal(await exportDirect(),baseline,'delivery checklist inspection does not alter Markdown bytes');
 }finally{await browser.close();}
});

test('WP37 next-undecided reports when every review target is confirmed',async()=>{
 const browser=await chromium.launch();
 try{
  const data=simulationFixture();data.graph.nodes=data.graph.nodes.filter(item=>item.id==='a');data.graph.relationships=[];data.graph.behaviors=[];data.graph.apiContracts=[];data.graph.validationRules=[];data.preview.screens=data.preview.screens.filter(item=>item.graphScreenId==='a');data.preview.elements=[];data.documents={a:'<html><body>甲</body></html>'};
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);await page.goto(await fileFixture(data));
  await page.evaluate(()=>localStorage.setItem('screentrace:review:v1:%E6%B8%AC%E8%A9%A6%E6%87%89%E7%94%A8:'+('a'.repeat(64)),JSON.stringify({format:'screentrace-review',version:1,schemaVersion:'2.2',application:'測試應用',fingerprint:'a'.repeat(64),screenDecisions:{a:'KEEP'},componentDecisions:{}})));
  await page.reload();await page.locator('.primary-tabs button').nth(1).click();await page.keyboard.press('n');assert.equal(await page.locator('.workflow-status').innerText(),'全部畫面已確認');
 }finally{await browser.close();}
});
