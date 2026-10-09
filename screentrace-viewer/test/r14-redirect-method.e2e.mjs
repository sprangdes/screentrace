import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('R14 API list translates REDIRECT and keeps the original method in its tooltip',async()=>{
 const data=fixture();
 data.graph.nodes.find(item=>item.id==='unused').attributes={path:'/api/redirect',method:'REDIRECT',category:'REST_API'};
 const browser=await chromium.launch();try{
  const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();
  await page.locator('.primary-tabs button').nth(4).click();await page.locator('.api-page').waitFor();
  const method=page.locator('[data-api-row="unused"] [data-method]');
  assert.equal(await method.innerText(),'轉址');
  assert.equal(await method.getAttribute('title'),'REDIRECT');
 }finally{await browser.close();}
});
