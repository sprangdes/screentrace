import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('R15 WP51 API list translates method and every known category while retaining source values in tooltips',async()=>{
 const data=fixture();
 data.graph.nodes.find(item=>item.id==='ep').attributes={path:'/rest/items',method:'GET',category:'REST_API'};
 data.graph.nodes.find(item=>item.id==='unused').attributes={path:'/legacy/redirect',method:'ANY',category:'REDIRECT'};
 data.graph.nodes.push(node('screen-route','ENDPOINT','Screen route',{path:'/screen',method:'GET',category:'MVC_SCREEN'}));
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(4).click();await page.locator('.api-page').waitFor();await page.locator('[data-endpoint-group="ALL"]').click();
  const api=page.locator('.api-page');
  assert.doesNotMatch(await api.innerText(),/REDIRECT|REST_API|MVC_SCREEN/);
  const redirect=page.locator('[data-api-row="unused"]');
  assert.equal(await redirect.locator('[data-method]').innerText(),'任何方法');
  assert.equal(await redirect.locator('[data-method]').getAttribute('title'),'ANY');
  assert.equal(await redirect.locator('[data-api-category]').innerText(),'轉址');
  assert.equal(await redirect.locator('[data-api-category]').getAttribute('title'),'REDIRECT');
  const rest=page.locator('[data-api-row="ep"] [data-api-category]');assert.equal(await rest.innerText(),'API');assert.equal(await rest.getAttribute('title'),'REST_API');
  const screen=page.locator('[data-api-row="screen-route"] [data-api-category]');assert.equal(await screen.innerText(),'畫面網址');assert.equal(await screen.getAttribute('title'),'MVC_SCREEN');
 }finally{await browser.close();}
});
