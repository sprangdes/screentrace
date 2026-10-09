import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('WP46 inferred entry rationale shows the original URL template, source filename and line',async()=>{
 const data=fixture();const edge=data.graph.relationships.find(item=>item.id==='3');edge.confidence='INFERRED';edge.source={file:'src/main/webapp/WEB-INF/views/productInventory.jsp',line:66};edge.evidence=[{source:edge.source,parser:'RouteTemplateInference',resolution:'INFERRED',detail:'原始樣板=/admin/productInventory/viewProductInventory/${product.productId}；候選路由=[/admin/productInventory/viewProductInventory/{productId}]'}];
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.locator('.primary-tabs button').nth(1).click();await page.locator('[data-review-queue-screen="b"] .sidebar-screen').click();const evidence=page.locator('.screen-review-entry-evidence');assert.equal(await evidence.count(),1);assert.match(await evidence.innerText(),/\/admin\/productInventory\/viewProductInventory\/\$\{product\.productId\}/);assert.match(await evidence.innerText(),/productInventory\.jsp 第 66 行/);assert.doesNotMatch(await evidence.innerText(),/src\/main\/webapp|WEB-INF/);assert.equal(await evidence.evaluate(el=>getComputedStyle(el).fontFamily.includes('monospace')||getComputedStyle(el).fontFamily.includes('ui-monospace')),true);}finally{await browser.close();}
});
