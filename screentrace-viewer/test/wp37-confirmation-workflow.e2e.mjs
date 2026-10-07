import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';
import {node} from './fixture.mjs';

test('WP37 dashboard groups progress by region and provides deterministic review jumps',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  await page.locator('[data-review-progress]').click();
  assert.match(await page.locator('[data-review-progress]').innerText(),/已確認 0／/);
  assert.ok(await page.locator('.review-dashboard-region').count()>0);
  assert.ok(await page.locator('.review-dashboard-region [data-review-jump]').count()>0);
  assert.equal(await page.getByRole('checkbox',{name:'標記後自動前進'}).isChecked(),true);
  await page.getByRole('button',{name:'下一個未確認',exact:true}).click();
  assert.equal(await page.locator('.focus-breadcrumb h2').innerText(),'甲');
  await page.keyboard.press('x');
  assert.equal(await page.locator('main').getAttribute('data-review-focus'),'a:amb');
  await page.keyboard.press('n');
  await page.locator('[data-review-progress]').click();
  assert.notEqual(await page.locator('[data-review-focus]').getAttribute('data-review-focus'),'a:shared');
  await page.getByRole('checkbox',{name:'標記後自動前進'}).uncheck();
  const field=page.frameLocator('iframe').locator('#name');await field.focus();await page.keyboard.press('k');
  const saved=await page.evaluate(()=>{const key=Object.keys(localStorage).find(value=>value.startsWith('screentrace:review:v1:'));return key?JSON.parse(localStorage.getItem(key)):undefined;});
  assert.notEqual(saved?.componentDecisions?.a?.api,'KEEP','keyboard marking does not fire inside input fields');
  await page.keyboard.press('k');
  assert.equal(await page.getByRole('checkbox',{name:'標記後自動前進'}).isChecked(),false);
 }finally{await browser.close();}
});

test('WP37 dashboard closes with real Escape and an outside mouse click',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  const dashboard=page.locator('.review-progress-panel');
  await page.locator('[data-review-progress]').click();assert.ok(await dashboard.isVisible());
  await page.keyboard.press('Escape');await dashboard.waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-review-progress]').getAttribute('aria-expanded'),'false');
  await page.locator('[data-review-progress]').click();assert.ok(await dashboard.isVisible());
  await page.mouse.click(120,28);await dashboard.waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-review-progress]').getAttribute('aria-expanded'),'false');
 }finally{await browser.close();}
});

test('WP37 docked dashboard leaves REMOVE impact visible without closing',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  await page.locator('.screen-card[data-screen="a"]').click();
  await page.locator('.preview[aria-busy="false"]').waitFor();
  await page.locator('[data-review-progress]').click();
  const dashboard=page.locator('.review-progress-panel');assert.ok(await dashboard.isVisible());
  await page.locator('[data-screen-review="a"] [role="radio"][data-decision="REMOVE"]').last().evaluate(button=>button.click());
  await page.locator('.decision-impact').waitFor({state:'visible'});
  assert.ok(await dashboard.isVisible(),'dashboard stays open after marking REMOVE');
  const [dashboardBox,impactBox]=await Promise.all([dashboard.boundingBox(),page.locator('.decision-impact').boundingBox()]);
  assert.ok(dashboardBox&&impactBox);
  assert.ok(dashboardBox.x+dashboardBox.width<=impactBox.x||impactBox.x+impactBox.width<=dashboardBox.x||dashboardBox.y+dashboardBox.height<=impactBox.y||impactBox.y+impactBox.height<=dashboardBox.y,'dashboard does not cover the right-side impact preview');
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
  await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();
  await page.locator('.prototype-toolbar [role="radio"][data-decision="REMOVE"]').click();
  const impact=page.locator('.decision-impact');
  assert.ok(await impact.isVisible());assert.match(await impact.innerText(),/導向此畫面的其他按鈕／畫面/);
  assert.match(await impact.innerText(),/移除後可移除的 API/);assert.match(await impact.innerText(),/隨畫面移除的元件/);
  assert.match(await impact.innerText(),/乙.*返回甲/);assert.match(await impact.innerText(),/既有衝突/);
  assert.match(await impact.innerText(),/依已知關聯；靜態分析可能看不到外部或動態呼叫/);
 }finally{await browser.close();}
});

test('WP37 export check summarizes decisions and keeps the downloaded Markdown unchanged',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  await page.evaluate(()=>localStorage.setItem('screentrace:review:v1:%E6%B8%AC%E8%A9%A6%E6%87%89%E7%94%A8:'+('a'.repeat(64)),JSON.stringify({format:'screentrace-review',version:1,schemaVersion:'2.2',application:'測試應用',fingerprint:'a'.repeat(64),screenDecisions:{b:'REMOVE'},componentDecisions:{a:{shared:'KEEP'}}})));
  await page.reload();
  const readDownload=async(pending)=>{const item=await pending;const fs=await import('node:fs/promises');return(await fs.readFile(await item.path(),'utf8')).replace(/^generated_at: .*$/m,'generated_at: "TIME"');};
  const exportChecked=async()=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'匯出 md',exact:true}).click();await page.locator('.pre-export-check').waitFor({state:'visible'});await page.getByRole('button',{name:'仍要匯出',exact:true}).click();return readDownload(pending);};
  const baseline=await exportChecked();
  await page.getByRole('button',{name:'匯出 md',exact:true}).click();
  const dialog=page.locator('.pre-export-check');assert.ok(await dialog.isVisible());
  assert.match(await dialog.innerText(),/畫面：保留 0 · 移除 1 · 未確認 2/);
  assert.match(await dialog.innerText(),/按鈕：/);assert.match(await dialog.innerText(),/仍有衝突：1 個/);assert.match(await dialog.innerText(),/乙/);assert.match(await dialog.innerText(),/共用按鈕/);assert.match(await dialog.innerText(),/換電腦|清除瀏覽器資料/);
  await page.getByRole('button',{name:'回去處理',exact:true}).click();assert.equal(await dialog.isVisible(),false);
  assert.equal(await exportChecked(),baseline,'the pre-export dialog does not alter Markdown bytes');
  const skipped=page.waitForEvent('download');await page.getByRole('button',{name:'匯出 md',exact:true}).click();await page.locator('.pre-export-check').waitFor({state:'visible'});await page.getByRole('button',{name:'不再顯示',exact:true}).click();await readDownload(skipped);
  const direct=page.waitForEvent('download');await page.getByRole('button',{name:'匯出 md',exact:true}).click();assert.equal(await readDownload(direct),baseline);
 }finally{await browser.close();}
});

test('WP37 next-undecided reports when every review target is confirmed',async()=>{
 const browser=await chromium.launch();
 try{
  const data=simulationFixture();data.graph.nodes=data.graph.nodes.filter(item=>item.id==='a');data.graph.relationships=[];data.graph.behaviors=[];data.graph.apiContracts=[];data.graph.validationRules=[];data.preview.screens=data.preview.screens.filter(item=>item.graphScreenId==='a');data.preview.elements=[];data.documents={a:'<html><body>甲</body></html>'};
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);await page.goto(await fileFixture(data));
  await page.evaluate(()=>localStorage.setItem('screentrace:review:v1:%E6%B8%AC%E8%A9%A6%E6%87%89%E7%94%A8:'+('a'.repeat(64)),JSON.stringify({format:'screentrace-review',version:1,schemaVersion:'2.2',application:'測試應用',fingerprint:'a'.repeat(64),screenDecisions:{a:'KEEP'},componentDecisions:{}})));
  await page.reload();await page.getByRole('button',{name:'下一個未確認',exact:true}).click();assert.equal(await page.locator('.workflow-status').innerText(),'全部已確認');
 }finally{await browser.close();}
});
