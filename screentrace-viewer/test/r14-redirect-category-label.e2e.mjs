import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('R14 redirect-category rows show 轉址 and retain REDIRECT in the tooltip',async()=>{
 const data=fixture();data.graph.nodes.find(item=>item.id==='unused').attributes={path:'/api/redirect',method:'ANY',category:'REDIRECT'};
 const browser=await chromium.launch();try{
  const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();
  await page.locator('.primary-tabs button').nth(4).click();await page.locator('.api-page').waitFor();
  const category=page.locator('[data-api-row="unused"] [data-api-category]');
  assert.equal(await category.innerText(),'轉址');
  assert.equal(await category.getAttribute('title'),'REDIRECT');
 }finally{await browser.close();}
});
