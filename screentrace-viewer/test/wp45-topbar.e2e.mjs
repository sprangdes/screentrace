import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';
import {mdFixture} from './md-fixture.mjs';
import {reviewExportMenuItem} from './review-export.mjs';

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

test('WP45 export moved into More still completes the download flow',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(mdFixture()));const pending=page.waitForEvent('download',{timeout:5000});await (await reviewExportMenuItem(page)).click();await page.getByRole('button',{name:'仍要匯出',exact:true}).click();const download=await pending;assert.equal(download.suggestedFilename(),'screentrace-review.md');}finally{await browser.close();}
});

test('WP45 import feedback remains visible after More closes',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(mdFixture()));const pending=page.waitForEvent('download');await (await reviewExportMenuItem(page)).click();await page.getByRole('button',{name:'仍要匯出',exact:true}).click();const download=await pending;const {readFile}=await import('node:fs/promises');const md=await readFile(await download.path());await page.reload();const menu=page.locator('.topbar-more');await menu.locator(':scope > summary').click();await page.getByLabel('匯入 md',{exact:true}).setInputFiles({name:'review.md',mimeType:'text/markdown',buffer:md});await page.locator('[data-md-status]').filter({hasText:'匯入完成'}).waitFor({state:'visible'});await menu.locator(':scope > summary').click();assert.equal(await menu.evaluate(el=>el.open),false);assert.ok(await page.locator('[data-md-status]').isVisible());}finally{await browser.close();}
});
