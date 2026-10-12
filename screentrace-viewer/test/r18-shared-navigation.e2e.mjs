import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';
import {commonNavigation} from './common-navigation-fixture.mjs';

test('R18 header/footer links: a badge on the overview, one dashed line each way when zoomed, and a grouped source list that agree',async()=>{
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(5000);
 try{
  await page.goto(await fileFixture(commonNavigation()));await page.locator('#app[data-ready="true"]').waitFor();
  assert.equal(await page.locator('.screen-card[data-screen="d"] .shared-entry').getAttribute('data-count'),'2');
  assert.equal(await page.locator('.screen-card[data-screen="a"] .shared-entry').count(),0);
  await page.locator('.screen-card[data-screen="d"]').click();await page.locator('.focus-layer:not([hidden]) .preview[aria-busy="false"]').waitFor();
  const into=page.locator('.shared-link[data-direction="in"]');await into.waitFor();
  assert.equal(await into.getAttribute('data-count'),'2');assert.equal(await page.locator('.shared-link[data-direction="out"]').count(),0);
  assert.equal(await page.locator('.focus-line.shared.is-in').count(),1);
  const panel=page.locator('[data-screen-panel="d"] [data-section="inbound"]');
  assert.match(await panel.locator('.inbound-shared summary').innerText(),/頁首／頁尾連結 2 個畫面/);
  assert.equal(await panel.locator(':scope > [data-inbound="a"]').count(),1,'the page flow source stays in the main list');
  assert.deepEqual(await panel.locator('.inbound-shared [data-inbound]').evaluateAll(rows=>rows.map(r=>r.dataset.inbound)),['b','c']);
  await into.click();
  const menu=page.locator('.shared-popover[data-direction="in"]');
  assert.equal(await menu.isVisible(),true);assert.deepEqual(await menu.locator('[data-shared-screen]').evaluateAll(rows=>rows.map(r=>r.dataset.sharedScreen)),['b','c']);
  await page.keyboard.press('Escape');
  assert.equal(await menu.isVisible(),false);assert.equal(await page.locator('.canvas').getAttribute('data-mode'),'focus','Esc closes only the list');
  await into.click();await menu.locator('[data-shared-screen="b"]').click();
  await page.waitForFunction(()=>document.querySelector('.canvas').dataset.focused==='b');
  await page.locator('.shared-link[data-direction="out"]').waitFor();
  assert.equal(await page.locator('.shared-link[data-direction="out"]').getAttribute('data-count'),'1');
 }finally{await browser.close();}
});
