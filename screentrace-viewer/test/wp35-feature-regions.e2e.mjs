import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';

test('WP35 feature cards filter the map, show external region labels, restore all, and summarize screens',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage(),url=await fileFixture();await page.goto(url);await page.locator('#app[data-ready=true]').waitFor();await page.getByRole('button',{name:'功能',exact:true}).click();await page.getByLabel('功能區域分組依據').selectOption('url');
  const owners=page.locator('[data-feature-region="owners"]');await owners.waitFor();assert.match(await owners.innerText(),/畫面 1 個 · 按鈕 1 個 · 使用 API 0 個/);await owners.getByRole('button',{name:/只看/}).click();await page.locator('.screen-card[data-screen="a"]').waitFor();assert.equal(await page.locator('.screen-card').count(),1);assert.match(await page.locator('.external-region-tag').first().innerText(),/其他區域：Legacy/);await page.getByRole('button',{name:/顯示全部/}).click();assert.equal(await page.locator('.screen-card').count(),2);assert.match(await page.locator('.screen-summary-line').first().innerText(),/可前往 1 個畫面 · 1 個按鈕 · 呼叫 0 個 API · 屬於 Owners 區域/);await page.locator('.screen-summary-line [role=button]').filter({hasText:'呼叫 0 個 API'}).first().click();await page.locator('#detail-tab-button-1[aria-selected=true]').waitFor();await page.locator('.screen-summary-line [role=button]').filter({hasText:'1 個按鈕'}).first().click();await page.locator('#detail-tab-button-0[aria-selected=true]').waitFor();
 }finally{await browser.close();}
});
