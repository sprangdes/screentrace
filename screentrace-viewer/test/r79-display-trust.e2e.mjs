// R79 (ADR 0157): display fields are markable from the panel and the preview; the preview can show
// what is demonstration data and what only appears under a condition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '../../screentrace-capture/node_modules/playwright/index.mjs';
import { fileFixture, fixture, node } from './fixture.mjs';
import { openScreen } from './decision-controls.mjs';

function data() {
  const d = fixture();
  d.graph.nodes.push(
    node('city', 'COMPONENT', '城市', {
      kind: 'DISPLAY_FIELD',
      tag: 'td',
      expression: '${owner.city}',
      property: 'owner.city',
      displayName: '城市',
      labelSource: 'tableHeader',
      repeated: 'true',
    }),
  );
  d.graph.relationships.push({ id: 'c-city', type: 'CONTAINS', from: 'a', to: 'city' });
  d.documents.a =
    '<html><body><button id="shared">共用按鈕</button>' +
    '<table><tr><th>城市</th></tr><tr data-st-demo-row="owners"><td id="city">台北</td></tr></table>' +
    '<p id="admin" data-st-conditional="true" data-st-condition="[&quot;${admin}&quot;]">管理員才看得到</p>' +
    '<p id="plain">一般文字</p></body></html>';
  d.preview.elements = [
    {
      graphScreenId: 'a',
      graphComponentId: 'city',
      componentResolution: 'INFERRED',
      path: '#city',
      tag: 'td',
      text: '台北',
      bounds: { x: 10, y: 40, width: 80, height: 20 },
      styleId: 's',
    },
  ];
  d.preview.styles = { s: {} };
  return d;
}

test('R79 a display field is listed with the fields, found from the preview, and marked like a field', async () => {
  const browser = await chromium.launch(),
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
  page.setDefaultTimeout(5000);
  try {
    await page.goto(await fileFixture(data()));
    await page.locator('#app[data-ready="true"]').waitFor();
    await openScreen(page, 'a');
    await page.locator('[data-screen-panel="a"] .panel-fields > summary').click();
    const row = page.locator('[data-component-row="city"]');
    assert.match(await row.innerText(), /城市[\s\S]*顯示欄位/);
    await page.frameLocator('.preview iframe').locator('#city').click();
    await page.locator('[data-component-row="city"].is-highlighted').waitFor();
    await page
      .locator('.decision-switch[data-component-id="city"] [data-decision="REMOVE"]')
      .click();
    assert.equal(
      await page
        .frameLocator('.preview iframe')
        .locator('#city')
        .getAttribute('data-review-status'),
      'REMOVE',
    );
  } finally {
    await browser.close();
  }
});

test('R79 the preview marks demo data and conditional content only while asked, with a legend', async () => {
  const browser = await chromium.launch(),
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
  page.setDefaultTimeout(5000);
  try {
    await page.goto(await fileFixture(data()));
    await page.locator('#app[data-ready="true"]').waitFor();
    await openScreen(page, 'a');
    const frame = page.frameLocator('.preview iframe'),
      toggle = page.locator('[data-trust-toggle]');
    await frame.locator('#plain').waitFor();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('[data-trust-legend]').isVisible(), false);
    assert.equal(await frame.locator('[data-st-viewer-trust]').count(), 0);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('[data-trust-legend]').innerText(), /示範資料[\s\S]*依條件/);
    assert.equal(await frame.locator('#city').getAttribute('data-st-viewer-trust'), 'demo');
    assert.equal(
      await frame.locator('tr[data-st-demo-row]').getAttribute('data-st-viewer-trust'),
      'demo',
    );
    assert.equal(await frame.locator('#admin').getAttribute('data-st-viewer-trust'), 'conditional');
    assert.equal(await frame.locator('#plain').getAttribute('data-st-viewer-trust'), null);
    const outline = await frame
      .locator('#admin')
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    assert.equal(outline, 'dashed');
    await toggle.click();
    assert.equal(await frame.locator('[data-st-viewer-trust]').count(), 0);
    assert.equal(await page.locator('[data-trust-legend]').isVisible(), false);
  } finally {
    await browser.close();
  }
});
