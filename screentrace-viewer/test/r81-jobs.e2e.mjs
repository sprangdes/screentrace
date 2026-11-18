import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '../../screentrace-capture/node_modules/playwright/index.mjs';
import { fixture, fileFixture } from './fixture.mjs';
import { addJobs } from './r81-jobs-fixture.mjs';

test('R81 API page lists background jobs after the APIs, with timing, calls and publishers', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(await fileFixture(addJobs(fixture())));
    await page.locator('.page-tab[data-page="api"]').click();
    const group = page.locator('[data-job-group]');
    assert.match(await group.locator('.api-group-header').innerText(), /系統自動作業\s*3/);
    // APIs stay counted on their own.
    assert.match(await page.locator('.api-heading h1').innerText(), /API\s*2/);
    const sweep = page.locator('[data-job-row="job-sweep"]');
    assert.match(await sweep.innerText(), /排程[\s\S]*每 5 分鐘[\s\S]*Jobs\.sweep\(\)/);
    await sweep.click();
    const detail = page.locator('[data-job-detail="job-sweep"]');
    assert.match(await detail.innerText(), /執行時機：每 5 分鐘/);
    assert.match(await detail.innerText(), /@Scheduled\(cron = "0 \*\/5 \* \* \* \*"\)/);
    assert.match(await detail.innerText(), /Orders#complete/);
    await page.locator('[data-job-row="job-created"]').click();
    assert.match(
      await page
        .locator('[data-job-detail="job-created"] [data-api-section="job-publishers"]')
        .innerText(),
      /Orders#place[\s\S]*src\/Orders\.java:4/,
    );
    await page.locator('[data-job-row="job-warm"]').click();
    assert.match(await page.locator('[data-job-note]').innerText(), /可能被設定檔或環境變數覆寫/);
    // Jobs are not APIs: the attention filter hides them, a search finds them.
    await page.locator('[data-api-filter="ATTENTION"]').click();
    assert.equal(await page.locator('[data-job-group]').count(), 0);
    await page.locator('[data-api-filter="ALL"]').click();
    await page.locator('.api-heading input[type="search"]').fill('OrderCreated');
    assert.equal(await page.locator('[data-job-row]').count(), 1);
    assert.equal(await page.locator('.api-row:not(.api-job-row)').count(), 0);
  } finally {
    await browser.close();
  }
});
