import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';

test('WP47 labels decision reasons according to the selected outcome',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture());await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(1).click();const screen=page.locator('[data-review-queue-screen]').first();await screen.click();await page.locator('[data-screen-decision="REMOVE"]').click();assert.equal(await page.locator('.decision-note-editor label').first().innerText(),'移除原因');await page.locator('[data-screen-decision="KEEP"]').click();assert.equal(await page.locator('.decision-note-editor label').first().innerText(),'保留原因');}finally{await browser.close();}
});
