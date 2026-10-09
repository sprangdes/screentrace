import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture} from './fixture.mjs';

test('WP50 leaving screen review restores the functional map sidebar and filters',async()=>{
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage();
    await page.goto(await fileFixture());
    await page.locator('.primary-tabs button').nth(1).click();
    await page.locator('.screen-review-queue').waitFor();
    await page.getByRole('button',{name:'功能地圖',exact:true}).click();
    await page.locator('.canvas').waitFor();
    assert.equal(await page.locator('.state-chips').isVisible(),true);
    assert.equal(await page.locator('[data-screen-list]').count(),2);
  } finally { await browser.close(); }
});
