import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('WP45 starts on the six-page inventory dashboard and first tab clicks switch content immediately',async()=>{
 const data=fixture();data.graph.diagnostics=[{code:'CONTEXT_PATH_HINT',message:'可能缺少 context path：候選前綴=/sample；可解析的呼叫數=2；來源=src/app.js:4、src/app.js:9；設定方式：./bin/screentrace config',evidence:[]}];
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(await fileFixture(data));await page.locator('#app[data-ready=true]').waitFor();
  const tabs=page.getByRole('tab');assert.equal(await tabs.count(),6);assert.deepEqual(await tabs.allTextContents(),['盤點首頁','逐頁確認','按鈕總表','功能地圖','API','交付清單']);assert.equal(await tabs.nth(0).getAttribute('aria-current'),'page');
  assert.match(await page.locator('[data-page="dashboard"]').innerText(),/這個系統有哪些功能還在用？/);assert.match(await page.locator('[data-context-path-reminder]').innerText(),/有 2 個呼叫因為網址前綴無法確認.*設定 context path.*重新分析/);assert.equal(await page.locator('aside').isVisible(),false);
  for(const [i,pageName,selector]of [[1,'逐頁確認','[data-page="screen"]'],[2,'按鈕總表','[data-page="buttons"]'],[3,'功能地圖','[data-page="screen"]'],[4,'API','[data-page="api"]'],[5,'交付清單','[data-page="delivery"]']]){await tabs.nth(i).click();await page.locator(selector).waitFor();assert.equal(await tabs.nth(i).getAttribute('aria-current'),'page',pageName);}
  assert.match(await page.locator('.first-run-progress').innerText(),/1／3/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }finally{await browser.close();}
});
