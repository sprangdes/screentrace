// R77 (ADR 0155): fields and APIs can be marked, every mark can carry a note, and marks not in any file are flagged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '../../screentrace-capture/node_modules/playwright/index.mjs';
import { fileFixture, fixture, node } from './fixture.mjs';
import { openScreen } from './decision-controls.mjs';

/** 甲 has a button calling the GET API, a text field and a table, each placed in the preview. */
function r77Fixture() {
  const data = fixture();
  data.graph.nodes.push(
    node('save', 'COMPONENT', '儲存', { kind: 'BUTTON' }),
    node('name', 'COMPONENT', '姓名', { kind: 'TEXT_INPUT', tag: 'input' }),
    node('list', 'COMPONENT', '清單', { kind: 'TABLE', tag: 'table' }),
  );
  data.graph.relationships.push(
    { id: '4', type: 'CONTAINS', from: 'a', to: 'save' },
    { id: '5', type: 'CALLS', from: 'save', to: 'ep' },
    { id: '6', type: 'CONTAINS', from: 'a', to: 'name' },
    { id: '7', type: 'CONTAINS', from: 'a', to: 'list' },
  );
  data.documents.a =
    '<html><body><button id="shared">共用按鈕</button><button id="save">儲存</button>' +
    '<input id="name" placeholder="姓名"><table id="list"><tr><td>資料</td></tr></table></body></html>';
  data.preview.elements = [
    ['shared', '#shared', 'button', 10],
    ['save', '#save', 'button', 40],
    ['name', '#name', 'input', 70],
    ['list', '#list', 'table', 100],
  ].map(([id, path, tag, y]) => ({
    graphScreenId: 'a',
    graphComponentId: id,
    componentResolution: 'CONFIRMED',
    path,
    tag,
    text: '',
    bounds: { x: 10, y, width: 80, height: 20 },
    styleId: 's',
  }));
  data.preview.styles = { s: {} };
  // md generation validates every relation strictly: give each one its evidence.
  for (const edge of data.graph.relationships) {
    edge.confidence = 'CONFIRMED';
    edge.source = { file: 'web/a.jsp', line: 2 };
    edge.evidence = [{ parser: 'Fixture', resolution: 'CONFIRMED', source: edge.source }];
  }
  return data;
}
async function open(data = r77Fixture(), autosave = false) {
  const browser = await chromium.launch(),
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
      acceptDownloads: true,
    }),
    file = await fileFixture(data),
    requests = [];
  page.setDefaultTimeout(5000);
  if (!autosave)
    await page.addInitScript(() => {
      delete window.showSaveFilePicker;
      delete window.showOpenFilePicker;
    });
  page.on('request', (request) => {
    const url = request.url();
    if (![file, 'data:', 'blob:', 'about:'].some((prefix) => url.startsWith(prefix)))
      requests.push(url);
  });
  await page.goto(file);
  await page.locator('#app[data-ready="true"]').waitFor();
  return { browser, page, file, requests };
}
const radio = (page, screen, value, component) =>
  page.locator(
    `.decision-switch[data-screen-id="${screen}"]${component ? `[data-component-id="${component}"]` : ':not([data-component-id])'} [data-decision="${value}"]`,
  );
const downloadMd = async (page) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-md-export]').click(),
  ]);
  return readFile(await download.path(), 'utf8');
};

test('R77 fields are listed and marked apart from buttons, follow the screen, and a click in the preview finds their row', async () => {
  const { browser, page, requests } = await open();
  try {
    await openScreen(page, 'a');
    const fields = page.locator('[data-screen-panel="a"] .panel-fields');
    assert.match(await fields.locator('summary').first().innerText(), /欄位 2 個/);
    assert.equal(await page.locator('.panel-buttons [data-component-row="name"]').count(), 0);
    await fields.locator('summary').first().click();
    assert.match(await fields.locator('[data-component-row="name"]').innerText(), /文字欄位/);
    await radio(page, 'a', 'REMOVE', 'list').click();
    assert.match(await fields.locator('summary').first().innerText(), /已標記 1/);
    await page.locator('.progress-button').click();
    assert.match(
      await page.locator('[data-progress-fields]').innerText(),
      /保留 0 · 移除 1 · 隨畫面移除 0/,
    );
    await page.keyboard.press('Escape');
    await radio(page, 'a', 'REMOVE').click();
    await page.locator('[data-screen-panel="a"] .panel-fields[open]').waitFor();
    assert.match(
      await page.locator('[data-component-row="name"] .inherited-tag').innerText(),
      /隨畫面移除/,
    );
    // Clicking the field in the preview marks its row in the panel.
    const frame = page.frameLocator('.preview iframe');
    await frame.locator('#name').click();
    await page.locator('[data-component-row="name"].is-highlighted').waitFor();
    assert.deepEqual(requests, []);
  } finally {
    await browser.close();
  }
});

test('R77 notes on a screen and a field are kept while typing, survive a reload and go into md format 4', async () => {
  const { browser, page, requests } = await open();
  try {
    await openScreen(page, 'a');
    await radio(page, 'a', 'REMOVE').click();
    const screenNote = page.locator('.panel-header .note-editor[data-note-for="screen"]');
    await screenNote.locator('[data-note-toggle]').click();
    await screenNote.locator('[data-note-reason]').selectOption('DISCONTINUED');
    const area = screenNote.locator('[data-note-text]');
    await area.fill('舊版功能，已併入乙畫面');
    // Typing does not rebuild the panel: the same field keeps focus.
    assert.equal(await area.evaluate((el) => el === document.activeElement), true);
    await page.locator('.panel-header h2').click();
    await page.locator('.panel-header .note-editor[data-note-filled][data-open="true"]').waitFor();
    await page.locator('[data-screen-panel="a"] .panel-fields > summary').click();
    const fieldNote = page.locator('.note-editor[data-component-id="name"]');
    await fieldNote.locator('[data-note-toggle]').click();
    // An undecided field takes a note but offers no reason.
    assert.equal(await fieldNote.locator('[data-note-reason]').count(), 0);
    await fieldNote.locator('[data-note-text]').fill('改成必填\n限 20 字');
    await page.locator('.panel-header h2').click();
    await page.locator('.note-editor[data-component-id="name"][data-note-filled]').waitFor();
    // Shortcut keys typed into a note stay text.
    await fieldNote.locator('[data-note-text]').press('End');
    await fieldNote.locator('[data-note-text]').type(' k');
    await page.locator('.panel-header h2').click();
    assert.equal(await radio(page, 'a', 'REMOVE').getAttribute('aria-checked'), 'true');

    await page.reload();
    await page.locator('#app[data-ready="true"]').waitFor();
    await openScreen(page, 'a');
    await page.locator('.panel-header .note-editor [data-note-toggle]').click();
    assert.equal(
      await page.locator('.panel-header [data-note-text]').inputValue(),
      '舊版功能，已併入乙畫面',
    );
    const md = await downloadMd(page);
    assert.match(md, /"format_version":4/);
    assert.match(md, /` 業務單位確認已停用（DISCONTINUED） ` \| ` 舊版功能，已併入乙畫面 `/);
    assert.match(md, /` 改成必填 限 20 字 k `/);
    assert.deepEqual(requests, []);
  } finally {
    await browser.close();
  }
});

test('R77 an API is marked on the API page, disagreements are conflicts, and its note reaches the md', async () => {
  const { browser, page, requests } = await open();
  try {
    await page.locator('.page-tab[data-page="api"]').click();
    await page.locator('[data-api-row="ep"]').click();
    const box = page.locator('[data-api-decision-for="ep"]');
    await box.locator('[data-decision="REMOVE"]').click();
    // The 儲存 button still calls it, so the decision disagrees with the callers.
    await page.locator('[data-api-conflict="ep"]').waitFor();
    assert.match(await page.locator('[data-api-row="ep"] .api-decision-mark').innerText(), /移除/);
    assert.equal(
      await page.locator('.progress-conflicts').getAttribute('data-conflict-count'),
      '1',
    );
    await page.locator('[data-api-decision-for="ep"] .note-editor [data-note-toggle]').click();
    await page.locator('[data-api-decision-for="ep"] [data-note-reason]').selectOption('REPLACED');
    await page.locator('[data-api-decision-for="ep"] [data-note-text]').fill('改用新版查詢');
    await page.locator('.api-detail-title').click();
    await page.locator('[data-api-decision-for="ep"] .note-editor[data-note-filled]').waitFor();
    // Following the conflict from the progress panel lands on the API.
    await page.locator('.page-tab[data-page="screens"]').click();
    await page.locator('.progress-button').click();
    await page.locator('[data-api-conflict-link="ep"]').click();
    await page.locator('[data-api-detail="ep"]').waitFor();
    const md = await downloadMd(page);
    assert.match(md, /### 4\.\d+ \[REMOVE\]/);
    assert.match(md, /人類直接標注 `REMOVE`;推導狀態 `IN_USE`/);
    assert.match(md, /\| ` ep ` \| REMOVE \| IN_USE \|/);
    assert.match(md, /` 已有替代功能（REPLACED） ` \| ` 改用新版查詢 `/);
    assert.deepEqual(requests, []);
  } finally {
    await browser.close();
  }
});

test('R77 marks held only by this browser are flagged on the download button and asked about once on leaving', async () => {
  const { browser, page } = await open();
  try {
    // Headless Chromium shows no beforeunload dialog, so the event is dispatched directly:
    // a cancelled event is the browser's question before leaving.
    const leave = () =>
      page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
    const download = page.locator('[data-md-export]');
    assert.equal(await download.getAttribute('data-unsaved'), 'false');
    assert.equal(await leave(), false);
    await openScreen(page, 'a');
    await radio(page, 'a', 'KEEP').click();
    assert.equal(await download.getAttribute('data-unsaved'), 'true');
    await page.locator('.save-menu > summary').click();
    assert.match(await page.locator('.save-panel').innerText(), /尚未下載過 md/);
    await page.keyboard.press('Escape');
    await downloadMd(page);
    assert.equal(await download.getAttribute('data-unsaved'), 'false');
    assert.equal(await leave(), false);
    await page.locator('.save-menu > summary').click();
    assert.match(await page.locator('.save-panel .last-export').innerText(), /上次下載 md：/);
    await page.keyboard.press('Escape');
    // The same marks after a reload are known to be in the downloaded md.
    await page.reload();
    await page.locator('#app[data-ready="true"]').waitFor();
    assert.equal(await download.getAttribute('data-unsaved'), 'false');
    await openScreen(page, 'a');
    await radio(page, 'a', 'REMOVE').click();
    assert.equal(await download.getAttribute('data-unsaved'), 'true');
    assert.equal(await leave(), true);
    // Asked once: leaving again goes without a second question.
    assert.equal(await leave(), false);
  } finally {
    await browser.close();
  }
});
