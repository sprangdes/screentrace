import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fixture, fileFixture} from './fixture.mjs';

const transform = page => page.locator('.world').evaluate(w => {const m = new DOMMatrix(w.style.transform);return {zoom: m.a, x: m.e, y: m.f};});

test('two-finger scrolling moves the map, a pinch zooms into the point under the fingers', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
    await page.goto(await fileFixture(fixture()));
    await page.locator('#app[data-ready="true"]').waitFor();
    await page.waitForFunction(() => document.querySelector('.canvas')?.dataset.fitted === 'true');
    const box = await page.locator('.canvas').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);

    const start = await transform(page);
    await page.mouse.wheel(30, 80);
    let now = await transform(page);
    assert.equal(now.zoom, start.zoom, 'scrolling does not zoom');
    assert.ok(Math.abs(now.x - (start.x - 30)) < 0.5 && Math.abs(now.y - (start.y - 80)) < 0.5, 'scrolling moves the map with the fingers');

    // Chrome reports a pinch as a wheel event with ctrlKey.
    const point = await page.evaluate(([x, y]) => {
      const world = document.querySelector('.world'), m = new DOMMatrix(world.style.transform), r = document.querySelector('.canvas').getBoundingClientRect();
      const before = {x: (x - r.left - m.e) / m.a, y: (y - r.top - m.f) / m.a};
      world.closest('.canvas').dispatchEvent(new WheelEvent('wheel', {deltaY: -20, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true}));
      const n = new DOMMatrix(world.style.transform);
      return {before, after: {x: (x - r.left - n.e) / n.a, y: (y - r.top - n.f) / n.a}, zoom: n.a};
    }, [cx, cy]);
    assert.ok(point.zoom > now.zoom, 'pinching out zooms in');
    assert.ok(Math.abs(point.before.x - point.after.x) < 0.5 && Math.abs(point.before.y - point.after.y) < 0.5, 'the point under the fingers stays put');
  } finally { await browser.close(); }
});
