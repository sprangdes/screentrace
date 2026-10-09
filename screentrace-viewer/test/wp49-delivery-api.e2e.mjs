import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';
import {mdFixture} from './md-fixture.mjs';

test('WP49 API separates inferred usage and front-end requests from backend API totals',async()=>{
 const data=mdFixture();data.graph.nodes.find(item=>item.id==='ep').attributes.category='REST_API';data.graph.nodes.find(item=>item.id==='unused').attributes.category='REST_API';data.graph.nodes.push(node('frontend','ENDPOINT','前端請求',{path:'/rest/items/{?}',httpMethod:'POST',origin:'javascript-request',category:'UNCLASSIFIED'}),node('login-screen','SCREEN','登入頁',{route:'/login',autoRedirect:'LOGIN_PAGE'}),node('login','ENDPOINT','登入路由',{path:'/login',category:'MVC_SCREEN'}));data.graph.relationships.push({id:'inferred-call',type:'CALLS',from:'shared',to:'ep',confidence:'INFERRED',evidence:[{source:{file:'web/a.jsp',line:2},parser:'Fixture',resolution:'INFERRED'}]});data.graph.diagnostics=[{code:'CONTEXT_PATH_HINT',message:'候選前綴=/sample；可解析的呼叫數=1；來源=app.js:8；設定方式：./bin/screentrace config',evidence:[{source:{file:'app.js',line:8}}]}];
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(4).click();await page.locator('.api-page').waitFor();
  assert.ok(await page.locator('[data-api-filter="INFERRED_USAGE"]').count());assert.equal(await page.locator('[data-frontend-requests] [data-frontend-request]').count(),1);assert.doesNotMatch(await page.locator('.api-category-filters').innerText(),/前端請求/);
  await page.locator('[data-api-filter="INFERRED_USAGE"]').click();assert.equal(await page.locator('.api-row').count(),1);assert.match(await page.locator('.api-row').innerText(),/推定使用中/);
  await page.locator('[data-api-filter="ALL"]').click();await page.locator('[data-endpoint-group="SCREEN"]').click();assert.match(await page.locator('[data-api-row="login"]').innerText(),/系統自動導向/);assert.doesNotMatch(await page.locator('[data-api-row="login"]').innerText(),/找不到呼叫來源/);
 }finally{await browser.close();}
});

test('WP49 delivery checklist replaces the export modal and humanizes every displayed name',async()=>{
 const data=mdFixture();data.graph.nodes.find(item=>item.id==='a').name='WEB-INF/views/firstPage.html';
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(1).click();await page.locator('.screen-review-screen-decision [data-screen-decision="REMOVE"]').click();await page.locator('.primary-tabs button').nth(5).click();await page.locator('[data-page="delivery"]').waitFor();
  const delivery=page.locator('[data-delivery]');assert.match(await delivery.innerText(),/移除/);assert.doesNotMatch(await delivery.innerText(),/未確認|firstPage\.html|WEB-INF/);assert.match(await delivery.innerText(),/First Page/);assert.ok(await delivery.locator('[data-delivery-undecided]').count());assert.ok(await delivery.locator('[data-delivery-conflicts]').count());
  const download=page.waitForEvent('download');await delivery.getByRole('button',{name:'給 AI 的指示檔（md）'}).click();assert.equal((await download).suggestedFilename(),'screentrace-review.md');assert.equal(await page.locator('dialog.pre-export-check[open]').count(),0);
 }finally{await browser.close();}
});
