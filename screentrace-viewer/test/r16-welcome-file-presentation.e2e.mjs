import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('R16 welcome-file entry is presented as the system default homepage, not a missing caller',async()=>{
 const data=fixture();
 data.graph.nodes.push(node('welcome-file','ENDPOINT','GET /',{path:'/',httpMethod:'GET',category:'MVC_SCREEN',entryBasis:'STATIC_URL',entrySource:'系統預設首頁（web.xml welcome-file）',welcomeFile:'index.jsp'}));
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();
  assert.match(await page.locator('.dashboard-suspicion').innerText(),/系統預設首頁/);
  await page.locator('.primary-tabs button').nth(4).click();await page.locator('.api-page').waitFor();await page.locator('[data-endpoint-group="SCREEN"]').click();
  const welcome=page.locator('[data-api-row="welcome-file"]');assert.match(await welcome.innerText(),/系統預設首頁/);assert.doesNotMatch(await welcome.innerText(),/找不到呼叫來源/);
  await page.locator('[data-api-filter="UNREFERENCED"]').click();assert.equal(await page.locator('[data-api-row="welcome-file"]').count(),0);
 }finally{await browser.close();}
});
