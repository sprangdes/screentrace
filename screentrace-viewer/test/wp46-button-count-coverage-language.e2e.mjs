import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';

test('WP46 button section uses markable counts and moves coverage detail out of the summary',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture());await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(1).click();await page.locator('[data-review-queue-screen="a"] .sidebar-screen').click();const section=page.locator('main .screen-review-actions'),rows=section.locator('.screen-review-action');await rows.first().waitFor();const count=await rows.count();assert.equal(await section.locator('h3').first().innerText(),`這頁的按鈕 · ${count} 個`);assert.equal(await section.locator('.screen-review-coverage').innerText(),'沒標記的按鈕跟著畫面：畫面移除時一起移除，畫面保留時視為保留。');assert.doesNotMatch(await section.innerText(),/這頁有 \d+ 個按鈕|無法確認/);const technical=page.locator('.screen-review-technical');await technical.locator('summary').click();assert.match(await technical.innerText(),/這頁有 \d+ 個按鈕/);}finally{await browser.close();}
});
