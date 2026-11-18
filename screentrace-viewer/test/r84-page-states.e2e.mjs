import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '../../screentrace-capture/node_modules/playwright/index.mjs';
import { fixture, fileFixture } from './fixture.mjs';
import { openScreen } from './decision-controls.mjs';

// The rules capture puts in a React preview (ADR 0162).
const css =
  'html:not([data-st-show-state]) [data-st-state]{display:none!important}' +
  ['loading', 'error', 'empty']
    .map(
      (s) =>
        `html[data-st-show-state="${s}"] [data-st-state]:not([data-st-state="${s}"]){display:none!important}`,
    )
    .join('');

test('R84 the preview shows the data state first and switches to loading, error or empty on request', async () => {
  const data = fixture();
  data.documents.a = `<html><head><style>${css}</style></head><body>
    <div id="loading" data-st-state="loading">載入中</div>
    <p id="error" data-st-state="error">暫時無法載入</p>
    <ul id="list"><li>甲</li></ul>
    <button id="shared">共用按鈕</button></body></html>`;
  data.documents.b = '<html><body><p id="plain">乙</p></body></html>';
  const browser = await chromium.launch(),
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
  page.setDefaultTimeout(5000);
  try {
    await page.goto(await fileFixture(data));
    await page.locator('#app[data-ready="true"]').waitFor();
    await openScreen(page, 'a');
    const frame = page.frameLocator('.preview iframe'),
      states = page.locator('[data-page-state-switch]');
    await frame.locator('#list').waitFor();
    // Only the states the page has are offered; the data state is chosen.
    assert.deepEqual(await states.locator('button').allInnerTexts(), [
      '有資料',
      '載入中',
      '發生錯誤',
    ]);
    assert.equal(await states.locator('[data-page-state=""]').getAttribute('aria-pressed'), 'true');
    assert.equal(await frame.locator('#loading').isVisible(), false);
    assert.equal(await frame.locator('#error').isVisible(), false);
    await states.locator('[data-page-state="error"]').click();
    assert.equal(await frame.locator('#error').isVisible(), true);
    assert.equal(await frame.locator('#loading').isVisible(), false);
    assert.equal(await frame.locator('#list').isVisible(), true);
    await states.locator('[data-page-state=""]').click();
    assert.equal(await frame.locator('#error').isVisible(), false);
    // A screen without marked states has no switch.
    await openScreen(page, 'b');
    await page.frameLocator('.preview iframe').locator('#plain').waitFor();
    assert.equal(await page.locator('[data-page-state-switch]').isVisible(), false);
  } finally {
    await browser.close();
  }
});
