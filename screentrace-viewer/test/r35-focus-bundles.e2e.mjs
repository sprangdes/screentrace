import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '../../screentrace-capture/node_modules/playwright/index.mjs';
import { fileFixture, fixture } from './fixture.mjs';

/** Fourteen screens in URL areas; 畫面5 (/admin/users) is reached from two /shop screens, /admin and 其他. */
function areasFixture() {
  const data = fixture(),
    routes = [
      '/shop',
      '/shop/cart',
      '/shop/pay',
      '/shop/done',
      '/admin',
      '/admin/users',
      '/admin/roles',
      '/report/day',
      '/report/month',
      '/login',
      '/help',
      '/about',
      '/faq',
      '/terms',
    ];
  const node = (id, type, name, attributes = {}) => ({
    id,
    type,
    name,
    attributes,
    confidence: 'CONFIRMED',
    source: { file: 'web/App.tsx', line: 1 },
  });
  data.graph.nodes = routes.map((route, i) => node(`s${i}`, 'SCREEN', `畫面${i}`, { route }));
  data.graph.relationships = [];
  data.graph.behaviors = [];
  const link = (from, to, i) => {
    const c = `c${i}`;
    data.graph.nodes.push(node(c, 'COMPONENT', `連結${i}`, { kind: 'LINK' }));
    data.graph.relationships.push(
      { id: 'own' + i, type: 'CONTAINS', from, to: c, confidence: 'CONFIRMED' },
      { id: 'nav' + i, type: 'NAVIGATES_TO', from: c, to, confidence: 'CONFIRMED' },
    );
  };
  [
    ['s0', 's1'],
    ['s1', 's2'],
    ['s2', 's3'],
    ['s4', 's5'],
    ['s5', 's6'],
    ['s7', 's8'],
    ['s0', 's4'],
    ['s3', 's7'],
    ['s9', 's0'],
    ['s10', 's5'],
    ['s1', 's5'],
    ['s2', 's5'],
  ].forEach(([from, to], i) => link(from, to, i));
  data.preview.screens = routes.map((_, i) => ({
    graphScreenId: `s${i}`,
    width: 1280,
    height: 900,
  }));
  data.documents = Object.fromEntries(
    routes.map((_, i) => [`s${i}`, `<html><body>畫面${i}</body></html>`]),
  );
  return data;
}

const open = async (browser) => {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    }),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(await fileFixture(areasFixture()));
  await page.locator('#app[data-ready="true"]').waitFor();
  return { page, errors };
};
const focus = async (page, id) => {
  await page.locator(`.screen-card[data-screen="${id}"]`).dblclick();
  await page
    .locator('.focus-layer:not([hidden]):not(.is-leaving) .preview[aria-busy="false"]')
    .waitFor();
  await page.waitForFunction(
    () => !document.querySelector('.focus-lines').classList.contains('is-entering'),
  );
};
const layerBox = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('.focus-layer:not(.is-leaving)').getBoundingClientRect(),
      c = document.querySelector('.canvas').getBoundingClientRect();
    return { left: box.left - c.left, right: box.right - c.left };
  });

test('R35 around an open screen, lines arrive on the left one row per area, and an area with several screens is one labelled line', async () => {
  const browser = await chromium.launch();
  try {
    const { page, errors } = await open(browser);
    await focus(page, 's5');
    const shop = page.locator('.focus-bundle[data-kind="incoming-bundle"]');
    assert.equal(await shop.count(), 1, 'only /shop has more than one screen leading here');
    assert.equal(await shop.getAttribute('data-group'), 'area:/shop');
    assert.equal(await shop.getAttribute('data-count'), '2');
    assert.equal(await shop.locator('.focus-bundle-name').innerText(), '/shop');
    assert.equal(await shop.locator('.focus-bundle-count').innerText(), '2');
    const named = (
      await page
        .locator('.focus-bundle[data-kind="incoming-screen"]')
        .evaluateAll((n) => n.map((x) => x.dataset.screen))
    ).sort();
    assert.deepEqual(
      named,
      ['s10', 's4'],
      'a single screen keeps its own line, labelled with its name',
    );
    const box = await layerBox(page);
    assert.ok(
      box.left > 56 && box.left <= 140,
      'the left margin widens to hold its labels, up to 140px',
    );
    const arriving = await page
      .locator('.focus-line[data-kind="incoming"],.focus-line[data-kind="incoming-bundle"]')
      .evaluateAll((lines) =>
        lines.map((l) => {
          const t = l.getTotalLength(),
            a = l.getPointAtLength(0),
            b = l.getPointAtLength(t);
          return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
        }),
      );
    assert.equal(arriving.length, 3, 'three rows: /shop, /admin and 其他');
    for (const line of arriving) {
      assert.ok(
        line.a.x < line.b.x && line.b.x <= box.left + 1 && Math.abs(line.a.y - line.b.y) < 0.5,
        'each row runs straight into the left edge',
      );
    }
    assert.equal(new Set(arriving.map((l) => Math.round(l.a.y))).size, 3, 'rows do not overlap');
    const width = await page
      .locator('.focus-line[data-kind="incoming-bundle"]')
      .evaluate((l) => parseFloat(l.style.strokeWidth));
    assert.ok(width > 2.5, 'a merged line is thicker');
    // The label lists the area's screens; choosing one opens it.
    await shop.click();
    const menu = page.locator('.focus-bundle-menu:not([hidden])');
    assert.equal(await shop.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(
      await menu
        .locator('[data-bundle-screen]')
        .evaluateAll((n) => n.map((x) => x.dataset.bundleScreen)),
      ['s1', 's2'],
    );
    await page.keyboard.press('Escape');
    assert.equal(await menu.count(), 0);
    assert.equal(await shop.getAttribute('aria-expanded'), 'false');
    await shop.click();
    await page.locator('.focus-bundle-menu:not([hidden]) [data-bundle-screen="s1"]').click();
    await page.waitForFunction(() => document.querySelector('.canvas').dataset.focused === 's1');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('R35 without a merged line the preview keeps its narrow margins and lines carry no labels', async () => {
  const browser = await chromium.launch();
  try {
    const { page, errors } = await open(browser);
    await focus(page, 's6');
    assert.equal(await page.locator('.focus-bundle').count(), 0);
    const box = await layerBox(page);
    assert.ok(box.left <= 60, 'the usual 56px margin');
    const line = await page.locator('.focus-line-hit[data-kind="incoming"]').evaluate((l) => {
      const a = l.getPointAtLength(0),
        b = l.getPointAtLength(l.getTotalLength());
      return { a: a.x, b: b.x };
    });
    assert.ok(line.a < line.b && line.b <= box.left + 1, 'the line from 畫面5 arrives on the left');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('R36 every margin label on a side has the same width and every line ends at its label, not under it', async () => {
  const browser = await chromium.launch();
  try {
    const { page, errors } = await open(browser);
    await focus(page, 's5');
    await layerBox(page);
    const labels = await page.locator('.focus-bundle').evaluateAll((n) => {
      const c = document.querySelector('.canvas').getBoundingClientRect();
      return n.map((x) => {
        const r = x.getBoundingClientRect();
        return {
          kind: x.dataset.kind,
          left: r.left - c.left,
          right: r.right - c.left,
          y: (r.top + r.bottom) / 2 - c.top,
        };
      });
    });
    const incoming = labels.filter((l) => l.kind.startsWith('incoming'));
    assert.equal(incoming.length, 3, 'the single screens are labelled too');
    assert.equal(
      new Set(incoming.map((l) => Math.round(l.right - l.left))).size,
      1,
      'one width for every label on the left',
    );
    assert.equal(new Set(incoming.map((l) => Math.round(l.left))).size, 1, 'and one left edge');
    const lines = await page
      .locator('.focus-line[data-kind="incoming"],.focus-line[data-kind="incoming-bundle"]')
      .evaluateAll((n) =>
        n.map((l) => {
          const a = l.getPointAtLength(0);
          return { x: a.x, y: a.y };
        }),
      );
    for (const line of lines) {
      const label = incoming.find((l) => Math.abs(l.y - line.y) < 12);
      assert.ok(label, 'each row has its label');
      assert.ok(Math.abs(line.x - label.right) < 1.5, "the line starts at the label's inner edge");
    }
    // The arrow of the line leaving for 畫面6 ends at that screen's label instead of underneath it.
    const out = await page
      .locator('.focus-bundle[data-kind="known-screen"]')
      .first()
      .evaluate((x) => {
        const c = document.querySelector('.canvas').getBoundingClientRect();
        return x.getBoundingClientRect().left - c.left;
      });
    const ends = await page
      .locator('.focus-line[data-kind="known"]')
      .evaluateAll((n) => n.map((l) => l.getPointAtLength(l.getTotalLength()).x));
    assert.ok(ends.length > 0);
    for (const end of ends)
      assert.ok(end < out, 'the line stops before the label so its arrow stays visible');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("R36 the open screen keeps a desktop screen's proportions even when the margins hold labels", async () => {
  const browser = await chromium.launch();
  try {
    const { page, errors } = await open(browser);
    await focus(page, 's5');
    const size = await page.locator('.focus-layer:not(.is-leaving)').evaluate((l) => {
      const r = l.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    assert.ok(
      size.w / size.h >= 1440 / 900 - 0.01,
      `the preview is no taller than 1440×900 for its width (${size.w}×${size.h})`,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('R36a each side is only as wide as its labels need, so the open screen stays as large as it can', async () => {
  const browser = await chromium.launch();
  try {
    const { page, errors } = await open(browser);
    await focus(page, 's5');
    const box = await layerBox(page),
      width = await page.locator('.canvas').evaluate((c) => c.getBoundingClientRect().width);
    const labels = await page.locator('.focus-bundle').evaluateAll((n) => {
      const c = document.querySelector('.canvas').getBoundingClientRect();
      return n.map((x) => {
        const r = x.getBoundingClientRect(),
          name = x.querySelector('.focus-bundle-name');
        return {
          kind: x.dataset.kind,
          left: r.left - c.left,
          right: r.right - c.left,
          clipped: name.scrollWidth > name.clientWidth + 1,
        };
      });
    });
    const left = labels.filter((l) => l.kind.startsWith('incoming')),
      right = labels.filter((l) => l.kind.startsWith('known'));
    assert.ok(
      left.every((l) => !l.clipped) && right.every((l) => !l.clipped),
      'short names fit their labels whole',
    );
    assert.ok(
      Math.abs(box.left - (left[0].right + 20)) < 1.5,
      'the box starts 20px past the left labels',
    );
    assert.ok(
      Math.abs(width - box.right - (width - right[0].left + 20)) < 1.5,
      'and ends 20px before the right labels',
    );
    assert.ok(
      box.left < 130 && width - box.right < 130,
      'short labels leave narrower margins than the 140px cap',
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
