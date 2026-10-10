import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('inherited-only action is labeled as a template and excluded from suspicious unused APIs',async()=>{
 const data=fixture();data.graph.nodes.find(node=>node.id==='unused').attributes.inheritedTemplate='true';
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();
  assert.equal(await page.locator('[data-suspicious-card="找不到呼叫來源的 API"] [data-target-id="unused"]').count(),0);
  assert.equal(await page.locator('[data-suspicious-card="被繼承的設定樣板"] [data-target-id="unused"]').count(),1);
  await page.locator('.primary-tabs button').nth(4).click();await page.locator('.api-page').waitFor();
  assert.equal(await page.locator('[data-api-row="unused"] [data-api-status]').innerText(),'被繼承的設定樣板');
  await page.locator('[data-api-filter="UNREFERENCED"]').click();assert.equal(await page.locator('[data-api-row="unused"]').count(),0);
 }finally{await browser.close();}
});
