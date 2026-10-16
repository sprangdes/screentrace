import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fixture, fileFixture, node} from './fixture.mjs';
import {openScreen} from './decision-controls.mjs';

// A tall screen: one button at the top, one far below the fold, one inside the page's own scrolling box.
function tallScreen() {
  const p = fixture();
  const buttons = {top: '上方', bottom: '下方', inner: '內層'};
  for (const [id, name] of Object.entries(buttons)) {
    p.graph.nodes.push(node(id, 'COMPONENT', name, {kind: 'BUTTON'}));
    p.graph.relationships.push({id: `owner-${id}`, type: 'CONTAINS', from: 'a', to: id, confidence: 'CONFIRMED'});
  }
  p.preview.screens[0].height = 2400;
  p.documents.a = '<html><body style="margin:0;height:2400px">'
    + '<button id="top" style="position:absolute;top:20px;left:20px">上方</button>'
    + '<div id="box" style="position:absolute;top:120px;left:20px;width:300px;height:150px;overflow:auto"><div style="height:800px"><button id="inner" style="margin-top:600px">內層</button></div></div>'
    + '<button id="bottom" style="position:absolute;top:2200px;left:20px">下方</button></body></html>';
  p.preview.elements = Object.entries(buttons).map(([id, text]) => ({graphScreenId: 'a', path: `#${id}`, tag: 'button', text, graphComponentId: id, componentResolution: 'CONFIRMED', bounds: {x: 0, y: 0, width: 40, height: 20}, styleId: 's'}));
  p.preview.styles = {s: {}};
  return p;
}

/** Everything outside the preview's own viewport that could move: every scroll offset and the preview's frame. */
const outside = page => page.evaluate(() => {
  const viewport = document.querySelector('.prototype-scroll'), scrolled = [];
  for (const element of document.querySelectorAll('*')) if (element !== viewport && (element.scrollTop || element.scrollLeft)) scrolled.push([element.className, element.scrollTop, element.scrollLeft]);
  const box = selector => {const r = document.querySelector(selector).getBoundingClientRect();return [r.x, r.y, r.width, r.height];};
  return {scrolled, page: [scrollX, scrollY], layer: box('.focus-layer:not([hidden])'), viewport: box('.prototype-scroll'), canvas: document.querySelector('.canvas-world, .canvas')?.getAttribute('style') || ''};
});

/** Where a preview button is drawn relative to the preview's viewport, and whether all of it shows. */
function inView(id) {
  const frame = document.querySelector('.preview iframe'), viewport = document.querySelector('.prototype-scroll').getBoundingClientRect();
  const button = frame.contentDocument.getElementById(id), inner = button.getBoundingClientRect(), outer = frame.getBoundingClientRect(), scale = outer.width / frame.offsetWidth;
  let visible = inner.top * scale + outer.top >= viewport.top && inner.bottom * scale + outer.top <= viewport.bottom;
  for (let parent = button.parentElement; parent && parent !== frame.contentDocument.body; parent = parent.parentElement) {
    const r = parent.getBoundingClientRect();
    if (getComputedStyle(parent).overflowY === 'auto') visible &&= inner.top >= r.top && inner.bottom <= r.bottom;
  }
  return visible;
}
const shown = (page, id) => page.evaluate(inView, id);
/** Smooth scrolling takes a moment; wait until the button shows and every scroll has stopped. */
const revealed = async (page, id) => {
  await page.waitForFunction(inView, id);
  let last;
  for (;;) {const now = JSON.stringify(await scrollTops(page));if (now === last) return;last = now;await page.waitForTimeout(150);}
};

const scrollTops = page => page.evaluate(() => ({viewport: document.querySelector('.prototype-scroll').scrollTop, box: document.querySelector('.preview iframe').contentDocument.getElementById('box').scrollTop}));

test('choosing a button in the details scrolls only the preview, and only when the button is out of view', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
    await page.goto(await fileFixture(tallScreen()));
    await openScreen(page, 'a');
    await page.locator('.focus-layer:not([hidden]):not(.is-leaving):not(.is-entering) .preview[aria-busy=false]').waitFor();
    await page.locator('.prototype-viewer[data-loaded=true]').waitFor();
    await page.locator('details.panel-buttons, details:has(> summary:text-matches("按鈕"))').first().evaluate(details => {details.open = true;});
    const before = await outside(page), tops = await scrollTops(page);
    assert.equal(await shown(page, 'top'), true, 'the top button starts in view');

    await page.locator('[data-locate="top"]').click();
    await page.waitForTimeout(300);
    assert.deepEqual(await scrollTops(page), tops, 'a button already in view scrolls nothing');
    assert.deepEqual(await outside(page), before, 'nothing outside the preview moves');

    await page.locator('[data-locate="bottom"]').click();
    await revealed(page, 'bottom');
    assert.equal(await shown(page, 'bottom'), true, 'a button below the fold is brought into view');
    const afterBottom = await scrollTops(page);
    assert.ok(afterBottom.viewport > tops.viewport, 'the preview itself scrolled');
    assert.deepEqual(await outside(page), before, 'the canvas and the preview frame stay where they were');
    // Just enough to show it, with room around it: the button sits near the bottom edge, not centred.
    const gap = await page.evaluate(() => {const f = document.querySelector('.preview iframe'), b = f.contentDocument.getElementById('bottom'), v = document.querySelector('.prototype-scroll').getBoundingClientRect(), o = f.getBoundingClientRect(), s = o.width / f.offsetWidth;return v.bottom - (b.getBoundingClientRect().bottom * s + o.top);});
    assert.ok(gap > 0 && gap < 60, `the button ends just above the viewport's edge (gap ${gap})`);

    await page.locator('[data-locate="inner"]').click();
    await revealed(page, 'inner');
    assert.equal(await shown(page, 'inner'), true, 'a button inside the page\'s own scrolling box is brought into view');
    assert.deepEqual(await outside(page), before, 'still nothing outside the preview moves');
  } finally { await browser.close(); }
});
