import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('WP46 screen review follows the three-column design structure and retains only reachable controls',async()=>{
 const data=fixture();data.graph.nodes.push(
  node('api-rest','ENDPOINT','REST API',{path:'/api/owners',method:'GET',category:'REST_API'}),
  node('screen-route','ENDPOINT','畫面路由',{path:'/owners',method:'GET',category:'MVC_SCREEN'})
 );data.graph.relationships.push(
  {id:'call-rest',type:'CALLS',from:'shared',to:'api-rest',confidence:'CONFIRMED'},
  {id:'call-screen',type:'CALLS',from:'shared',to:'screen-route',confidence:'CONFIRMED'}
 );
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(1).click();
  const queue=page.locator('[data-review-queue]');await queue.waitFor();
  assert.equal(await page.locator('.screen-review-queue-filters button').count(),3);
  assert.equal(await page.locator('.screen-review-queue-filters input').count(),0);
  assert.equal(await page.locator('.screen-review-queue .segmented').count(),0);
  assert.equal(await page.locator('.screen-review-queue .search-box').count(),0);
  assert.doesNotMatch(await page.locator('.screen-review-queue').innerText(),/\/owners|\/legacy/);
  assert.match(await page.locator('.screen-review-queue').innerText(),/待確認清單/);
  assert.ok(await page.locator('.screen-review-queue').evaluate(el=>el.getBoundingClientRect().width>=260&&el.getBoundingClientRect().width<=300));
  assert.equal(await page.locator('main h1').count(),1);
  assert.match(await page.locator('.screen-review-rationale > h2').innerText(),/判斷依據/);
  assert.equal(await page.locator('.screen-review-technical[open]').count(),0);
  assert.equal(await page.locator('.prototype-toolbar [data-decision],.prototype-toolbar [data-screen-decision]').count(),0);
  assert.doesNotMatch(await page.locator('.shell[data-page=screen]').innerText(),/未確認|檔案結構/);
  assert.doesNotMatch(await page.locator('.screen-review-rationale').innerText(),/GET \/owners/);
  await page.setViewportSize({width:1024,height:768});
  assert.ok(await page.locator('.topbar').evaluate(el=>el.scrollWidth<=el.clientWidth));
  assert.deepEqual((await page.locator('.primary-tabs button').allTextContents()).map(value=>value.trim()),['盤點首頁','逐頁確認','按鈕總表','功能地圖','API','交付清單']);
 }finally{await browser.close();}
});
