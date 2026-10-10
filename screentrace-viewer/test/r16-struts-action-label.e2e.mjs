import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';import {fileFixture,fixture,node} from './fixture.mjs';

test('Struts ACTION endpoints use the readable Struts action category label',async()=>{
 const data=fixture();data.graph.nodes.push(node('struts-action','ENDPOINT','任何方法 /accounts/update',{path:'/accounts/update',httpMethod:'ANY',category:'ACTION'}));
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.getByRole('button',{name:'API',exact:true}).click();await page.locator('[data-endpoint-group="ALL"]').click();assert.equal(await page.locator('[data-api-row="struts-action"] .api-category').innerText(),'Struts 動作');}finally{await browser.close();}
});
