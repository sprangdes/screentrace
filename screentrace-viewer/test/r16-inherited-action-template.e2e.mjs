import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('inherited-only action counts as in use on the API page and is excluded from unused APIs',async()=>{
 const data=fixture();Object.assign(data.graph.nodes.find(node=>node.id==='unused').attributes,{category:'REST_API',inheritedTemplate:'true'});
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();
  await page.locator('.page-tab[data-page="api"]').click();await page.locator('.api-page').waitFor();
  assert.equal(await page.locator('[data-api-row="unused"]').getAttribute('data-api-status'),'IN_USE');
  await page.locator('[data-api-row="unused"] .api-summary').click();
  assert.match(await page.locator('[data-api-row="unused"] .api-note').innerText(),/被繼承的設定樣板/);
  await page.locator('[data-api-filter="UNREFERENCED"]').click();assert.equal(await page.locator('[data-api-row="unused"]').count(),0);
 }finally{await browser.close();}
});
