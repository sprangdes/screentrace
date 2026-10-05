import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture,node} from './fixture.mjs';

test('WP35 chooses one whole-project grouping basis and hides progress when review is off',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage(),url=await fileFixture();await page.goto(url);await page.locator('#app[data-ready=true]').waitFor();await page.getByRole('button',{name:'功能',exact:true}).click();
  const basis=page.getByLabel('功能區域分組依據');assert.equal(await basis.inputValue(),'jsp-directory');assert.ok(await page.locator('.feature-region-card').count()===1);for(const label of await page.locator('.feature-region-basis').allTextContents())assert.equal(label,'依 JSP 目錄');assert.equal(await page.locator('.feature-region-progress').count(),0);
  await basis.selectOption('url');for(const label of await page.locator('.feature-region-basis').allTextContents())assert.equal(label,'依網址前段');assert.equal(await page.locator('.feature-region-progress').count(),0);
 }finally{await browser.close();}
});

test('WP36 buttons and APIs use the full workspace when no item is selected',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage(),url=await fileFixture();await page.goto(url);await page.locator('#app[data-ready=true]').waitFor();await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByRole('button',{name:'按鈕',exact:true}).click();
  assert.equal(await page.locator('.feature-region-card').count(),0);assert.equal(await page.locator('.shell>aside').isVisible(),false);assert.equal(await page.locator('.shell').getAttribute('data-right-panel-hidden'),'true');await page.getByRole('button',{name:'API',exact:true}).click();assert.equal(await page.locator('.shell>aside').isVisible(),false);assert.equal(await page.locator('.api-page').evaluate(el=>el.getBoundingClientRect().width),await page.locator('.shell>main').evaluate(el=>el.getBoundingClientRect().width));
 }finally{await browser.close();}
});

test('WP36 rows show primary action and ordered outcomes, plus immediate three-state controls',async()=>{
 const payload=fixture();payload.graph.nodes.push(node('link','COMPONENT','記錄連結',{kind:'LINK'}),node('target-z','SCREEN','Zulu',{route:'/z'}),node('target-a','SCREEN','Alpha',{route:'/a'}));payload.graph.relationships.push({id:'link-a',type:'NAVIGATES_TO',from:'link',to:'target-a',confidence:'CONFIRMED'},{id:'link-z',type:'NAVIGATES_TO',from:'link',to:'target-z',confidence:'CONFIRMED'},{id:'link-owner',type:'CONTAINS',from:'a',to:'link',confidence:'CONFIRMED'});
 const browser=await chromium.launch();try{const page=await browser.newPage(),url=await fileFixture(payload);await page.goto(url);await page.locator('#app[data-ready=true]').waitFor();await page.getByRole('checkbox',{name:'確認模式',exact:true}).check();await page.getByRole('button',{name:'按鈕',exact:true}).click();
  const row=page.locator('.button-table tr[data-button-row]').filter({hasText:'記錄連結'});assert.ok(await row.count());assert.match(await row.innerText(),/前往「候選畫面」/);assert.match(await row.innerText(),/可能前往：Alpha、Zulu；有多個可能結果/);assert.doesNotMatch(await row.innerText(),/呼叫 API|送出到/);assert.equal(await row.locator('.button-row-actions button').count(),3);await row.getByRole('button',{name:'保留'}).click();assert.match(await row.innerText(),/保留/);
  const kindCell=page.locator('.button-table tr[data-button-row] td:nth-child(3)').first();assert.equal(await kindCell.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
 }finally{await browser.close();}
});
