import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '../../screentrace-capture/node_modules/playwright/index.mjs';
import { fixture, fileFixture } from './fixture.mjs';
import { addStates } from './r82-states-fixture.mjs';

test('R82 API page shows each state, who sets each value, and links both ways', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const data = addStates(fixture());
    // R95: the frontend writes CANCELLED two ways.
    const handler = data.graph.nodes.find((n) => n.id === 'cancel-handler');
    const rows = JSON.parse(handler.attributes.stateChanges);
    rows[0].labelWords = [
      { text: '已取消', source: { file: 'src/status.ts', line: 3 } },
      { text: '取消', source: { file: 'src/Filter.tsx', line: 8 } },
    ];
    handler.attributes.stateChanges = JSON.stringify(rows);
    await page.goto(await fileFixture(data));
    await page.locator('.page-tab[data-page="api"]').click();
    const row = page.locator('[data-state-row="Status"]');
    assert.match(
      await row.innerText(),
      /3 種[\s\S]*PENDING、已確認（CONFIRMED）、已取消（CANCELLED）/,
    );
    await row.click();
    const detail = page.locator('[data-state-detail="Status"]');
    assert.match(
      await detail.locator('[data-state-value="PENDING"]').innerText(),
      /找不到設成這個值的地方/,
    );
    assert.match(
      await detail.locator('[data-state-value="CONFIRMED"]').innerText(),
      /系統自動作業 Jobs\.confirm\(\)/,
    );
    assert.match(await detail.locator('[data-state-value=""]').innerText(), /值由變數 next 決定/);
    // R95: every word the frontend uses, with where it is written.
    assert.match(
      await detail.locator('[data-state-words="CANCELLED"]').innerText(),
      /前端有 2 種寫法：「已取消」（src\/status\.ts:3）、「取消」（src\/Filter\.tsx:8）/,
    );
    // From the state to the API, and from the API's detail back to the state.
    await detail.locator('[data-state-value="CANCELLED"] [data-state-goto="ep"]').click();
    const changes = page.locator('[data-api-detail="ep"] [data-api-section="state-changes"]');
    assert.match(await changes.innerText(), /Status\.status[\s\S]*→ 已取消（CANCELLED）/);
    assert.match(await changes.innerText(), /→ 無法確定/);
    await changes.locator('[data-state-goto="state:Status"]').first().click();
    assert.equal(await page.locator('[data-state-detail="Status"]').count(), 1);
    // A job's detail lists its changes too.
    await page.locator('[data-job-row="confirm-job"]').click();
    assert.match(
      await page
        .locator('[data-job-detail="confirm-job"] [data-api-section="state-changes"]')
        .innerText(),
      /→ 已確認（CONFIRMED）/,
    );
  } finally {
    await browser.close();
  }
});
