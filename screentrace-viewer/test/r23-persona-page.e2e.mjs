import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '../../screentrace-capture/node_modules/playwright/index.mjs';
import { fixture, fileFixture } from './fixture.mjs';
const source = { file: 'workspace:config.json', line: 1 };
// a: both personas; b: member only (possible, step 2); visitor could see b but never reaches it.
function personaFixture() {
  const data = fixture();
  data.graph.schemaVersion = '2.4';
  data.graph.application.personas = [
    {
      id: 'visitor',
      name: '訪客',
      description: '尚未登入的訪客',
      facts: [{ text: 'user', truth: false, source }],
      startPaths: ['/'],
      screens: { a: 'APPLIES', b: 'APPLIES' },
      navigations: [],
      flow: {
        entryPoints: ['entry:root'],
        reached: [{ screenId: 'a', reach: 'REACHABLE', depth: 1 }],
        unreached: ['b'],
        steps: [
          { from: 'entry:root', to: 'a', kind: 'RENDERS', behaviorId: null, status: 'APPLIES' },
        ],
        unevaluatedNavigations: 0,
      },
    },
    {
      id: 'member',
      name: '會員',
      facts: [{ text: 'user', truth: true, source }],
      startPaths: ['/'],
      screens: { a: 'APPLIES', b: 'UNKNOWN' },
      navigations: [],
      flow: {
        entryPoints: ['entry:root'],
        reached: [
          { screenId: 'a', reach: 'REACHABLE', depth: 1 },
          { screenId: 'b', reach: 'POSSIBLE', depth: 2 },
        ],
        unreached: [],
        steps: [
          { from: 'entry:root', to: 'a', kind: 'RENDERS', behaviorId: null, status: 'APPLIES' },
          { from: 'a', to: 'b', kind: 'NAVIGATE', behaviorId: 'nav', status: 'UNKNOWN' },
        ],
        unevaluatedNavigations: 1,
      },
    },
  ];
  return data;
}
const open = async (browser, data) => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const state = { requests: 0, errors: [] };
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) state.requests++;
  });
  page.on('pageerror', (e) => state.errors.push(String(e)));
  await page.goto(await fileFixture(data));
  await page.waitForSelector('[data-ready="true"]');
  return { page, state };
};
const toPersonas = async (page) => {
  await page.click('.page-tab[data-page="personas"]');
  await page.waitForSelector('[data-persona-page]');
};

test('R23 the persona page lists personas as cards above the chosen persona, with keyboard movement', async () => {
  const browser = await chromium.launch();
  try {
    const { page, state } = await open(browser, personaFixture());
    await toPersonas(page);
    assert.equal(
      await page.locator('[data-persona-page] .persona-cards[role=listbox] .persona-row').count(),
      2,
    );
    assert.equal(
      await page
        .locator('[data-persona-page] .persona-detail [data-persona-detail="visitor"]')
        .count(),
      1,
      'the first persona is shown at first',
    );
    assert.equal(
      await page.locator('[data-persona-row="visitor"]').getAttribute('aria-selected'),
      'true',
    );
    assert.deepEqual(
      await page.locator('[data-persona-detail="visitor"] .api-section h3').allTextContents(),
      ['流程 1 個畫面', '判定條件', '起點', '和其他角色比較', '流程以外'],
    );
    assert.deepEqual(
      await page.locator('[data-persona-section="compare"] .api-shared-name').allTextContents(),
      ['所有角色共用'],
    );
    assert.deepEqual(
      await page.locator('[data-persona-section="outside"] .api-shared-name').allTextContents(),
      ['走不到'],
    );
    await page.locator('[data-persona-row="visitor"]').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(
      await page.locator('[data-persona-row="member"]').getAttribute('aria-selected'),
      'true',
    );
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.personaRow), 'member');
    assert.deepEqual(
      await page.locator('[data-persona-section="compare"] .api-shared-name').allTextContents(),
      ['只有這個角色', '所有角色共用'],
    );
    await page.keyboard.press('ArrowLeft');
    assert.equal(
      await page.locator('[data-persona-row="visitor"]').getAttribute('aria-selected'),
      'true',
      'left and right move along the cards too',
    );
    await page.keyboard.press('ArrowRight');
    assert.equal(
      await page.locator('[data-persona-section="outside"]').count(),
      0,
      'nothing outside the flow',
    );
    assert.deepEqual(state.errors, []);
    assert.equal(state.requests, 0);
  } finally {
    await browser.close();
  }
});

test('R23 the flow button, the chosen persona and screens outside the flow', async () => {
  const browser = await chromium.launch();
  try {
    const { page, state } = await open(browser, personaFixture());
    await page.locator('[data-persona-option="member"]').click();
    await toPersonas(page);
    assert.equal(
      await page.locator('[data-persona-row="member"]').getAttribute('aria-selected'),
      'true',
      'the persona chosen on the map is shown',
    );
    await page.locator('[data-persona-flow="member"]').click();
    await page.waitForSelector('.canvas [data-persona-bar]');
    assert.equal(
      await page.locator('.page-tab[data-page="screens"]').getAttribute('aria-current'),
      'page',
    );
    assert.equal(
      await page.locator('[data-persona-option="member"]').getAttribute('aria-pressed'),
      'true',
    );

    await toPersonas(page);
    await page.locator('[data-persona-row="visitor"]').click();
    await page.locator('[data-persona-fold="unreached"] summary').click();
    await page.locator('[data-persona-fold="unreached"] [data-persona-screen="b"]').click();
    await page.waitForSelector('[data-screen-panel="b"] [data-persona-status]');
    assert.equal(await page.locator('[data-persona-status]').textContent(), '角色「訪客」：走不到');
    assert.equal(
      await page.locator('[data-persona-show-all]').isChecked(),
      true,
      'the unreached screen is shown on the map',
    );
    await page.keyboard.press('Escape');
    await toPersonas(page);
    assert.equal(
      await page.locator('[data-persona-row="visitor"]').getAttribute('aria-selected'),
      'true',
      'coming back keeps the persona',
    );
    assert.deepEqual(state.errors, []);
    assert.equal(state.requests, 0);
  } finally {
    await browser.close();
  }
});
