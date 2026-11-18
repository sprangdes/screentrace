// R78 (ADR 0156): the feature map, feature decisions inherited by screens, and md format 5 from the report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '../../screentrace-capture/node_modules/playwright/index.mjs';
import { fileFixture } from './fixture.mjs';
import { featureFixture } from './r78-feature-fixture.mjs';

function reportData() {
  const data = featureFixture();
  const screens = data.graph.nodes.filter((n) => n.type === 'SCREEN');
  data.preview.screens = screens.map((n) => ({ graphScreenId: n.id, width: 1280, height: 900 }));
  for (const n of screens) data.documents[n.id] = `<html><body>${n.name}</body></html>`;
  return data;
}
async function open() {
  const browser = await chromium.launch(),
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
      acceptDownloads: true,
    }),
    file = await fileFixture(reportData()),
    requests = [];
  page.setDefaultTimeout(5000);
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
  return { browser, page, requests };
}

test('R78 the feature map lists features and flows, and a removed feature carries its screens', async () => {
  const { browser, page, requests } = await open();
  try {
    await page.locator('[data-list-mode="features"]').click();
    const map = page.locator('[data-feature-map]');
    await map.waitFor();
    assert.deepEqual(
      await map.locator('.fm-feature').evaluateAll((items) => items.map((i) => i.dataset.feature)),
      ['url:/vets', 'class:demo.OwnerController', 'other'],
    );
    assert.deepEqual(
      await page
        .locator('[data-feature="class:demo.OwnerController"] [data-feature-screen]')
        .evaluateAll((items) => items.map((i) => i.dataset.featureScreen)),
      ['list', 'edit', 'done'],
    );
    assert.match(
      await page.locator('[data-feature="class:demo.OwnerController"] .fm-basis').innerText(),
      /處理程式類別：demo\.OwnerController/,
    );
    await page
      .locator('[data-feature="url:/vets"] .decision-option[data-decision="REMOVE"]')
      .click();
    const chip = page.locator('[data-feature-screen="vets"]');
    assert.equal(await chip.getAttribute('data-decision'), 'REMOVE');
    assert.equal(await chip.getAttribute('data-inherited'), 'true');
    assert.match(await chip.innerText(), /隨功能移除/);
    // The sidebar groups screens by feature and marks the inherited decision.
    assert.equal(
      await page.locator('.screen-list [data-screen-list="vets"]').getAttribute('data-decision'),
      'REMOVE',
    );
    assert.equal(
      await page.locator('.screen-list [data-screen-list="vets"]').getAttribute('data-inherited'),
      'true',
    );
    await page.locator('.progress-button').click();
    assert.match(
      await page.locator('[data-progress-features]').innerText(),
      /保留 0 · 移除 1 · 畫面隨功能決定 2/,
    );
    await page.keyboard.press('Escape');
    // A screen's own decision wins over its feature's.
    await chip.click();
    await page.locator('[data-screen-panel="vets"] [data-screen-inherited="REMOVE"]').waitFor();
    await page.locator('.panel-header .decision-switch [data-decision="KEEP"]').click();
    assert.equal(await page.locator('[data-screen-inherited]').count(), 0);
    await page.locator('.preview-back, [data-back], button:has-text("返回畫布")').first().click();
    await page.locator('[data-feature-map]').waitFor();
    assert.equal(
      await page.locator('[data-feature-screen="vets"]').getAttribute('data-inherited'),
      null,
    );
    assert.deepEqual(requests, []);
  } finally {
    await browser.close();
  }
});

test('R78 a feature note and decision reach the downloaded md as format 5', async () => {
  const { browser, page } = await open();
  try {
    await page.locator('[data-list-mode="features"]').click();
    const card = page.locator('[data-feature="url:/vets"]');
    await card.locator('.decision-option[data-decision="REMOVE"]').click();
    await card.locator('[data-note-toggle]').click();
    await card.locator('[data-note-reason]').selectOption('DISCONTINUED');
    await card.locator('[data-note-text]').fill('獸醫功能停用');
    await page.locator('.feature-map-head h1').click();
    await page.locator('[data-feature="url:/vets"] .note-editor[data-note-filled]').waitFor();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-md-export]').click(),
    ]);
    const md = await readFile(await download.path(), 'utf8');
    assert.match(md, /"format_version":5/);
    assert.match(md, /"feature_decisions":\{"url:\/vets":"REMOVE"\}/);
    assert.match(md, /` 業務單位確認已停用（DISCONTINUED） ` \| ` 獸醫功能停用 `/);
    assert.match(md, /## 8\. 功能與流程/);
    assert.match(md, /## 11\. 移除影響範圍/);
  } finally {
    await browser.close();
  }
});
