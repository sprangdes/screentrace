import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fileFixture,fixture} from './fixture.mjs';

test('R14 WP45 top bar exposes the current delivery-list decision count',async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(await fileFixture(fixture()));
    await page.locator('[data-first-run-guide] button', {hasText:'略過'}).click();
    const cta=page.locator('[data-delivery-progress]');
    assert.equal(await cta.innerText(),'交付清單 · 已決定 0 / 4');
    await cta.click();
    assert.equal(await page.locator('[data-delivery]').isVisible(),true);
  }finally{await browser.close();}
});
