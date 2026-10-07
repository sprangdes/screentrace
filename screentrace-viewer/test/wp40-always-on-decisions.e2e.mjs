import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,node} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';

test('WP40 decisions stay available without a mode and synchronize across overview and focused viewer',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  assert.equal(await page.getByRole('checkbox',{name:'確認模式',exact:true}).count(),0);
  assert.match(await page.locator('[data-review-progress]').innerText(),/已確認/);
  const undecided=page.locator('.screen-card[data-screen="a"]');
  assert.equal(await undecided.locator('[data-screen-status]').count(),0);
  await undecided.hover();
  await page.locator('.card-review[data-screen-controls="a"] [data-decision="KEEP"]').click();
  assert.equal(await undecided.getAttribute('data-screen-status'),'KEEP');
  await undecided.click();
  await page.locator('.preview[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.prototype-toolbar [role="radiogroup"] [data-decision="KEEP"]').count(),1);
  await page.locator('.prototype-toolbar [role="radio"][data-decision="KEEP"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.prototype-toolbar [role="radio"][data-decision="REMOVE"]').getAttribute('aria-pressed'),'true');
  await page.keyboard.press('x');
  assert.equal(await page.locator('.prototype-toolbar [role="radio"][data-decision="REMOVE"]').getAttribute('aria-pressed'),'true');
  await page.frameLocator('iframe').locator('#name').focus();
  await page.keyboard.press('k');
  assert.equal(await page.locator('.prototype-toolbar [role="radio"][data-decision="REMOVE"]').getAttribute('aria-pressed'),'true');
  await page.locator('.prototype-toolbar [role="radio"][data-decision="UNDECIDED"]').click();
  assert.equal(await page.locator('.prototype-toolbar [role="radio"][data-decision="UNDECIDED"]').getAttribute('aria-pressed'),'true');
 }finally{await browser.close();}
});

test('submit click keeps the clicked button selected and includes its owning form summary',async()=>{
 const data=simulationFixture();
 data.documents.a=data.documents.a.replace('id="submit">送出','id="submit">Find Owner');
 data.graph.nodes.push(node('findbutton','COMPONENT','Find Owner',{kind:'BUTTON',tag:'button',type:'submit'}));
 data.graph.relationships.push({id:'owner-findbutton',type:'CONTAINS',from:'a',to:'findbutton'});
 data.preview.elements.push({graphScreenId:'a',path:'#submit',tag:'button',text:'Find Owner',graphComponentId:'findbutton',componentResolution:'CONFIRMED',bounds:{x:1,y:1,width:100,height:30},styleId:'red'});
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});
  page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(data));
  await page.locator('[data-screen-list="a"]').click();
  await page.locator('.preview[aria-busy="false"]').waitFor();
  await page.frameLocator('iframe').locator('#name').fill('A');
  await page.frameLocator('iframe').locator('#submit').click();
  assert.match(await page.locator('[data-detail-tab="0"]').innerText(),/標籤：Find Owner/);
  assert.match(await page.locator('[data-detail-tab="0"]').innerText(),/所屬表單/);
  assert.equal(await page.frameLocator('iframe').locator('#submit').getAttribute('data-prototype-selected'),'true');
 }finally{await browser.close();}
});

test('WP40 list, button table, feature progress and touch long-press expose the same decisions',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',hasTouch:true,isMobile:true});
  page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  await page.locator('[data-review-progress]').click();
  assert.match(await page.locator('.review-progress-panel').innerText(),/畫面：保留 0 · 移除 0 · 未確認 3/);
  assert.equal(await page.locator('.review-help>summary[aria-label="標記說明"]').count(),1);
  await page.locator('.screen-card[data-screen="a"]').dispatchEvent('pointerdown',{pointerType:'touch',button:0});
  await page.waitForFunction(()=>document.querySelector('.card-review[data-screen-controls="a"]')?.classList.contains('touch-revealed'),{timeout:1500});
  await page.locator('.screen-card[data-screen="a"]').dispatchEvent('pointerup',{pointerType:'touch',button:0});
  await page.locator('.card-review[data-screen-controls="a"] [data-decision="REMOVE"]').click();
  assert.equal(await page.locator('.screen-card[data-screen="a"]').getAttribute('data-screen-status'),'REMOVE');
  await page.getByRole('button',{name:'功能',exact:true}).click();
  assert.ok(await page.locator('.feature-region-progress').count()>0);
  await page.getByRole('button',{name:'按鈕',exact:true}).click();
  const quick=page.locator('.button-quick-decisions [data-quick-decision="KEEP"]').first();
  await quick.click();
  assert.equal(await page.locator('.button-quick-decisions [data-quick-decision="KEEP"]').first().getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'畫面',exact:true}).click();
  const sidebar=page.locator('.sidebar-screen-row').filter({has:page.locator('[data-screen-list="a"]')});
  await sidebar.locator('[role="radio"][data-decision="KEEP"]').click();
  await page.getByRole('button',{name:'地圖',exact:true}).click();
  assert.equal(await page.locator('.screen-card[data-screen="a"]').getAttribute('data-screen-status'),'KEEP');
 }finally{await browser.close();}
});
