import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('R14 dashboard uses the full design canvas and shows its progress card',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(fixture()));await page.locator('#app[data-ready=true]').waitFor();
  await page.getByRole('button',{name:'略過'}).click();
  await page.locator('.primary-tabs button').filter({hasText:'盤點首頁'}).click();
  assert.equal(await page.locator('.shell>nav').isVisible(),false);
  assert.equal(await page.locator('.shell>aside').isVisible(),false);
  assert.ok(await page.locator('.dashboard-progress').count());
  assert.equal(await page.getByRole('button',{name:'從第一項開始確認 →'}).count(),1);
  assert.ok((await page.locator('.dashboard-region-summary').count())>0,'region cards show their computed entry-class counts');
  assert.ok((await page.locator('.inventory-dashboard h1').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))>=36);
  assert.ok((await page.locator('.inventory-dashboard').evaluate(el=>el.getBoundingClientRect().width))>=1300);
  await page.locator('.primary-tabs button').filter({hasText:'逐頁確認'}).click();
  const row=page.locator('[data-review-queue-screen]').first();
  const label=row.locator('.sidebar-screen');
  assert.ok((await label.evaluate(el=>el.getBoundingClientRect().width))>=180);
  assert.equal(await row.getByRole('radiogroup').count(),0,'decision controls belong in the workspace, not the queue');
  await row.click();
  assert.equal(await page.locator('aside .screen-review-screen-decision [role=radiogroup]').count(),1,'screen decision belongs in the right column');
  assert.equal(await page.locator('main .screen-review-actions').count(),1,'component decisions belong below the complete preview');
  assert.equal(await page.locator('aside .screen-review-actions').count(),0);
  assert.match(await page.locator('.preview-notice').innerText(),/示意畫面：資料為範例值/);
 }finally{await browser.close()}
});
