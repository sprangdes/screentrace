import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fixture, fileFixture} from './fixture.mjs';
import {openScreen} from './decision-controls.mjs';

test('presenting lays the preview over the whole window; Esc ends it before going back to the canvas', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
    await page.goto(await fileFixture(fixture()));
    await openScreen(page, 'a');
    await page.locator('.preview[aria-busy=false]').waitFor();
    const layer = page.locator('.focus-layer:not([hidden]):not(.is-leaving)');
    const scale = () => page.locator('.prototype-viewer').getAttribute('data-scale').then(Number);
    const before = await layer.boundingBox(), scaleBefore = await scale();

    await page.locator('.prototype-present').click();
    assert.deepEqual(await layer.boundingBox(), {x: 0, y: 0, width: 1440, height: 900}, 'the preview covers the window');
    assert.equal(await page.locator('.prototype-present').getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(old => Number(document.querySelector('.prototype-viewer').dataset.scale) > old, scaleBefore);
    assert.ok(await page.locator('.topbar').evaluate(bar => document.elementFromPoint(bar.getBoundingClientRect().x + 400, 20)?.closest('.topbar') === null), 'the top bar is covered');

    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.canvas').getAttribute('data-mode'), 'focus', 'Esc first ends presenting');
    assert.deepEqual(await layer.boundingBox(), before);
    assert.equal(await page.locator('.prototype-present').getAttribute('aria-pressed'), 'false');

    await page.keyboard.press('f');
    assert.equal(await page.locator('body').getAttribute('data-presenting'), 'true', 'f toggles presenting');
    await page.locator('.prototype-back').click();
    await page.waitForFunction(() => document.querySelector('.canvas').dataset.mode === 'overview');
    assert.equal(await page.locator('body').getAttribute('data-presenting'), 'false', 'going back to the canvas ends presenting');
  } finally { await browser.close(); }
});
