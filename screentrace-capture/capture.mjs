import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const [targetArg, outputArg] = process.argv.slice(2);
if (!targetArg) throw new Error('Usage: node capture.mjs <target-project> [output-directory]');
const target = resolve(targetArg), frontend = join(target, 'frontend'), output = resolve(outputArg || join(target, '.screentrace'));
const vite = join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), shots = join(output, 'screenshots');
if (!existsSync(vite)) throw new Error(`Vite was not found: ${vite}`);
mkdirSync(shots, { recursive: true });
const routes = [...new Set([...readFileSync(join(frontend, 'src', 'App.tsx'), 'utf8').matchAll(/path="([^"]+)"/g)].map(m => m[1]))].filter(x => x !== '*');
const wait = ms => new Promise(done => setTimeout(done, ms));
async function ready() { try { return (await fetch('http://127.0.0.1:4173/')).ok; } catch { return false; } }
const fileFor = path => `${(path === '/' ? 'home' : path.slice(1)).replaceAll('/', '__').replace(/[:?=&]/g, '_')}.png`;
const concrete = path => path.replace(/:id\b/g, 'preview').replace(/:requestToken\b/g, 'preview-token');
const roleFor = path => (/^\/(business|service|settings)/.test(path) || path.includes('/reservation/manage') || path.includes('/reservation/today/manage')) ? 'business' : (/^\/(login|register|forgot-password|force-change-password|$)/.test(path) ? 'anonymous' : 'customer');
const user = role => role === 'business'
  ? { role: 'ROLE_BUSINESS', username: '示範商家', email: 'merchant@preview.local', emailVerified: true, business: { id: 1, name: '示範預約店', category: '美容服務', phone: '02-5555-0101', address: '台北市示範路 1 號', slotInterval: 30 } }
  : role === 'customer' ? { role: 'ROLE_USER', username: '示範客戶', email: 'customer@preview.local', emailVerified: true } : null;
function response(url, role) {
  const me = user(role); let data = [];
  if (url.pathname === '/api/me') data = me;
  else if (url.pathname === '/api/session') data = { timeoutSeconds: 1800, warningSeconds: 120 };
  else if (url.pathname === '/api/dashboard') data = { reservationCount: 2, upcomingReservationCount: 1 };
  else if (url.pathname === '/api/notifications/unread-count') data = { count: 0 };
  else if (url.pathname.includes('/preferences')) data = { email: me?.email || 'preview@local', emailVerified: true, emailNewReservation: true, emailStatusChanged: true, emailUpcomingReminder: false };
  else if (url.pathname.includes('/slot/default')) data = { defaultInterval: 30, weeklySlots: [] };
  else if (url.pathname.includes('/query')) data = { items: [], content: [], totalPages: 0, totalElements: 0, page: 0 };
  else if (url.pathname.endsWith('/category')) data = ['美容服務', '餐飲服務'];
  return { data, token: 'preview-token' };
}
const viteProcess = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { cwd: frontend, stdio: 'ignore' });
try {
  for (let i = 0; i < 40 && !(await ready()); i++) await wait(250);
  if (!(await ready())) throw new Error('Vite preview did not start on port 4173.');
  const browser = await chromium.launch({ headless: true }); const manifest = {}, interactions = {}, failures = [];
  try {
    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage(), role = roleFor(route), file = fileFor(route);
      try {
        await page.route('**/api/**', async handler => handler.fulfill({ status: 200, contentType: 'application/json', headers: { 'set-cookie': 'XSRF-TOKEN=preview-token; Path=/' }, body: JSON.stringify(response(new URL(handler.request().url()), role)) }));
        await page.goto(`http://127.0.0.1:4173${concrete(route)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(800);
        interactions[route] = await page.locator('a[href], button').evaluateAll(items => {
          const normalize = href => { try { const url = new URL(href, window.location.href); return url.origin === window.location.origin ? url.pathname : null; } catch { return null; } };
          return items.map(item => {
            const box = item.getBoundingClientRect(), style = getComputedStyle(item), href = item instanceof HTMLAnchorElement ? item.href : null;
            const css = Object.fromEntries(['display', 'position', 'width', 'height', 'padding', 'margin', 'color', 'backgroundColor', 'border', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'cursor', 'opacity'].map(property => [property, style[property]]));
            return { type: item.tagName === 'A' ? 'LINK' : 'BUTTON', label: (item.getAttribute('aria-label') || item.textContent || '').replace(/\s+/g, ' ').trim(), target: href ? normalize(href) : null, visible: style.visibility !== 'hidden' && style.display !== 'none', bounds: { x: box.left + window.scrollX, y: box.top + window.scrollY, width: box.width, height: box.height }, css };
          }).filter(item => item.visible && item.label && item.bounds.width > 0 && item.bounds.height > 0);
        });
        interactions[route] = { width: await page.evaluate(() => document.documentElement.scrollWidth), height: await page.evaluate(() => document.documentElement.scrollHeight), items: interactions[route] };
        await page.screenshot({ path: join(shots, file), fullPage: true, timeout: 30000 });
        manifest[route] = `screenshots/${file}`;
        writeFileSync(join(shots, 'manifest.json'), JSON.stringify(manifest, null, 2));
        writeFileSync(join(shots, 'interactions.json'), JSON.stringify(interactions, null, 2));
        console.log(`Captured ${route}`);
      } catch (error) {
        failures.push({ route, error: error.message });
        console.error(`Failed ${route}: ${error.message}`);
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    writeFileSync(join(shots, 'manifest.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(shots, 'interactions.json'), JSON.stringify(interactions, null, 2));
    if (failures.length) writeFileSync(join(shots, 'capture-errors.json'), JSON.stringify(failures, null, 2));
  }
  if (failures.length) throw new Error(`Runtime capture failed for ${failures.length} route(s). See ${join(shots, 'capture-errors.json')}`);
} finally { viteProcess.kill(); }
