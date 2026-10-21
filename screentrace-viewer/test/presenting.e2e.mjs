import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fixture, fileFixture, node} from './fixture.mjs';
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

test('moving to another screen while presenting never shows the page underneath', async () => {
  const proof = [{parser: 'Fixture', resolution: 'CONFIRMED', source: {file: 'web/App.tsx', line: 1}}];
  const p = fixture();
  p.graph.nodes.push(node('go', 'COMPONENT', '前往', {kind: 'BUTTON'}));
  p.graph.relationships.push({id: 'owner-go', type: 'CONTAINS', from: 'a', to: 'go', confidence: 'CONFIRMED'});
  p.graph.behaviors = [{id: 'go-b', triggerId: 'go', event: 'click', type: 'NAVIGATE', targetId: 'b', evidence: proof}];
  p.documents.a = '<html><body><button id="go">前往</button></body></html>';
  p.preview.elements = [{graphScreenId: 'a', path: '#go', tag: 'button', text: '前往', graphComponentId: 'go', componentResolution: 'CONFIRMED', bounds: {x: 0, y: 0, width: 40, height: 20}, styleId: 's'}];
  p.preview.styles = {s: {}};
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    await page.goto(await fileFixture(p));
    await openScreen(page, 'a');
    await page.locator('.focus-layer:not([hidden]):not(.is-leaving):not(.is-entering) .preview[aria-busy=false]').waitFor();
    await page.keyboard.press('f');
    // Every frame, some fully opaque preview must cover the whole window, so the page underneath never shows.
    await page.evaluate(() => {
      window.uncovered = [];window.sampling = true;
      const covered = () => [...document.querySelectorAll('.focus-layer:not([hidden])')].some(layer => {
        const r = layer.getBoundingClientRect();
        return r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight && Number(getComputedStyle(layer).opacity) > 0.99;
      });
      const sample = () => {if (!covered()) window.uncovered.push(performance.now());if (window.sampling) requestAnimationFrame(sample);};
      requestAnimationFrame(sample);
    });
    await page.frameLocator('.focus-layer:not(.is-leaving) iframe').locator('#go').click();
    await page.locator('aside .panel-header h2').filter({hasText: '乙'}).waitFor();
    // Sample until the switch is over: one preview left, faded in, with nothing still moving.
    await page.waitForFunction(() => {
      const layers = document.querySelectorAll('.focus-layer:not([hidden])');
      return layers.length === 1 && !layers[0].classList.contains('is-entering') && layers[0].getAnimations().length === 0;
    });
    const uncovered = await page.evaluate(() => {window.sampling = false;return window.uncovered.length;});
    assert.equal(uncovered, 0, 'the switch stays full-window throughout');
    assert.equal(await page.locator('.focus-layer:not([hidden])').count(), 1, 'the old preview is gone once the new one is shown');
    assert.equal(await page.locator('.prototype-present').getAttribute('aria-pressed'), 'true');
  } finally { await browser.close(); }
});
