import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';

test('WP35 feature cards filter the map, show external region labels, restore all, and summarize screens',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage(),url=await fileFixture();await page.goto(url);await page.locator('#app[data-ready=true]').waitFor();await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByLabel('功能區域分組依據').selectOption('url');
  const owners=page.locator('[data-feature-region="owners"]');await owners.waitFor();assert.match(await owners.innerText(),/畫面 1 個 · 按鈕 1 個 · 使用 API 0 個/);assert.match(await owners.locator('.screen-summary-line').innerText(),/可前往 1 個畫面 · 1 個按鈕 · 使用 0 個 API · 屬於 Owners 區域/);await owners.getByRole('button',{name:/只看/}).click();await page.locator('.screen-card[data-screen="a"]').waitFor();assert.equal(await page.locator('.screen-card').count(),1);assert.match(await page.locator('.external-region-tag').first().innerText(),/其他區域：Legacy/);await page.getByRole('button',{name:/顯示全部/}).click();assert.equal(await page.locator('.screen-card').count(),2);await page.locator('.screen-card[data-screen="a"]').click();const summary=page.locator('.prototype-viewer .focus-breadcrumb+.screen-summary-line');await summary.waitFor();assert.match(await summary.innerText(),/可前往 1 個畫面 · 1 個按鈕 · 呼叫 0 個 API · 屬於 Owners 區域/);await summary.locator('[role=button]').filter({hasText:'呼叫 0 個 API'}).click();await page.locator('#detail-tab-button-1[aria-selected=true]').waitFor();await summary.locator('[role=button]').filter({hasText:'1 個按鈕'}).click();await page.locator('#detail-tab-button-0[aria-selected=true]').waitFor();
 }finally{await browser.close();}
});

test('JSP directory cards name root screens and screens without JSP files explicitly',async()=>{
 const data=await import('./fixture.mjs').then(({fixture})=>fixture());
 data.graph.nodes.find(n=>n.id==='a').source={file:'src/main/webapp/WEB-INF/views/home.jsp',line:1};
 data.graph.nodes.find(n=>n.id==='b').source=undefined;
 delete data.graph.nodes.find(n=>n.id==='b').attributes.view;
 const browser=await chromium.launch();try{const page=await browser.newPage();await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByLabel('功能區域分組依據').selectOption('jsp-directory');
  const home=page.locator('[data-feature-region="首頁與其他"]');await home.waitFor();assert.equal(await page.locator('[data-feature-region="Jsp"]').count(),0);assert.match(await home.innerText(),/甲.*\/owners/);assert.match(await home.innerText(),/乙.*無對應 JSP 檔/);assert.equal(await home.locator('[data-region-screen]').count(),2);
 }finally{await browser.close();}
});
