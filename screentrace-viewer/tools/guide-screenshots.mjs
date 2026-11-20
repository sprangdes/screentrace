// Screenshots for docs/USER_GUIDE.md, taken from a real ScreenTrace report through its own UI.
//
//   node screentrace-viewer/tools/guide-screenshots.mjs <report.html>
//
// The guide uses the report of the fictional demo insurance system "insure" (no real data). The
// report is opened offline in Playwright Chromium; any network request fails the run, and the
// images are checked for local path markers before they are written.
import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../../screentrace-capture/node_modules/playwright/index.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'docs/images/user-guide');
const shots = [
  'canvas.png',
  'search-url.png',
  'role-canvas.png',
  'zoom-focus.png',
  'screen-buttons.png',
  'progress-file.png',
  'progress-panel.png',
  'feature-map.png',
  'simulate-journey.png',
  'simulate-required.png',
  'simulate-choices.png',
  'role-page.png',
  'api-page.png',
  'help-popover.png',
];

async function main() {
  const report = process.argv[2];
  assert.ok(report, 'usage: node guide-screenshots.mjs <report.html>');
  const url = pathToFileURL(path.resolve(report)).href;
  await mkdir(output, { recursive: true });
  for (const name of await readdir(output))
    if (name.endsWith('.png') && !shots.includes(name)) await rm(path.join(output, name));
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  const forbidden = [os.homedir(), root, '/Users/', 'C:\\Users\\'].filter(Boolean);
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: 'zh-TW',
      timezoneId: 'Asia/Taipei',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        // Storage may be unavailable; nothing to clear then.
      }
    });
    const page = await context.newPage(),
      requests = [];
    page.on('request', (request) => {
      const target = request.url();
      if (target !== url && !/^(data|blob|about):/.test(target)) requests.push(target);
    });
    await page.goto(url);
    await page.locator('#app[data-ready="true"]').waitFor();
    await page.addStyleTag({
      content:
        '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
    });
    // During a page transition the leaving preview is still in the DOM: use the newest one.
    const frame = () => page.locator('.prototype-viewer iframe').last().contentFrame();
    const settle = async () => {
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await page.waitForTimeout(400);
    };
    const screenshot = async (name, keepPointer = false) => {
      if (!keepPointer) await page.mouse.move(1, 1);
      await settle();
      const bytes = await page.screenshot({ animations: 'disabled' });
      assert.ok(bytes.length > 1000, `${name} is unexpectedly small`);
      for (const value of forbidden)
        assert.ok(!bytes.includes(Buffer.from(value)), `${name} contains ${value}`);
      await writeFile(path.join(output, name), bytes);
      console.log('wrote', name);
    };
    const tab = (name) => page.locator(`.page-tab`, { hasText: name }).first().click();
    const present = async (on) => {
      const button = page.getByRole('button', { name: on ? '全螢幕預覽' : '結束全螢幕' });
      if (await button.count()) await button.first().click();
      await settle();
    };
    const toCanvas = async () => {
      await present(false);
      for (let i = 0; i < 3 && (await page.locator('.prototype-back').count()); i++) {
        await page.locator('.prototype-back').click();
        await settle();
      }
      await page.locator('.canvas[data-mode="overview"]').waitFor();
    };
    const open = async (name) => {
      await toCanvas();
      const card = page.locator('.screen-card').filter({
        has: page.locator('strong', { hasText: new RegExp(`^${name.replace(/[()（）]/g, '.')}$`) }),
      });
      // Enter opens a card wherever it sits on the canvas, even outside the visible part.
      await card.first().dispatchEvent('keydown', { key: 'Enter' });
      await page.locator('.prototype-viewer iframe').last().waitFor();
      await frame().locator('h1').first().waitFor();
      await settle();
    };
    const persona = (name) => page.locator('.persona-switch button', { hasText: name }).click();

    // 1. Canvas overview, split into role areas.
    await page.locator('.canvas[data-fitted="true"]').waitFor();
    await screenshot('canvas.png');
    // 2. Search by a real URL.
    await page
      .getByRole('searchbox', { name: '搜尋 URL 或畫面名稱' })
      .fill('/applications/7/payment');
    await page.locator('.screen-card.search-match').first().waitFor();
    await screenshot('search-url.png');
    await page.getByRole('button', { name: '清除搜尋' }).click();
    // 3. One role's flow on the canvas.
    await persona('一般用戶');
    await settle();
    await screenshot('role-canvas.png');
    await persona('不套用角色');
    await settle();
    // 4. A screen opened, with a relation line hovered.
    await open('adminDetail（核保中）');
    const line = page.locator('.focus-line-hit[data-kind="known"]').first();
    if (await line.count()) {
      const point = await line.evaluate((hit) => {
        const at = hit.getPointAtLength(hit.getTotalLength() * 0.5),
          box = hit.ownerSVGElement.getBoundingClientRect();
        return { x: box.left + at.x, y: box.top + at.y };
      });
      await page.mouse.move(point.x, point.y);
      await page.locator('.focus-tooltip:not([hidden])').waitFor();
    }
    await screenshot('zoom-focus.png', true);
    // 5. The screen's buttons in the side panel.
    const panel = page.locator('[data-screen-panel]').first();
    await panel.locator('.panel-buttons>summary').click();
    await screenshot('screen-buttons.png');
    // 6. The progress file prompt on the first mark.
    await panel.locator('.panel-header [data-decision="REMOVE"]').click();
    await page.locator('.save-menu[open]').waitFor();
    await screenshot('progress-file.png');
    await page.getByRole('button', { name: '稍後再說' }).click();
    await panel.locator('.panel-header [data-decision="KEEP"]').click();
    await page.locator('.progress-button').click();
    await page.locator('.progress-menu[open]').waitFor();
    await screenshot('progress-panel.png');
    await page.locator('.progress-button').click();
    // 7. The feature map, by role.
    await toCanvas();
    await page.locator('button[data-list-mode="features"]').click();
    await page.locator('.feature-map').waitFor();
    await screenshot('feature-map.png');
    await page.locator('.segmented button', { hasText: '清單' }).first().click();
    // 8. Typed data carried into the next screen.
    await open('form（填寫投保資料）');
    await present(true);
    const fill = async (name, value) => frame().locator(`[name="${name}"]`).fill(value);
    await fill('plate', 'ABC-1234');
    await fill('startDate', '2026-12-01');
    await fill('ownerName', '王小明');
    await fill('ownerId', 'A123456789');
    await fill('phone', '0912345678');
    await fill('email', 'ming@example.com');
    await frame()
      .getByRole('button', { name: /下一步，確認申請資料/ })
      .click();
    await frame().locator('h1', { hasText: '確認投保申請' }).waitFor();
    await screenshot('simulate-journey.png');
    // 9. A required box left unticked.
    await frame().getByRole('button', { name: '送出申請' }).click();
    await frame()
      .locator('[role="alert"]', { hasText: '請勾選此方塊' })
      .waitFor({ state: 'attached' });
    await page.locator('.prototype-status', { hasText: '請勾選' }).waitFor();
    await frame()
      .locator('input[type="checkbox"]')
      .first()
      .evaluate((box) => box.scrollIntoView({ block: 'center' }));
    await screenshot('simulate-required.png');
    // 10. A request with more than one destination.
    await open('error');
    await present(true);
    await frame().locator('a', { hasText: '返回' }).first().click();
    await page.locator('.simulation-picker').waitFor();
    await screenshot('simulate-choices.png');
    await page.keyboard.press('Escape');
    await toCanvas();
    // 11. The role page.
    await tab('角色');
    await page.locator('.persona-step-group').first().waitFor();
    await screenshot('role-page.png');
    // 12. The API page.
    await tab('API');
    await page.locator('[data-api-row]', { hasText: '/underwriting' }).first().click();
    await page.locator('[data-api-section="callers"]').waitFor();
    await screenshot('api-page.png');
    // 13. Help.
    await tab('畫面');
    await page.getByRole('button', { name: '重設畫布' }).click();
    await page.locator('.help-menu>summary').click();
    await page.locator('.help-menu[open]').waitFor();
    await screenshot('help-popover.png');
    assert.deepEqual(requests, [], 'the offline report must not make any network request');
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
