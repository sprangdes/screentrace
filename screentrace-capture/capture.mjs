import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const [targetArg, outputArg] = process.argv.slice(2);
if (!targetArg) throw new Error('Usage: node capture.mjs <target-project> [output-directory]');
const target = resolve(targetArg), frontend = join(target, 'frontend'), output = resolve(outputArg || join(target, '.screentrace'));
const vite = join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), shots = join(output, 'screenshots'), previews = join(output, 'static-preview');
if (!existsSync(vite)) throw new Error(`Vite was not found: ${vite}`);
mkdirSync(shots, { recursive: true });
mkdirSync(previews, { recursive: true });
const graph = JSON.parse(readFileSync(join(output, 'application-graph.json'), 'utf8'));
const screenIdByRoute = new Map(graph.nodes.filter(node => node.type === 'SCREEN' && node.attributes?.route).map(node => [node.attributes.route, node.id]));
const routes = [...new Set([...readFileSync(join(frontend, 'src', 'App.tsx'), 'utf8').matchAll(/path="([^"]+)"/g)].map(m => m[1]))].filter(x => x !== '*');
const wait = ms => new Promise(done => setTimeout(done, ms));
async function ready() { try { return (await fetch('http://127.0.0.1:4173/')).ok; } catch { return false; } }
const fileFor = path => `${(path === '/' ? 'home' : path.startsWith('/') ? path.slice(1) : path).replaceAll('/', '__').replace(/[:?=&]/g, '_')}.png`;
const concrete = path => path.replace(/:id\b/g, 'preview').replace(/:requestToken\b/g, 'preview-token');
const staticFileFor = key => `react-${key.replace(/[^a-z0-9-]/gi, '_')}.html`;
const explorationDate = (() => {
  const value = new Date();
  value.setDate(value.getDate() + 7);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
})();
const exploration = {
  business: { id: 1, name: 'ScreenTrace 示範店家' },
  service: { id: 101, name: 'ScreenTrace 示範服務', duration: 60, active: true },
  slots: [{ time: '10:00', available: true }, { time: '11:30', available: true }, { time: '14:00', available: false }],
  date: explorationDate
};
const businessUser = { role: 'ROLE_BUSINESS', username: '示範商家', email: 'merchant@preview.local', emailVerified: true, business: { id: 1, name: '示範預約店', category: '美容服務', phone: '02-5555-0101', address: '台北市示範路 1 號', slotInterval: 30 } };
const customerUser = { role: 'ROLE_USER', username: '示範客戶', email: 'customer@preview.local', emailVerified: true };
const roleFor = path => {
  if (/^\/(business|service|settings)/.test(path) || path.includes('/reservation/manage') || path.includes('/reservation/today/manage')) return 'business';
  if (/^\/(login|register|forgot-password|force-change-password|$)/.test(path)) return 'anonymous';
  return 'customer';
};
const user = role => {
  if (role === 'business') return businessUser;
  if (role === 'customer') return customerUser;
  return null;
};
function response(url, role) {
  const me = user(role); let data = [];
  if (url.pathname === '/api/me') data = me;
  else if (url.pathname === '/api/session') data = { timeoutSeconds: 1800, warningSeconds: 120 };
  else if (url.pathname === '/api/dashboard') data = { reservationCount: 2, upcomingReservationCount: 1 };
  else if (url.pathname === '/api/notifications/unread-count') data = { count: 0 };
  else if (url.pathname.includes('/preferences')) data = { email: me?.email || 'preview@local', emailVerified: true, emailNewReservation: true, emailStatusChanged: true, emailUpcomingReminder: false };
  else if (url.pathname.includes('/slot/default')) data = { defaultInterval: 30, weeklySlots: [] };
  else if (url.pathname === '/api/preferred-businesses' || url.pathname === '/api/businesses') data = [exploration.business];
  else if (/^\/api\/businesses\/[^/]+\/services$/.test(url.pathname)) data = [exploration.service];
  else if (url.pathname === '/api/reservations/disabled-dates') data = [];
  else if (url.pathname === '/api/reservations/slots') data = exploration.slots;
  else if (url.pathname === '/api/reservations' && url.searchParams.size === 0) data = { id: 1, businessName: exploration.business.name, title: exploration.service.name, reservationDate: exploration.date, startTime: exploration.slots[0].time, endTime: '11:00', status: 'PENDING' };
  else if (url.pathname.includes('/query')) data = { items: [], content: [], totalPages: 0, totalElements: 0, page: 0 };
  else if (url.pathname.endsWith('/category')) data = ['美容服務', '餐飲服務'];
  return { data, token: 'preview-token' };
}
const textOf = locator => locator.textContent().then(value => (value || '').replace(/\s+/g, ' ').trim());
async function waitForEnabled(page, matcher) {
  await page.waitForFunction(pattern => [...document.querySelectorAll('button')].some(button => !button.disabled && new RegExp(pattern, 'i').test((button.textContent || '').replace(/\s+/g, ' ').trim())), matcher.source, { timeout: 5000 });
  return page.locator('button:not([disabled])').filter({ hasText: matcher }).first();
}
async function selectFirstRadio(page, name) {
  const radio = page.locator(`input[type="radio"][name="${name}"]`).first();
  await radio.waitFor({ state: 'attached', timeout: 5000 });
  await radio.check({ force: true });
}
async function completeDateSelection(page) {
  const date = page.locator('input[type="date"], input#booking-date').first();
  if (!await date.count()) return false;
  await date.evaluate((input, value) => {
    const picker = input._flatpickr;
    if (picker?.setDate) {
      picker.setDate(value, true);
      return;
    }
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }, exploration.date);
  return true;
}
async function exploreWorkflow(page, route, screenId, captureState) {
  const nextPattern = /^(下一步|next|continue)/i;
  if (!await page.locator('button').filter({ hasText: nextPattern }).count()) return [];
  const selectedRadioGroups = new Set();
  const states = [];
  try {
    for (let pass = 0; pass < 4; pass++) {
      const radioNames = await page.locator('input[type="radio"][name]').evaluateAll(items => [...new Set(items.map(item => item.getAttribute('name')).filter(Boolean))]);
      const pending = radioNames.filter(name => !selectedRadioGroups.has(name));
      if (!pending.length) break;
      for (const name of pending) {
        await selectFirstRadio(page, name);
        selectedRadioGroups.add(name);
        await page.waitForTimeout(250);
      }
    }
    if (!selectedRadioGroups.size) return [];
    const firstNext = await waitForEnabled(page, nextPattern);
    const firstLabel = await textOf(firstNext);
    await firstNext.click();
    await page.waitForTimeout(300);
    const stepTwoKey = `${screenId}--flow-step-2`;
    await captureState(stepTwoKey);
    states.push({ id: stepTwoKey, name: `${route} — ${await workflowTitle(page, '步驟 2')}`, route: `${route}#step-2`, label: '步驟 2', sourceScreenId: screenId, transitionLabel: firstLabel });

    if (!await completeDateSelection(page)) return states;
    await page.waitForTimeout(300);
    const slot = page.locator('button[role="radio"]:not([disabled])').first();
    if (!await slot.count()) return states;
    await slot.click();
    const secondNext = await waitForEnabled(page, nextPattern);
    const secondLabel = await textOf(secondNext);
    await secondNext.click();
    await page.waitForTimeout(300);
    const stepThreeKey = `${screenId}--flow-step-3`;
    await captureState(stepThreeKey);
    states.push({ id: stepThreeKey, name: `${route} — ${await workflowTitle(page, '步驟 3')}`, route: `${route}#step-3`, label: '步驟 3', sourceScreenId: screenId, transitionLabel: secondLabel });
    return states;
  } catch (error) {
    console.warn(`Workflow exploration skipped for ${route}: ${error.message}`);
    return states;
  }
}
async function workflowTitle(page, fallback) {
  const heading = page.locator('main h1, h1').first();
  return await heading.count() ? await textOf(heading) : fallback;
}
async function staticDocument(page) {
  return page.evaluate(async () => {
    const root = document.documentElement.cloneNode(true);
    const base64 = buffer => {
      let result = '';
      for (let offset = 0; offset < buffer.length; offset += 0x8000) result += String.fromCharCode(...buffer.subarray(offset, offset + 0x8000));
      return btoa(result);
    };
    const asDataUrl = async url => {
      if (!url || url.startsWith('data:') || url.startsWith('#')) return url;
      try {
        const response = await fetch(url);
        if (!response.ok) return url;
        const type = response.headers.get('content-type') || 'application/octet-stream';
        return `data:${type};base64,${base64(new Uint8Array(await response.arrayBuffer()))}`;
      } catch {
        return url;
      }
    };
    const inlineUrls = async (css, base) => {
      const matches = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)];
      let result = '', cursor = 0;
      for (const match of matches) {
        result += css.slice(cursor, match.index);
        const value = match[2], absolute = value.startsWith('data:') || value.startsWith('#') ? value : new URL(value, base).href;
        result += `url("${await asDataUrl(absolute)}")`;
        cursor = match.index + match[0].length;
      }
      return result + css.slice(cursor);
    };
    for (const link of [...root.querySelectorAll('link[rel~="stylesheet"]')]) {
      try {
        const css = await (await fetch(link.href)).text();
        const style = document.createElement('style');
        style.textContent = await inlineUrls(css, link.href);
        link.replaceWith(style);
      } catch {
        // Keep a stylesheet link only when it cannot be fetched from the isolated preview server.
      }
    }
    for (const style of [...root.querySelectorAll('style')]) style.textContent = await inlineUrls(style.textContent, location.href);
    for (const image of [...root.querySelectorAll('img[src],source[src]')]) image.src = await asDataUrl(image.src);
    for (const control of [...root.querySelectorAll('input,textarea,select')]) {
      if ('value' in control) control.setAttribute('value', control.value);
      if ('checked' in control) control.toggleAttribute('checked', control.checked);
    }
    root.querySelectorAll('script,link[rel="modulepreload"],link[rel="preload"],link[rel~="icon"]').forEach(node => node.remove());
    return '<!doctype html>\n' + root.outerHTML;
  });
}
const viteProcess = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { cwd: frontend, stdio: 'ignore' });
try {
  let attempts = 40;
  while (attempts > 0 && !(await ready())) {
    await wait(250);
    attempts--;
  }
  if (!(await ready())) throw new Error('Vite preview did not start on port 4173.');
  const browser = await chromium.launch({ headless: true }); const manifest = {}, staticManifest = {}, interactions = {}, failures = [], flowStates = [];
  try {
    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage(), role = roleFor(route), file = fileFor(route), screenId = screenIdByRoute.get(route) || route;
      try {
        await page.route('**/api/**', async handler => handler.fulfill({ status: 200, contentType: 'application/json', headers: { 'set-cookie': 'XSRF-TOKEN=preview-token; Path=/' }, body: JSON.stringify(response(new URL(handler.request().url()), role)) }));
        await page.goto(`http://127.0.0.1:4173${concrete(route)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(800);
        const captureState = async (key, screenshotFile = fileFor(key)) => {
          const items = await page.locator('a[href], button').evaluateAll(items => {
            const normalize = href => { try { const url = new URL(href, window.location.href); return url.origin === window.location.origin ? url.pathname : null; } catch { return null; } };
            return items.map((item, index) => {
              const box = item.getBoundingClientRect(), style = getComputedStyle(item), href = item instanceof HTMLAnchorElement ? item.href : null;
              const css = Object.fromEntries(['display', 'position', 'width', 'height', 'padding', 'margin', 'color', 'backgroundColor', 'border', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'cursor', 'opacity'].map(property => [property, style[property]]));
              const visible = style.visibility !== 'hidden' && style.display !== 'none' && Number.parseFloat(style.opacity) > 0 && box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.left < window.innerWidth;
              return { id: `runtime-component-${index}`, type: item.tagName === 'A' ? 'LINK' : 'BUTTON', label: (item.getAttribute('aria-label') || item.textContent || '').replace(/\s+/g, ' ').trim(), target: href ? normalize(href) : null, visible, bounds: { x: box.left + window.scrollX, y: box.top + window.scrollY, width: box.width, height: box.height }, css };
            }).filter(item => item.visible && item.label && item.bounds.width > 0 && item.bounds.height > 0);
          });
          interactions[key] = { width: await page.evaluate(() => document.documentElement.scrollWidth), height: await page.evaluate(() => document.documentElement.scrollHeight), items };
          const staticFile = staticFileFor(key);
          writeFileSync(join(previews, staticFile), await staticDocument(page));
          staticManifest[key] = `static-preview/${staticFile}`;
          await page.screenshot({ path: join(shots, screenshotFile), fullPage: true, timeout: 30000 });
          manifest[key] = `screenshots/${screenshotFile}`;
        };
        await captureState(screenId, file);
        interactions[route] = interactions[screenId];
        const states = await exploreWorkflow(page, route, screenId, captureState);
        states.forEach((state, index) => flowStates.push({ ...state, from: index === 0 ? screenId : states[index - 1].id }));
        writeFileSync(join(previews, 'manifest.json'), JSON.stringify(staticManifest, null, 2));
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
    writeFileSync(join(previews, 'manifest.json'), JSON.stringify(staticManifest, null, 2));
    writeFileSync(join(output, 'flow-states.json'), JSON.stringify({ version: '1', states: flowStates }, null, 2));
    if (failures.length) writeFileSync(join(shots, 'capture-errors.json'), JSON.stringify(failures, null, 2));
  }
  if (failures.length) throw new Error(`Runtime capture failed for ${failures.length} route(s). See ${join(shots, 'capture-errors.json')}`);
} finally { viteProcess.kill(); }
