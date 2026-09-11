#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const [targetArg, outputArg] = process.argv.slice(2);
if (!targetArg) throw new Error('Usage: node scripts/capture-runtime.mjs <target-project> [output-directory]');
const target = resolve(targetArg);
const frontend = join(target, 'frontend');
const output = resolve(outputArg || join(target, '.screentrace'));
const screenshots = join(output, 'screenshots');
const vite = join(frontend, 'node_modules', 'vite', 'bin', 'vite.js');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(vite) || !existsSync(chrome)) throw new Error('Vite dependencies or Google Chrome are unavailable.');
mkdirSync(screenshots, { recursive: true });

const detectedPaths = [...new Set([...readFileSync(join(frontend, 'src', 'App.tsx'), 'utf8').matchAll(/path="([^"]+)"/g)].map(m => m[1]))]
  .filter(path => path !== '*');
const paths = process.env.SCREENTRACE_CAPTURE_LIMIT ? detectedPaths.slice(0, Number(process.env.SCREENTRACE_CAPTURE_LIMIT)) : detectedPaths;
const routeFor = path => path.replace(/:id\b/g, 'preview').replace(/:requestToken\b/g, 'preview-token');
const fileFor = path => (path === '/' ? 'home' : path.slice(1)).replaceAll('/', '__').replace(/[:?=&]/g, '_') + '.png';
const userFor = referer => {
  const route = new URL(referer || 'http://localhost/').pathname;
  const business = route.startsWith('/business') || route.startsWith('/service') || route.includes('/reservation/manage');
  return business
    ? { role: 'ROLE_BUSINESS', username: '示範商家', email: 'merchant@preview.local', emailVerified: true, business: { id: 1, name: '示範預約店', category: '美容服務', phone: '02-5555-0101', address: '台北市示範路 1 號', slotInterval: 30 } }
    : { role: 'ROLE_USER', username: '示範客戶', email: 'customer@preview.local', emailVerified: true };
};
const api = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:8080');
  const me = userFor(req.headers.referer);
  let data = [];
  if (url.pathname === '/api/me') data = me;
  else if (url.pathname === '/api/session') data = { timeoutSeconds: 1800, warningSeconds: 120 };
  else if (url.pathname === '/api/dashboard') data = { reservationCount: 2, upcomingReservationCount: 1 };
  else if (url.pathname === '/api/notifications/unread-count') data = { count: 0 };
  else if (url.pathname.includes('/preferences')) data = { email: me.email, emailVerified: true, emailNewReservation: true, emailStatusChanged: true, emailUpcomingReminder: false };
  else if (url.pathname.includes('/slot/default')) data = { defaultInterval: 30, weeklySlots: [] };
  else if (url.pathname.includes('/query')) data = { items: [], content: [], totalPages: 0, totalElements: 0, page: 0 };
  else if (url.pathname.includes('/categories') || url.pathname.endsWith('/category')) data = ['美容服務', '餐飲服務'];
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Set-Cookie', 'XSRF-TOKEN=preview-token; Path=/');
  res.end(JSON.stringify({ data, token: 'preview-token' }));
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const available = async () => { try { return (await fetch('http://127.0.0.1:5173/')).ok; } catch { return false; } };

api.listen(8080, '127.0.0.1');
const viteProcess = spawn(process.execPath, [vite, '--host', '127.0.0.1'], { cwd: frontend, stdio: 'ignore' });
try {
  for (let i = 0; i < 40 && !(await available()); i++) await wait(250);
  if (!(await available())) throw new Error('Vite preview did not start on http://127.0.0.1:5173.');
  const profile = join(output, '.capture-chrome-profile');
  rmSync(profile, { recursive: true, force: true });
  const manifest = {};
  for (const route of paths) {
    const file = fileFor(route);
    const result = spawnSync(chrome, ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1024', '--virtual-time-budget=2500', `--user-data-dir=${profile}`, `--screenshot=${join(screenshots, file)}`, `http://127.0.0.1:5173${routeFor(route)}`], { timeout: 20000, killSignal: 'SIGKILL', stdio: 'ignore' });
    if (result.status !== 0 || !existsSync(join(screenshots, file))) throw new Error(`Capture failed for ${route}.`);
    manifest[route] = `screenshots/${file}`;
    console.log(`Captured ${route} -> ${file}`);
  }
  writeFileSync(join(screenshots, 'manifest.json'), JSON.stringify(manifest, null, 2));
} finally {
  viteProcess.kill();
  api.close();
}
