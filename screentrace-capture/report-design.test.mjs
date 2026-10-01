// Run against a generated, locally served JSP fixture report:
// node screentrace-capture/report-design.test.mjs http://127.0.0.1:8765/report/index.html
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const reportUrl = process.argv[2];
assert.ok(reportUrl, 'Provide the URL of a locally served report with screens and interactions.');
const browser = await chromium.launch();
const errors = [];
try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 390 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    // Review tests must never persist decisions to the fixture server.
    await page.route('**/edit-overlay.json', route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 204 }) : route.continue());
    await page.goto(reportUrl);
    await page.locator('.atlas-intro').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overview overflow at ${width}`);
    await page.locator('.folder-screen-item').first().click();
    await page.locator('.focus-map').waitFor();
    const layout = await page.evaluate(() => {
      const controls = document.querySelector('.workspace-bottom-controls').getBoundingClientRect();
      const main = document.querySelector('main').getBoundingClientRect();
      const detail = document.querySelector('.detail').getBoundingClientRect();
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        controls: { left: controls.left, right: controls.right, top: controls.top, bottom: controls.bottom },
        main: { left: main.left, right: main.right, bottom: main.bottom }, detailTop: detail.top };
    });
    assert.ok(layout.scrollWidth <= width, `Flow overflow at ${width}`);
    assert.ok(layout.controls.left >= layout.main.left && layout.controls.right <= layout.main.right, `Controls clipped at ${width}`);
    if (width <= 850) assert.ok(layout.controls.bottom <= layout.detailTop, `Controls cover inspector at ${width}`);
    await page.locator('#mode-review').click();
    assert.equal(await page.locator('#mode-review').getAttribute('aria-pressed'), 'true');
    const status = page.locator('.detail-review-status');
    await page.locator('.node-review-status').first().focus();
    await page.keyboard.press('Enter');
    assert.ok((await status.textContent()).includes('保留'));
    await status.click();
    assert.ok((await status.textContent()).includes('移除'));
    await status.click();
    assert.ok((await status.textContent()).includes('未確認'));
    await page.locator('#mode-review').click();
    await page.locator('#mode-page').click();
    await page.locator('.page').waitFor();
    assert.equal(await page.locator('#mode-page').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.hotspot:not([aria-label])').count(), 0);
    await page.locator('#rail-button-list').click();
    await page.locator('.inventory-search').fill('no-match-for-ui-audit');
    await page.locator('.inventory-empty').waitFor();
    await page.locator('#rail-api-list').click();
    await page.locator('.inventory-workspace').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Inventory overflow at ${width}`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#rail-screen-tree').click();
    assert.equal(await page.locator('.atlas-intro').evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.locator('.folder-screen-item').first().focus();
    await page.keyboard.press('Enter');
    await page.locator('.focus-map').waitFor();
    await page.locator('#mode-page').focus();
    await page.keyboard.press('Enter');
    await page.locator('.page').waitFor();
    await context.close();
    console.log(`PASS ${width}px: layout, touch, modes, review cycle, search, keyboard, reduced motion`);
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
} finally {
  await browser.close();
}
