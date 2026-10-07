import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('WP35 chooses one whole-project grouping basis and always shows progress',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage(),url=await fileFixture();await page.goto(url);await page.locator('#app[data-ready=true]').waitFor();await page.getByRole('button',{name:'功能',exact:true}).click();
  const basis=page.getByLabel('功能區域分組依據');assert.equal(await basis.inputValue(),'controller');const cards=page.locator('.feature-region-card');assert.ok(await cards.count()>0);for(const label of await page.locator('.feature-region-basis').allTextContents())assert.equal(label,'依控制器類別');assert.equal(await page.locator('.feature-region-progress').count(),await cards.count());
  await basis.selectOption('url');for(const label of await page.locator('.feature-region-basis').allTextContents())assert.equal(label,'依網址前段');assert.equal(await page.locator('.feature-region-progress').count(),await cards.count());
 }finally{await browser.close();}
});

test('WP36 buttons and APIs use the full workspace when no item is selected',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage(),url=await fileFixture();await page.goto(url);await page.locator('#app[data-ready=true]').waitFor();await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByRole('button',{name:'按鈕',exact:true}).click();
  assert.equal(await page.locator('.feature-region-card').count(),0);assert.equal(await page.locator('.shell>aside').isVisible(),false);assert.equal(await page.locator('.shell').getAttribute('data-right-panel-hidden'),'true');await page.getByRole('button',{name:'API',exact:true}).click();assert.equal(await page.locator('.shell>aside').isVisible(),false);assert.match(await page.locator('.shell').evaluate(el=>getComputedStyle(el).gridTemplateColumns),/^\d+(?:\.\d+)?px$/);
 }finally{await browser.close();}
});

test('WP36 rows show primary action and ordered outcomes, plus immediate three-state controls',async()=>{
 const payload=fixture();payload.graph.nodes.push(node('link','COMPONENT','記錄連結',{kind:'LINK'}),node('submit','COMPONENT','送出測試表單',{kind:'SUBMIT'}),node('target-z','SCREEN','Zulu',{route:'/z'}),node('target-a','SCREEN','Alpha',{route:'/a'}),node('route-z','ENDPOINT','POST /z-route',{path:'/z-route',httpMethod:'POST'}),node('route-a','ENDPOINT','POST /a-route',{path:'/a-route',httpMethod:'POST'}));payload.graph.relationships.push({id:'link-a',type:'NAVIGATES_TO',from:'link',to:'target-a',confidence:'CONFIRMED'},{id:'link-z',type:'NAVIGATES_TO',from:'link',to:'target-z',confidence:'CONFIRMED'},{id:'link-owner',type:'CONTAINS',from:'a',to:'link',confidence:'CONFIRMED'},{id:'submit-owner',type:'CONTAINS',from:'a',to:'submit',confidence:'CONFIRMED'},{id:'submit-a',type:'NAVIGATES_TO',from:'submit',to:'target-a',confidence:'CONFIRMED'},{id:'submit-z',type:'NAVIGATES_TO',from:'submit',to:'target-z',confidence:'CONFIRMED'},{id:'route-a-call',type:'CALLS',from:'submit',to:'route-a',confidence:'CONFIRMED'},{id:'route-z-call',type:'CALLS',from:'submit',to:'route-z',confidence:'CONFIRMED'});
 const browser=await chromium.launch();try{const page=await browser.newPage(),url=await fileFixture(payload);await page.goto(url);await page.locator('#app[data-ready=true]').waitFor();await page.getByRole('button',{name:'按鈕',exact:true}).click();
  const row=page.locator('.button-table tr[data-button-row]').filter({hasText:'記錄連結'});assert.ok(await row.count());assert.match(await row.innerText(),/前往「候選畫面」/);assert.match(await row.innerText(),/可能前往：Alpha、Zulu；有多個可能結果/);assert.doesNotMatch(await row.innerText(),/呼叫 API|送出到/);assert.equal(await row.locator('[data-quick-decision]').count(),3);assert.ok(await row.locator('.button-row-open').count());await row.getByRole('button',{name:'保留'}).click();assert.match(await row.innerText(),/保留/);
  const kindCell=page.locator('.button-table tr[data-button-row] td:nth-child(3)').first();assert.equal(await kindCell.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
  const status=page.locator('.button-table tr[data-button-row] td:nth-child(5)').first();assert.equal(await status.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');assert.equal(await page.locator('.sidebar-screens .feature-region-card').count(),0);
  const formRow=page.locator('.button-table tr[data-button-row]').filter({hasText:'送出測試表單'});assert.match(await formRow.innerText(),/送出表單[\s\S]*可能前往：Alpha、Zulu；有多個可能結果/);assert.equal(await formRow.locator('details.button-technical-details').evaluate(el=>el.open),false);
 }finally{await browser.close();}
});
