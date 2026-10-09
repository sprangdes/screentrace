import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('WP45 keeps delivery and export available while removing old confirmation toolbar controls',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture(fixture()));await page.locator('#app[data-ready=true]').waitFor();
  assert.equal(await page.locator('[data-review-progress],.next-undecided').count(),0);
  assert.match(await page.locator('[data-delivery-progress]').innerText(),/交付清單 · 已決定/);
  const menu=page.locator('.topbar-more');await menu.locator(':scope > summary').click();
  const entries=await menu.locator('[role=menuitem]').allTextContents();assert.match(entries[0],/匯出 md/);assert.match(entries[1],/匯入 md/);
  await page.locator('.primary-tabs button').nth(1).click();
  await page.locator('[data-review-queue-screen]').first().click();
  const current=await page.locator('[data-review-queue-screen][aria-current=page]').getAttribute('data-review-queue-screen');await page.keyboard.press('n');
  assert.notEqual(await page.locator('[data-review-queue-screen][aria-current=page]').getAttribute('data-review-queue-screen'),current);
 }finally{await browser.close();}
});
