import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';

test('WP46 review queue is visible after the screen sidebar was collapsed on home',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(3000);await page.goto(await fileFixture());await page.locator('#app[data-ready=true]').waitFor();await page.getByRole('button',{name:'功能地圖'}).click();await page.getByRole('button',{name:'收合畫面清單'}).click();assert.equal(await page.locator('.shell').getAttribute('data-sidebar-collapsed'),'true');await page.locator('.primary-tabs button').nth(0).click();await page.locator('.primary-tabs button').nth(1).click();const queue=page.locator('section.screen-review-queue');await queue.waitFor({state:'attached'});assert.equal(await queue.isVisible(),true);const box=await queue.boundingBox();assert.ok(box&&box.width>=260);assert.ok(await queue.locator('[data-review-queue-screen]').count()>0);}finally{await browser.close();}
});
