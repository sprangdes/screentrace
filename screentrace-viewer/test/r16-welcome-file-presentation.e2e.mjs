import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('R16 welcome-file entry is a screen URL, never listed as an unused API',async()=>{
 const data=fixture();
 data.graph.nodes.push(node('welcome-file','ENDPOINT','GET /',{path:'/',httpMethod:'GET',category:'MVC_SCREEN',entryBasis:'STATIC_URL',entrySource:'系統預設首頁（web.xml welcome-file）',welcomeFile:'index.jsp'}));
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();
  await page.locator('.page-tab[data-page="api"]').click();await page.locator('.api-page').waitFor();
  assert.equal(await page.locator('[data-api-row="welcome-file"]').count(),0);
  await page.locator('[data-api-filter="ATTENTION"]').click();assert.equal(await page.locator('[data-api-row="welcome-file"]').count(),0);
 }finally{await browser.close();}
});
