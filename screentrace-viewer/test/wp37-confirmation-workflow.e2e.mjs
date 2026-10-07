import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {simulationFixture} from './wp26-fixture.mjs';

test('WP37 dashboard groups progress by region and provides deterministic review jumps',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  await page.locator('[data-review-progress]').click();
  assert.match(await page.locator('[data-review-progress]').innerText(),/已確認 0／/);
  assert.ok(await page.locator('.review-dashboard-region').count()>0);
  assert.ok(await page.locator('.review-dashboard-region [data-review-jump]').count()>0);
  assert.equal(await page.getByRole('checkbox',{name:'標記後自動前進'}).isChecked(),true);
  await page.getByRole('button',{name:'下一個未確認',exact:true}).click();
  assert.equal(await page.locator('.focus-breadcrumb h2').innerText(),'甲');
  await page.keyboard.press('x');
  assert.equal(await page.locator('[data-review-focus]').getAttribute('data-review-focus'),'a:shared');
  await page.keyboard.press('n');
  assert.notEqual(await page.locator('[data-review-focus]').getAttribute('data-review-focus'),'a:shared');
  await page.locator('[data-review-progress]').click();
  await page.getByRole('checkbox',{name:'標記後自動前進'}).uncheck();
  await page.keyboard.press('k');
  assert.equal(await page.getByRole('checkbox',{name:'標記後自動前進'}).isChecked(),false);
 }finally{await browser.close();}
});

test('WP37 remove impact shows known inbound links, newly removable APIs, component count and conflicts',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  await page.locator('.screen-card[data-screen="a"]').click();await page.locator('.preview[aria-busy="false"]').waitFor();
  await page.locator('.prototype-toolbar [role="radio"][data-decision="REMOVE"]').click();
  const impact=page.locator('.decision-impact');
  assert.ok(await impact.isVisible());assert.match(await impact.innerText(),/導向此畫面的其他按鈕／畫面/);
  assert.match(await impact.innerText(),/移除後可移除的 API/);assert.match(await impact.innerText(),/隨畫面移除的元件/);
  assert.match(await impact.innerText(),/依已知關聯；靜態分析可能看不到外部或動態呼叫/);
 }finally{await browser.close();}
});

test('WP37 export check summarizes decisions and keeps the downloaded Markdown unchanged',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
  await page.goto(await fileFixture(simulationFixture()));
  const download=async()=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'仍要匯出',exact:true}).click();const item=await pending;const fs=await import('node:fs/promises');return(await fs.readFile(await item.path(),'utf8')).replace(/^generated_at: .*$/m,'generated_at: "TIME"');};
  await page.getByRole('button',{name:'匯出 md',exact:true}).click();
  const dialog=page.locator('.pre-export-check');assert.ok(await dialog.isVisible());
  assert.match(await dialog.innerText(),/畫面：保留 0 · 移除 0 · 未確認 3/);
  assert.match(await dialog.innerText(),/按鈕：/);assert.match(await dialog.innerText(),/換電腦|清除瀏覽器資料/);
  await page.getByRole('button',{name:'回去處理',exact:true}).click();assert.equal(await dialog.count(),0);
  await page.locator('[data-screen-list="a"]').click();await page.locator('.prototype-toolbar [role="radio"][data-decision="KEEP"]').click();
  await page.getByRole('button',{name:'匯出 md',exact:true}).click();
  const summary=page.locator('.pre-export-check');assert.match(await summary.innerText(),/畫面：保留 1/);
  await page.getByRole('button',{name:'不再顯示',exact:true}).click();
  await page.getByRole('button',{name:'匯出 md',exact:true}).click();
  const md=await download();assert.match(md,/## 2\. 統計/);
 }finally{await browser.close();}
});
