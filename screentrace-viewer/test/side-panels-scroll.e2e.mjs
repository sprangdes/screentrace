import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../screentrace-capture/node_modules/playwright/index.mjs';
import {fixture, fileFixture, node} from './fixture.mjs';
import {showList} from './decision-controls.mjs';

// Many screens all linking to `a`: the list and the details of `a` are both taller than the window.
function tallProject() {
  const p = fixture();
  for (let i = 0; i < 60; i++) {
    p.graph.nodes.push(node(`s${i}`, 'SCREEN', `畫面 ${i}`, {route: `/s/${i}`}), node(`go${i}`, 'COMPONENT', `前往 ${i}`, {kind: 'BUTTON'}));
    p.graph.relationships.push({id: `c${i}`, type: 'CONTAINS', from: `s${i}`, to: `go${i}`}, {id: `n${i}`, type: 'NAVIGATES_TO', from: `go${i}`, to: 'a'});
    p.preview.screens.push({graphScreenId: `s${i}`, width: 1280, height: 900});
    p.documents[`s${i}`] = `<html><body>${i}</body></html>`;
  }
  return p;
}

// Real browsers often draw scrollbars that take room (macOS "always show", Windows). Headless hides them by default
// and otherwise follows the system setting, so the page is given scrollbars that always take room.
const launch = () => chromium.launch({ignoreDefaultArgs: ['--hide-scrollbars']});
const load = async (page, data) => {
  await page.goto(await fileFixture(data));
  await page.addStyleTag({content: '::-webkit-scrollbar{width:15px;height:15px;background:#eee}::-webkit-scrollbar-thumb{background:#999}'});
};

const detailsInset = page => page.evaluate(() => {
  const panel = document.querySelector('.details-panel'), body = document.querySelector('.details-body');
  const p = panel.getBoundingClientRect(), b = body.getBoundingClientRect();
  return {scrollbar: panel.offsetWidth - panel.clientWidth - 1, left: b.left - p.left, right: p.left + panel.clientWidth - b.right};
});

const expectUnclipped = async (page, how) => {
  const inset = await detailsInset(page);
  assert.ok(inset.scrollbar > 0, `${how}: the details scroll with a visible scrollbar`);
  assert.ok(inset.left >= 12, `${how}: the details start inside the panel padding (left inset ${inset.left})`);
  assert.ok(inset.right >= 0, `${how}: the details end before the scrollbar (right inset ${inset.right})`);
};

test('the screen details are never cut off by a scrollbar, whether the screen opens from the list or the canvas', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
    await load(page, tallProject());
    await page.locator('.screen-list [data-screen-list="a"]').click();
    await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy=false]').waitFor();
    await page.waitForFunction(() => document.querySelector('.details-panel').offsetWidth === 340);
    await expectUnclipped(page, 'from the list');

    await page.locator('.prototype-back').click();
    await page.waitForFunction(() => document.querySelector('.canvas').dataset.mode === 'overview');
    await page.locator('.screen-card[data-screen="a"]').dblclick();
    await page.locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy=false]').waitFor();
    await page.waitForFunction(() => document.querySelector('.details-panel').offsetWidth === 340);
    await expectUnclipped(page, 'from the canvas');
  } finally { await browser.close(); }
});

test('the folded list does not scroll; the open list does', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
    await load(page, tallProject());
    const scrolled = () => page.evaluate(() => ({nav: document.querySelector('.sidebar').scrollTop, list: document.querySelector('.sidebar-body').scrollTop}));

    await page.locator('.sidebar-body').hover();
    await page.mouse.wheel(0, 300);
    await page.waitForFunction(() => document.querySelector('.sidebar-body').scrollTop > 0);
    const open = await scrolled();

    // A plain click would first scroll the button at the top of the list back into view.
    await page.getByRole('button', {name: '收起畫面清單'}).evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('.shell').dataset.sidebar === 'collapsed');
    const rail = page.locator('.sidebar-rail');
    assert.ok((await rail.boundingBox()).y <= 60, 'the rail sits at the top even though the list was scrolled');
    await rail.hover();
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
    assert.deepEqual(await scrolled(), open, 'wheeling over the rail scrolls nothing');
    assert.equal(await page.locator('.sidebar').evaluate(nav => nav.scrollHeight <= nav.clientHeight), true, 'the rail has nothing to scroll to');

    await page.getByRole('button', {name: '展開畫面清單'}).click();
    await page.waitForFunction(() => document.querySelector('.shell').dataset.sidebar === 'expanded');

    // While a screen is zoomed in, the list floats over the canvas and still scrolls.
    await page.locator('.screen-list [data-screen-list="a"]').click();
    await page.waitForFunction(() => document.querySelector('.shell').dataset.sidebar === 'collapsed');
    await showList(page);
    const before = (await scrolled()).list;
    await page.locator('.sidebar-body').hover();
    await page.mouse.wheel(0, 200);
    await page.waitForFunction(old => document.querySelector('.sidebar-body').scrollTop !== old, before);
  } finally { await browser.close(); }
});
